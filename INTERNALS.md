# Treem internals

This document explains how the library works from the inside. It walks through the full lifecycle: what the declarative API produces, what `run()` does with it, how reactivity is tracked, and what happens when an action fires.

---

## The two phases

Treem has a clean separation between two phases:

1. **Declaration** — calling `ref`, `calc`, `iff`, `set` builds a plain description of your app as a tree of JavaScript objects. No state exists yet, nothing is live.
2. **Instantiation** — calling `run(app)` reads that description, allocates real state, evaluates all formulas once, and returns a callable interface.

This separation means the declarative tree is static and reusable. You could call `run(app)` ten times and get ten completely independent instances.

---

## Running example

Every explanation below refers back to this small app. It is intentionally minimal — one piece of state, one derived value, one action with an argument:

```ts
const count  = ref<number>('count')
const step   = ref<number>('step')
const doubled = calc(n => n * 2, [count])

const store = run({
  [count]:  0,
  [step]:   1,
  doubled,
  inc: set({ [count]: calc((n, s) => n + s, [count, step]) }),
})
```

After each phase of `run()` you will see what the key internal variables actually contain for this app.

---

## Phase 1: The declarative API

### `ref`

```ts
const count = ref<number>('count')
```

`ref` creates two things:

- A **unique `Symbol`** (via `Symbol('count')`) that will be used as an object key to define/read this state slot. This symbol is added to the global `refSymbols` set so `run()` can recognise it later.
- A **marked node object** tagged with a private `NODE` symbol via `Object.defineProperty`.

```ts
export function ref<T = unknown>(name: string): Ref<T> {
  const sym = Symbol(name)
  refSymbols.add(sym)
  return mark({ type: 'ref' as const, name, sym, [Symbol.toPrimitive]: () => sym }) as unknown as Ref<T>
}
```

The `[Symbol.toPrimitive]` trick makes `count` usable as an object key directly — `{ [count]: 0 }` calls `toPrimitive` to get the underlying symbol, which is how the tree definition works. The node object stores `sym` as a direct named property so `eval_` can access it as `node.sym` without having to call `Symbol.toPrimitive` at runtime.

The `Ref<T>` type is a lie — it's typed as `symbol & { __exprType: T }` even though the runtime value is an object. This is intentional: it makes TypeScript accept it as an object key (`[count]: 0`) while also carrying the type parameter `T` for inference in `calc` and `iff`.

The `name` property on the internal node object replaces the old `ref` property (renamed to avoid shadowing the function parameter in earlier versions).

`mark` sets the `NODE` symbol on the object as a non-enumerable, non-writable property, making it invisible to normal object inspection:

```ts
const mark = <T extends object>(n: T) =>
  Object.defineProperty(n, NODE, { value: true }) as T
```

> **Example snapshot — after `ref<number>('count')` and `ref<number>('step')`:**
> ```
> count  = { type: 'ref', name: 'count', sym: sym_count, [Symbol.toPrimitive]: () => sym_count }  [NODE]=true
> step   = { type: 'ref', name: 'step',  sym: sym_step,  [Symbol.toPrimitive]: () => sym_step  }  [NODE]=true
>
> refSymbols = Set { sym_count, sym_step }
> ```
> `count` and `step` are node objects. When used as object keys (`{ [count]: 0 }`),
> `Symbol.toPrimitive` is called and returns `sym_count` — so the key in the object is
> the symbol, not the node object itself. The `sym` named property lets `eval_` read
> `node.sym` directly instead of calling `Symbol.toPrimitive` at runtime.

### `calc`

```ts
const doubled = calc(n => n * 2, [count])
```

Returns a marked node. Nothing is computed. The `args` array is a list of expressions — any mix of `Ref`, `CalcNode`, `IffNode`, or plain values — that will be evaluated at runtime and passed to `fn`.

```ts
export function calc<Args extends readonly any[], R>(
  fn: (...args: UnwrapArgs<Args>) => R,
  args: readonly [...Args]
): CalcNode<R> {
  return mark({ type: 'calc' as const, fn, args }) as unknown as CalcNode<R>
}
```

Type inference flows through `UnwrapArgs`: if `count` is `Ref<number>`, then `args: [count]` gives `fn` a parameter of type `number`. Literals pass through as-is.

```ts
type UnwrapArgs<T extends readonly any[]> = { [K in keyof T]: Unwrap<T[K]> }

type Unwrap<T> =
  T extends { readonly __setNode: true }     ? void :
  T extends { readonly __exprType: infer U } ? U :
  T
```

> **Example snapshot — after `calc(n => n * 2, [count])`:**
> ```
> doubled = { type: 'calc', fn: n => n * 2, args: [count] }  [NODE]=true
> //                                                 ↑ the count node object itself
> ```
> Note `args` holds the node object, not the symbol. `eval_` will recurse into it.

### `iff`

```ts
iff(isDark, '#111', '#fff')
```

The scalar case returns a single marked node:

```ts
mark({ type: 'iff', cond, onTrue, onFalse })
```

The interesting case is when one or both branches are plain objects (not nodes):

```ts
iff(isDark, { bg: '#111', text: '#eee' }, { bg: '#fff', text: '#111' })
```

`iff` detects this and **distributes** — instead of returning one `iff` node that switches between two objects, it returns a plain object where each key is its own `iff` node:

```ts
{
  bg:   { type: 'iff', cond: isDark, onTrue: '#111', onFalse: '#fff' },
  text: { type: 'iff', cond: isDark, onTrue: '#eee', onFalse: '#111' },
}
```

Here is the full distribution logic:

```ts
export function iff(cond: any, onTrue: any, onFalse: any = undefined): any {
  onTrue  = normalize(onTrue)   // arrays → { 0: ..., 1: ... }
  onFalse = normalize(onFalse)
  const tObj = isObj(onTrue)  && !isNode(onTrue)
  const fObj = isObj(onFalse) && !isNode(onFalse)
  if (!tObj && !fObj) return mark({ type: 'iff', cond, onTrue, onFalse })

  const out: any = {}
  if (tObj !== fObj)             // mixed: one object, one scalar
    out[VALUE] = mark({
      type: 'iff',
      cond,
      onTrue:  tObj ? undefined : onTrue,
      onFalse: fObj ? undefined : onFalse,
    })

  const keys = new Set<string | symbol>([
    ...(tObj ? allKeys(onTrue)  : []),
    ...(fObj ? allKeys(onFalse) : []),
  ])
  for (const k of keys) out[k] = iff(cond, tObj ? onTrue[k] : undefined, fObj ? onFalse[k] : undefined)
  return out
}
```

The returned plain object is **not** a node itself — `run()` will treat it as a nested scope, making each key independently reactive. Arrays are normalized to `{ 0: ..., 1: ... }` objects before this check, so array branches distribute the same way:

```ts
const normalize = (v: any) => Array.isArray(v)
  ? Object.fromEntries(v.map((x: any, i: number) => [i, x]))
  : v
```

The mixed case (one object branch, one scalar) stores the scalar under `VALUE` on the output object, then distributes the object keys as usual. `VALUE` is a private symbol used by `resolve()` to decide what to return when the whole scope is read as a function.

### `set`

```ts
set<[string]>({ [todos]: calc((list, text) => [...list, text], [todos, arg<string>(0)]) })
```

Returns a marked node containing the assignments object. The assignments are built once at definition time and reused on every call. Runtime arguments are accessed inside the assignments via `arg(index)` nodes.

```ts
export function set<Args extends any[] = []>(assignments: object): SetNode<Args> {
  return mark({ type: 'set' as const, assignments }) as unknown as SetNode<Args>
}
```

> **Example snapshot — after `set({ [count]: calc((n, s) => n + s, [count, step]) })`:**
> ```
> inc_node = {
>   type: 'set',
>   assignments: {
>     [sym_count]: { type: 'calc', fn: (n, s) => n + s, args: [count, step] }
>   }
> }  [NODE]=true
> ```
> The assignments object is keyed by the symbol `sym_count` (because `[count]` called
> `Symbol.toPrimitive`). The value is a `calc` node that will be evaluated at call time.

### `arg`

```ts
arg<string>(0)  // reads the first argument passed at call time
```

Returns a marked node that reads from the module-level `currentArgs` array at eval time. `arg(0)` is the first argument, `arg(1)` the second, and so on. The `Args` type parameter on `set<Args>` declares the full tuple type for type-safe call sites.

```ts
export function arg<T = unknown>(index: number): ArgNode<T> {
  return mark({ type: 'arg' as const, index }) as unknown as ArgNode<T>
}
```

> **Example snapshot — `arg<number>(0)`:**
> ```
> { type: 'arg', index: 0 }  [NODE]=true
> ```
> When `eval_` encounters this during a set action, it returns `currentArgs[0]`.

---

## Phase 2: `run(app)`

`run` takes the tree and does three things in sequence: **build**, **evaluate**, **wrap**.

### Step 1: `build` — construct the scope tree

`build(tree, parent)` walks the app tree recursively and mirrors it into a parallel tree of **Scope** objects.

```ts
interface Scope {
  parent:    Scope | null
  defs:      Map<symbol, Def>      // ref definitions at this level
  children:  Record<string, any>   // nested scopes or raw nodes
  valueNode?: any                  // the VALUE node if present (mixed iff branch)
}
```

```ts
function build(tree: object, parent: Scope | null): Scope {
  const scope: Scope = { parent, defs: new Map(), children: {} }
  scopes.add(scope)                               // register in WeakSet
  for (const sym of Object.getOwnPropertySymbols(tree)) {
    if (sym === VALUE) { scope.valueNode = (tree as any)[sym]; continue }
    if (!refSymbols.has(sym)) continue            // skip non-ref symbols
    const def: Def = { formula: (tree as any)[sym], value: undefined, scope, deps: new Set() }
    scope.defs.set(sym, def)
    allDefs.push(def)                             // flat registry for propagation
  }
  for (const key of Object.keys(tree)) {
    scope.children[key] = buildNode((tree as any)[key], scope)
  }
  return scope
}
```

For each level of the tree:

1. **Symbol keys** are inspected. If a symbol is in `refSymbols` it is a ref definition — a `Def` is created and added to `scope.defs` and the flat `allDefs` array. `VALUE` is handled specially: its node is stored as `scope.valueNode`.
2. **String keys** are recursively processed by `buildNode`. If the value is a plain object (not a node), it recurses into `build`. If it is an array, each element is processed. If it is a node or a primitive, it is stored as-is in `scope.children`.

```ts
function buildNode(v: any, parent: Scope): any {
  if (Array.isArray(v)) return v.map(item => buildNode(item, parent))
  if (isObj(v) && !isNode(v)) return build(v, parent)  // plain object → new scope
  return v                                               // node or primitive → keep as-is
}
```

Every scope is registered in a `WeakSet<object>` called `scopes`. This lets `isScope(x)` distinguish scope objects from plain objects later without adding any visible properties to them.

```ts
const scopes = new WeakSet<object>()
const isScope = (x: unknown): x is Scope => isObj(x) && scopes.has(x as object)
```

After `build`, every scope node in the tree has been mirrored into a `Scope`. All ref definitions are registered as `Def` objects in `allDefs` in tree-traversal order. No values have been computed yet:

```ts
interface Def {
  formula: any       // the node or value that defines this ref's initial/reactive value
  value:   any       // the current live value — undefined until reeval
  scope:   Scope     // the scope this def belongs to
  deps:    Set<Def>  // which other Defs this one reads from (filled during reeval)
}
```

> **Example snapshot — after `build(app, null)`:**
> ```
> rootScope = {
>   parent: null,
>   defs: Map {
>     sym_count → Def { formula: 0,      value: undefined, deps: Set{} },
>     sym_step  → Def { formula: 1,      value: undefined, deps: Set{} },
>   },
>   children: {
>     doubled: { type: 'calc', fn: n => n*2, args: [count] },  // calc node, stored as-is
>     inc:     { type: 'set',  assignments: { [sym_count]: calcNode } },  // set node, stored as-is
>   }
> }
>
> allDefs = [
>   Def { formula: 0, value: undefined, scope: rootScope },   // count
>   Def { formula: 1, value: undefined, scope: rootScope },   // step
> ]
> ```
> `doubled` and `inc` are nodes (recognized by `isNode`), so `buildNode` stores them directly
> in `children` without recursing. Only `[sym_count]: 0` and `[sym_step]: 1` are ref
> definitions — they become `Def` entries.

### Step 2: Initial evaluation — `reeval` all defs

```ts
for (const def of allDefs) reeval(def, subscribers)
```

`reeval(def, subscribers)` evaluates a def's formula to compute its current value, records which other defs it depends on, and keeps the reverse-dep index in sync:

```ts
function reeval(def: Def, subscribers: Map<Def, Set<Subscriber>>): boolean {
  const prev = tracking
  const oldDeps = def.deps
  def.deps = new Set()   // clear previous deps
  tracking = def         // set global tracking pointer
  try {
    const next = eval_(def.formula, def.scope)
    // Update reverse-dep index: remove from old deps, add to new deps
    removeSubs(subscribers, oldDeps, def)
    for (const dep of def.deps) addSub(subscribers, dep, def)
    if (next === def.value) return false   // unchanged — stop propagation here
    def.value = next
    return true
  } catch (err) {
    console.error('[treem] formula error:', err)
    removeSubs(subscribers, oldDeps, def)
    for (const dep of def.deps) addSub(subscribers, dep, def)
    return false
  } finally {
    tracking = prev      // always restore, even on throw
  }
}
```

The key mechanism is the module-level `tracking` pointer. While `reeval` runs, `tracking` is set to the current def. Any time `eval_` evaluates a `ref` node, it adds the resolved def to `tracking.deps`. This is how the dependency graph is built without any explicit subscription API — it falls out naturally from just evaluating the formula:

```ts
let tracking: Def | null = null
let watchTracking: Watcher | null = null
```

`eval_` is a recursive interpreter for the node tree:

```ts
function eval_(node: any, scope: Scope): any {
  if (!isNode(node)) return node    // literal value — return as-is
  switch (node.type) {
    case 'ref': {
      const def = findDef(node.sym, scope)   // node.sym is the symbol stored directly on the node
      if (def && tracking)      tracking.deps.add(def)      // record dep for reeval
      if (def && watchTracking) watchTracking.deps.add(def) // record dep for watcher
      return def?.value
    }
    case 'arg':  return currentArgs[node.index]
    case 'calc': return node.fn(...node.args.map((a: any) => eval_(a, scope)))
    case 'iff':  return eval_(node.cond, scope) ? eval_(node.onTrue, scope) : eval_(node.onFalse, scope)
    case 'set':  return (...args: any[]) => { /* action closure — see below */ }
  }
}
```

The scope chain walk in `ref` evaluation is how lexical scoping works. Starting from the current scope, `findDef` walks up through `parent` pointers until it finds a scope whose `defs` map contains the symbol, or returns `undefined` if none does:

```ts
function findDef(sym: symbol, scope: Scope): Def | undefined {
  for (let s: Scope | null = scope; s; s = s.parent)
    if (s.defs.has(sym)) return s.defs.get(sym)
}
```

After the initial evaluation loop, every ref has a computed value and every def has a populated `deps` set.

> **Example snapshot — after `for (const def of allDefs) reeval(def)`:**
> ```
> allDefs = [
>   Def { formula: 0, value: 0, scope: rootScope, deps: Set{} },   // count — literal, no deps
>   Def { formula: 1, value: 1, scope: rootScope, deps: Set{} },   // step  — literal, no deps
> ]
> ```
> Both formulas are plain literals (`0` and `1`), so `eval_` returns them immediately
> without entering the node switch. No ref nodes are read, so `deps` stays empty for both.
> If instead `[count]` had been initialized to `calc(s => s * 2, [step])`, then after
> `reeval`, `count.deps` would be `Set { stepDef }`.

### Step 3: `callable` — wrap into the program interface

`callable(node, scope)` recursively wraps the scope tree into a callable interface where every node is a function:

```ts
function callable(node: any, scope: Scope, subscribers: Map<Def, Set<Subscriber>>): Watchable<any> {
  if (Array.isArray(node)) {
    const arr: any = node.map(item => callable(item, scope, subscribers))
    arr[SUBSCRIBE] = makeSubscribe(() => resolveNode(node, scope), subscribers)
    return arr
  }
  if (isScope(node)) {
    const fn: any = () => resolve(node)
    for (const [k, child] of Object.entries(node.children))
      Object.defineProperty(fn, k, { value: callable(child, node, subscribers), writable: true, configurable: true, enumerable: true })
    fn[SUBSCRIBE] = makeSubscribe(() => resolve(node), subscribers)
    return fn
  }
  // leaf node (calc, iff, ref) or set node
  const fn: any = (...args: any[]) => {
    const v = eval_(node, scope)
    return typeof v === 'function' ? v(...args) : v   // set nodes return a function — call it
  }
  fn[SUBSCRIBE] = makeSubscribe(() => eval_(node, scope), subscribers)
  return fn
}
```

- **Scope nodes** become functions: `() => resolve(scope)`. Each string-keyed child is attached as a property by recursing into `callable`. A `[SUBSCRIBE]` property is attached for `watch` support.
- **Leaf nodes** (`calc`, `iff`, `ref`s) become functions that call `eval_`. For set nodes, `eval_` returns the action closure, so calling `store.inc()` evaluates the set node, gets the closure, and immediately calls it with the passed args.
- **Arrays** become arrays of callable items with a `[SUBSCRIBE]` on the array itself.

`resolve(scope)` is the inverse of `build` — it walks the scope tree and constructs a plain object by evaluating every child. It checks `valueNode` first: if present and non-undefined, that value wins (the mixed-branch `iff` case):

```ts
function resolve(scope: Scope): any {
  if (scope.valueNode !== undefined) {
    const v = eval_(scope.valueNode, scope)
    if (v !== undefined) return v   // scalar branch active — return VALUE directly
  }
  const out: any = {}
  for (const [k, child] of Object.entries(scope.children))
    out[k] = resolveNode(child, scope)
  return out
}
```

---

## Reactivity: how updates propagate

### When an action is called

```ts
store.inc()
```

1. `callable` wrapped the `inc` set node as a leaf function. Calling `store.inc()` enters that function, which calls `eval_(setNode, scope)`.
2. `eval_` hits `case 'set'` and returns the action closure.
3. The closure is immediately called with the passed args.

Here is the full action closure:

```ts
case 'set': return (...args: any[]) => {
  const prevArgs = currentArgs
  currentArgs = args                    // expose args for arg(index) nodes
  const updates: [Def, any][] = []
  try {
    for (const sym of Object.getOwnPropertySymbols(node.assignments)) {
      if (!refSymbols.has(sym)) continue
      const def = findDef(sym, scope)
      if (!def) continue
      const next = eval_((node.assignments as any)[sym], scope)
      if (next !== def.value) updates.push([def, next])   // collect, don't commit yet
    }
  } catch (err) {
    console.error('[treem] set aborted:', err)
    currentArgs = prevArgs
    return   // abort entirely — no partial updates
  }
  for (const [def, next] of updates) def.value = next       // commit all at once
  if (updates.length > 0) propagate(updates.map(([def]) => def), subscribers)
  currentArgs = prevArgs
}
```

The assignments object is built once at definition time. At call time, `currentArgs` is set to the passed arguments so any `arg(index)` nodes inside the assignments can read from it during `eval_`. All new values are collected into `updates` before any are applied. If any formula throws, nothing is committed and `currentArgs` is restored. Only after all values are computed successfully are they written and propagation triggered.

> **Example snapshot — `store.inc()` (no arg, step=1):**
> ```
> // entering the action closure, currentArgs = []
>
> // eval_ on { type:'calc', fn:(n,s)=>n+s, args:[count, step] }:
> //   eval_(count node) → findDef(sym_count) → def.value = 0  → returns 0
> //   eval_(step  node) → findDef(sym_step)  → def.value = 1  → returns 1
> //   fn(0, 1) → 1
> //   1 !== 0 (def.value) → push update
>
> updates = [ [countDef, 1] ]
>
> // commit:
> countDef.value = 1
>
> // propagate([countDef], subscribers):
> //   dirty = Set { countDef }, queue = [countDef]
> //   BFS: subscribers.get(countDef) → any Def dependents are re-evaled
> //   pass 2 — watchers: any watcher whose deps includes countDef fires
> ```

### `propagate`

```ts
function propagate(changed: Def[], subscribers: Map<Def, Set<Subscriber>>): void {
  const dirty = new Set<Def>(changed)
  // Walk only the affected subgraph via the reverse-dep index.
  // Use a queue so newly-dirtied defs can propagate further.
  const queue: Def[] = [...changed]
  for (let i = 0; i < queue.length; i++) {
    const subs = subscribers.get(queue[i])
    if (!subs) continue
    for (const sub of [...subs]) {  // snapshot: reeval modifies the set during iteration
      if ('formula' in sub) {
        // sub is a Def
        if (!dirty.has(sub) && reeval(sub, subscribers)) {
          dirty.add(sub)
          queue.push(sub)
        }
      }
    }
  }
  // Notify watchers whose deps overlap with dirty set
  for (const w of watchers) {
    let hit = false
    for (const dep of w.deps) if (dirty.has(dep)) { hit = true; break }
    if (hit) {
      const next = w.track(subscribers)
      if (next !== w.last) {
        w.last = next
        try { w.cleanup?.(); const r = w.cb(next); w.cleanup = typeof r === 'function' ? r : undefined } catch (err) { console.error('[treem] watcher error:', err) }
      }
    }
  }
}
```

`propagate` does two passes:

**Pass 1 — re-evaluate dirty defs via BFS.** It maintains a `dirty` set and a queue starting with the changed defs. For each item in the queue, it looks up that def's direct subscribers in the reverse-dep index (`subscribers` map). Only defs that actually depend on something dirty are visited — unrelated defs are never touched. If `reeval` returns `true` (the value actually changed), the def is added to `dirty` and pushed onto the queue so its own dependents can propagate further. If the value didn't change, propagation stops at that node — unchanged intermediate values shield their dependents from unnecessary re-evaluation.

This is O(affected) rather than O(all defs). A 1000-def tree where only 3 defs are in the changed subgraph does at most ~3 revals, not 1000 scans.

**Pass 2 — notify watchers.** Each watcher's `deps` set is checked against `dirty`. If any dep is dirty, `w.track()` re-evaluates the watched expression (re-recording deps in the process) and compares the result to `w.last`. If changed, `w.cb` fires.

> **Example snapshot — `watch(store.doubled, v => console.log(v))` then `store.inc()`:**
> ```
> // On subscribe: w.track() evaluates store.doubled()
> //   eval_(calcNode: n => n*2, [count])
> //     eval_(count) → watchTracking.deps.add(countDef) → returns 0
> //   fn(0) → 0
> // w.last = 0, w.deps = Set { countDef }
> // cb(0) fires immediately → logs 0
>
> // After store.inc(), propagate([countDef], subscribers):
> //   dirty = Set { countDef }, queue = [countDef]
> //   pass 1 — BFS:
> //     subscribers.get(countDef) → no Def subscribers (doubled is a calc in children,
> //     not a ref Def) → queue exhausted
> //   pass 2 — watchers:
> //     w.deps = Set { countDef } → hit! countDef ∈ dirty
> //     w.track() re-evaluates: eval_(count) → 1, fn(1) → 2
> //     2 !== 0 (w.last) → w.last = 2, cb(2) fires → logs 2
> ```

### Dependency re-tracking

After a branch switch in an `iff`, the set of deps for a watcher or def can change — it may have been reading `a` before and now reads `b`. This is handled automatically: both `reeval` and `w.track` start with a fresh `deps` set, re-record everything from scratch during evaluation, and then update the reverse-dep index accordingly — removing entries for old deps and adding entries for new ones:

```ts
// in reeval:
const oldDeps = def.deps
def.deps = new Set()
tracking = def
// ... eval_ runs, adding to def.deps as ref nodes are encountered
removeSubs(subscribers, oldDeps, def)
for (const dep of def.deps) addSub(subscribers, dep, def)

// in w.track:
const oldDeps = w.deps
w.deps = new Set()
watchTracking = w
// ... getValue() runs, adding to w.deps as ref nodes are encountered
removeSubs(subscribers, oldDeps, w)
for (const dep of w.deps) addSub(subscribers, dep, w)
```

This keeps the reverse-dep index exactly in sync with the actual current dependency graph at all times.

---

## `watch` internals

`watch(target, cb)` calls `target[SUBSCRIBE](cb)`, which is the function created by `makeSubscribe`:

```ts
function makeSubscribe(getValue: () => any, subscribers: Map<Def, Set<Subscriber>>) {
  return (cb: (value: any) => void) => {
    const w: Watcher = {
      deps: new Set(),
      last: undefined,
      track: (subs?: Map<Def, Set<Subscriber>>) => {
        const oldDeps = w.deps
        w.deps = new Set()
        const prev = watchTracking
        watchTracking = w
        try {
          const result = getValue()
          // Update reverse-dep index for the watcher
          const s = subs ?? subscribers
          removeSubs(s, oldDeps, w)
          for (const dep of w.deps) addSub(s, dep, w)
          return result
        } finally {
          watchTracking = prev
        }
      },
      cb,
    }
    w.last = w.track()                              // evaluate immediately, record deps
    const r = cb(w.last)                            // fire immediately with current value
    w.cleanup = typeof r === 'function' ? r : undefined
    watchers.add(w)
    return () => {
      w.cleanup?.()                                 // run final cleanup on unsubscribe
      removeSubs(subscribers, w.deps, w)            // clean up reverse-dep index
      watchers.delete(w)
    }
  }
}
```

`watchTracking` is a second module-level pointer (alongside `tracking`) used exclusively for watcher dep collection. It is separate from `tracking` so that a watcher evaluating its expression doesn't pollute a def's dep set if it happens to be triggered during a `reeval`. Each uses its own pointer and they don't interfere:

```ts
case 'ref': {
  const def = findDef(node.sym, scope)
  if (def && tracking)      tracking.deps.add(def)      // add to current def's deps
  if (def && watchTracking) watchTracking.deps.add(def) // add to current watcher's deps
  return def?.value
}
```

Both pointers can be non-null at the same time — a watcher tracks while reading from ref nodes that are also deps of defs.

The callback can optionally return a cleanup function. It is stored on `w.cleanup` and called before each subsequent `cb` invocation (so the previous side effect is torn down before the next one starts) and on unsubscribe. If the callback returns a non-function, the cleanup field stays `undefined`.

Calling the returned unsubscribe function runs the latest cleanup, removes the watcher from `watchers`, and cleans up its entries from the reverse-dep index so those defs no longer hold a reference to it. `dispose()` on the program clears all watchers and their index entries at once:

```ts
program.dispose = () => {
  for (const w of watchers) removeSubs(subscribers, w.deps, w)
  watchers.clear()
}
```

---

## Global tracking state

`tracking`, `watchTracking`, and `currentArgs` are module-level variables. This works because JavaScript is single-threaded: only one evaluation can be in flight at a time. The `finally` blocks (and explicit restores in the set closure) ensure these are always restored correctly even if a formula throws:

```ts
// reeval
const prev = tracking
tracking = def
try {
  const next = eval_(def.formula, def.scope)
  ...
} finally {
  tracking = prev         // restored even on throw
}

// w.track
const prev = watchTracking
watchTracking = w
try { return getValue() } finally { watchTracking = prev }

// set action closure
const prevArgs = currentArgs
currentArgs = args        // arg(index) nodes read from here
try { ...collect updates... } catch { currentArgs = prevArgs; return }
...commit...
currentArgs = prevArgs    // always restored
```

This is the same approach used by Vue's effect system and Solid's reactive primitives — no subscription objects, no explicit dependency declaration, just a global pointer that gets populated during evaluation.

---

## Data flow diagram

```
Declaration phase (module load time)
─────────────────────────────────────
ref()  →  { type:'ref',  name, sym, [Symbol.toPrimitive]: ()=>sym }  tagged with NODE
calc() →  { type:'calc', fn, args }                                  tagged with NODE
iff()  →  { type:'iff',  cond, onTrue, onFalse }                     tagged with NODE
         or plain object { key: iffNode, ... }  (distributed — not a node)
set()  →  { type:'set',  assignments }                               tagged with NODE
arg()  →  { type:'arg',  index }                                     tagged with NODE

run(app)
─────────────────────────────────────
build(app, null)
  for each symbol key:
    sym === VALUE         → scope.valueNode = node
    sym in refSymbols    → Def { formula, value:undefined, scope, deps:new Set() }
                            → scope.defs.set(sym, def)
                            → allDefs.push(def)
  for each string key:
    plain object (not node) → build(child, scope)  [recurse → new child Scope]
    array                   → each element through buildNode
    node or primitive       → scope.children[key] = value as-is

for (const def of allDefs) reeval(def, subscribers)
  tracking = def
  eval_(def.formula, def.scope)
    'ref'  → findDef(node.sym, scope) walks scope.parent chain
             → tracking.deps.add(foundDef)
             → return foundDef.value
    'calc' → eval each arg recursively, call fn(results)
    'iff'  → eval cond, pick and eval winning branch only
  removeSubs(subscribers, oldDeps, def)
  for dep of def.deps: addSub(subscribers, dep, def)
  def.value = result
  tracking = null

callable(rootScope, rootScope, subscribers)
  isScope  → fn = () => resolve(scope)
             fn[key] = callable(child, scope, subscribers) for each child
             fn[SUBSCRIBE] = makeSubscribe(..., subscribers)
  isArray  → arr = items.map(item => callable(item, scope, subscribers))
             arr[SUBSCRIBE] = makeSubscribe(..., subscribers)
  isNode   → fn = (...args) => { v = eval_(node); typeof v==='function' ? v(...args) : v }
             fn[SUBSCRIBE] = makeSubscribe(..., subscribers)

program.dispose = () => {
  for w of watchers: removeSubs(subscribers, w.deps, w)
  watchers.clear()
}

Mutation (action call)
─────────────────────────────────────
store.inc(arg)
  callable's leaf fn: eval_(setNode, scope) → action closure
  closure(arg):
    currentArgs = [arg]                  expose args for arg(index) nodes
    try:
      for each sym in node.assignments:
        def = findDef(sym, scope)
        next = eval_(assignments[sym])   evaluate formula (arg(0) reads currentArgs[0])
        if next !== def.value → updates.push([def, next])
    catch: log + currentArgs = prev + return (no state change)
    for [def, next] of updates: def.value = next   commit all
    for [def]       of updates: propagate(def)
    currentArgs = prev

propagate(changed[], subscribers)
  dirty = new Set(changed), queue = [...changed]
  pass 1 — BFS via reverse-dep index:
    for each item in queue:
      subs = subscribers.get(item)
      for each Def sub of subs:
        if not dirty and reeval(sub, subscribers):
          dirty.add(sub); queue.push(sub)   // propagate further
        if value unchanged: stop here (shields dependents)
  pass 2 — watchers:
    for w of watchers:
      if any dep of w is in dirty:
        next = w.track(subscribers)   re-evaluate + re-record deps + update index
        if next !== w.last: w.cleanup?.(); w.last = next; w.cleanup = w.cb(next) (if function)
```

---

## Key design decisions

**Nodes are plain objects.** `calc(...)` returns `{ type: 'calc', fn, args }`. No classes, no prototypes. The `NODE` symbol (set via `Object.defineProperty` with no enumerable/writable flags) marks them invisibly. This keeps the API transparent — you can `console.log` a node and read its structure.

**Scopes mirror the tree.** Rather than a flat registry of every reactive value, state is organized into the same nested shape as the app tree. Lookups walk up the scope chain, which is how lexical shadowing of ref values is implemented. This makes scoping intuitive and composable.

**Deps are re-recorded on every evaluation.** There is no separate "subscribe" step. Deps emerge naturally from evaluation. After a branch switch, old deps are silently discarded and new ones are recorded. This makes conditional reactivity correct without any explicit tracking of which branches are active.

**Propagation uses a reverse-dep index.** `subscribers` is a `Map<Def, Set<Subscriber>>` that maps each def to the set of defs and watchers that directly depend on it. `reeval` and `w.track` keep this index up to date by removing old deps and adding new ones after every evaluation. `propagate` does a BFS through this index, touching only the affected subgraph rather than scanning all defs. This makes updates O(affected) instead of O(all defs).

**`tracking` vs `watchTracking`.** Two separate globals are needed because `eval_` is used in both contexts (def re-evaluation and watcher tracking). Using a single global would cause watcher evaluations to pollute def dep sets. The separation keeps def deps and watcher deps cleanly isolated.

**Actions are atomic.** All assignment formulas are evaluated and collected before any state is written. A throwing formula leaves state completely unchanged, preventing partial updates from corrupting the reactive graph.
