import { isObj, isNode, refSymbols, VALUE, type SetNode } from './nodes.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Def { formula: any; value: any; scope: Scope; deps: Set<Def> }
interface Scope { parent: Scope | null; defs: Map<symbol, Def>; children: Record<string, any>; valueNode?: any }
type Cleanup = (prev: any, next: any) => void
type CleanupResult = (() => void) | void
interface Watcher { deps: Set<Def>; track: (subs?: Map<Def, Set<Def | Watcher>>) => any; cb: (value: any, prev?: any) => CleanupResult; last: any; cleanup: Cleanup | undefined }

const SUBSCRIBE: unique symbol = Symbol('subscribe')

export interface Watchable<T> {
  (): T
  readonly [SUBSCRIBE]: (cb: (value: T, prev?: T) => CleanupResult) => () => void
}

// When a node's value type U is itself an object of nodes (e.g. a DistributeIff result
// used as a value inside another iff branch), its sub-properties exist at runtime and
// should be exposed. We detect this by checking whether U's values carry __exprType.
type IsNodeObject<U> = [U] extends [Record<string, { readonly __exprType: any }>] ? true : false

type ProgramNodeOf<T> =
  T extends SetNode<infer Args> ? (...args: Args) => void :
  T extends { readonly __exprType: infer U } ?
    Watchable<U> & (IsNodeObject<U> extends true ? { [K in Extract<keyof U, string>]: ProgramNodeOf<U[K]> } : {}) :
  T extends readonly any[] ? Watchable<any> :
  T extends object ? Watchable<any> & { [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]> } :
  Watchable<T>

type ProgramOf<T extends object> =
  Watchable<any> & { dispose: () => void } & { [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]> }

// ─── Module-level tracking state ─────────────────────────────────────────────

let tracking: Def | null = null
let watchTracking: Watcher | null = null
let currentArgs: any[] = []

// ─── Subscriber index helpers ─────────────────────────────────────────────────

type Subscriber = Def | Watcher

function addSub(subscribers: Map<Def, Set<Subscriber>>, dep: Def, sub: Subscriber): void {
  let s = subscribers.get(dep)
  if (!s) { s = new Set(); subscribers.set(dep, s) }
  s.add(sub)
}

function removeSubs(subscribers: Map<Def, Set<Subscriber>>, oldDeps: Set<Def>, sub: Subscriber): void {
  for (const dep of oldDeps) subscribers.get(dep)?.delete(sub)
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function watch<T>(target: Watchable<T>, cb: (value: T, prev?: T) => CleanupResult): () => void {
  return target[SUBSCRIBE](cb)
}

export function run<T extends object>(app: T): ProgramOf<T> {
  const allDefs: Def[] = []
  const watchers = new Set<Watcher>()
  const scopes = new WeakSet<object>()
  const isScope = (x: unknown): x is Scope => isObj(x) && scopes.has(x as object)

  function buildNode(v: any, parent: Scope): any {
    if (Array.isArray(v)) return v.map(item => buildNode(item, parent))
    if (isObj(v) && !isNode(v)) return build(v, parent)
    return v
  }

  function build(tree: object, parent: Scope | null): Scope {
    const scope: Scope = { parent, defs: new Map(), children: {} }
    scopes.add(scope)
    for (const sym of Object.getOwnPropertySymbols(tree)) {
      if (sym === VALUE) { scope.valueNode = (tree as any)[sym]; continue }
      if (!refSymbols.has(sym)) continue
      const def: Def = { formula: (tree as any)[sym], value: undefined, scope, deps: new Set() }
      scope.defs.set(sym, def)
      allDefs.push(def)
    }
    for (const key of Object.keys(tree)) {
      scope.children[key] = buildNode((tree as any)[key], scope)
    }
    return scope
  }

  function findDef(sym: symbol, scope: Scope): Def | undefined {
    for (let s: Scope | null = scope; s; s = s.parent)
      if (s.defs.has(sym)) return s.defs.get(sym)
  }

  function eval_(node: any, scope: Scope): any {
    if (!isNode(node)) return node
    switch (node.type) {
      case 'ref': {
        const def = findDef(node.sym, scope)
        if (def && tracking) tracking.deps.add(def)
        if (def && watchTracking) watchTracking.deps.add(def)
        return def?.value
      }
      case 'arg': return currentArgs[node.index]
      case 'calc': return node.fn(...node.args.map((a: any) => eval_(a, scope)))
      case 'iff': return eval_(node.cond, scope) ? eval_(node.onTrue, scope) : eval_(node.onFalse, scope)
      case 'set': return (...args: any[]) => {
        const prevArgs = currentArgs
        currentArgs = args
        const updates: [Def, any][] = []
        try {
          for (const sym of Object.getOwnPropertySymbols(node.assignments)) {
            if (!refSymbols.has(sym)) continue
            const def = findDef(sym, scope)
            if (!def) continue
            const next = eval_((node.assignments as any)[sym], scope)
            if (next !== def.value) updates.push([def, next])
          }
        } catch (err) {
          console.error('[treem] set aborted:', err)
          currentArgs = prevArgs
          return
        }
        for (const [def, next] of updates) def.value = next
        if (updates.length > 0) propagate(updates.map(([def]) => def), subscribers)
        currentArgs = prevArgs
      }
    }
  }

  function reeval(def: Def, subscribers: Map<Def, Set<Subscriber>>): boolean {
    const prev = tracking
    const oldDeps = def.deps
    def.deps = new Set()
    tracking = def
    try {
      const next = eval_(def.formula, def.scope)
      // Update the reverse-dep index: remove from old deps, add to new deps
      removeSubs(subscribers, oldDeps, def)
      for (const dep of def.deps) addSub(subscribers, dep, def)
      if (next === def.value) return false
      def.value = next
      return true
    } catch (err) {
      console.error('[treem] formula error:', err)
      removeSubs(subscribers, oldDeps, def)
      for (const dep of def.deps) addSub(subscribers, dep, def)
      return false
    } finally {
      tracking = prev
    }
  }

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
          const prev = w.last
          w.last = next
          try { w.cleanup?.(prev, next); const r = w.cb(next, prev); w.cleanup = r ?? undefined } catch (err) { console.error('[treem] watcher error:', err) }
        }
      }
    }
  }

  function resolveNode(v: any, scope: Scope): any {
    if (Array.isArray(v)) return v.map(item => resolveNode(item, scope))
    if (isScope(v)) return resolve(v)
    return eval_(v, scope)
  }

  function resolve(scope: Scope): any {
    if (scope.valueNode !== undefined) {
      const v = eval_(scope.valueNode, scope)
      if (v !== undefined) return v
    }
    const out: any = {}
    for (const [k, child] of Object.entries(scope.children))
      out[k] = resolveNode(child, scope)
    return out
  }

  function makeSubscribe(getValue: () => any, subscribers: Map<Def, Set<Subscriber>>) {
    return (cb: (value: any) => Cleanup) => {
      const w: Watcher = {
        deps: new Set(),
        last: undefined,
        cleanup: undefined,
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
        cb: ((value: any, prev?: any) => {
          const r = (cb as any)(value, prev)
          return typeof r === 'function' ? r : undefined
        }),
      }
      w.last = w.track()
      const r = w.cb(w.last, undefined)
      w.cleanup = r ?? undefined
      watchers.add(w)
      return () => {
        w.cleanup?.(w.last, undefined)
        removeSubs(subscribers, w.deps, w)
        watchers.delete(w)
      }
    }
  }

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
    const fn: any = (...args: any[]) => { const v = eval_(node, scope); return typeof v === 'function' ? v(...args) : v }
    fn[SUBSCRIBE] = makeSubscribe(() => eval_(node, scope), subscribers)
    return fn
  }

  const subscribers: Map<Def, Set<Subscriber>> = new Map()
  const root = build(app, null)
  for (const def of allDefs) reeval(def, subscribers)
  const program: any = callable(root, root, subscribers)
  program.dispose = () => {
    for (const w of watchers) removeSubs(subscribers, w.deps, w)
    watchers.clear()
  }
  return program as ProgramOf<T>
}
