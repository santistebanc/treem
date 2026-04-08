import { isObj, isNode, ctxSymbols, VALUE, type CtxRef, type SetNode } from './nodes.js'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Def   { formula: any; value: any; scope: Scope; deps: Set<Def> }
interface Scope { parent: Scope | null; defs: Map<symbol, Def>; children: Record<string, any>; valueNode?: any }
interface Watcher { deps: Set<Def>; track: () => any; cb: (value: any) => void; last: any }

const SUBSCRIBE: unique symbol = Symbol('subscribe')

export interface Watchable<T> {
  (): T
  readonly [SUBSCRIBE]: (cb: (value: T) => void) => () => void
}

type ProgramNodeOf<T> =
  T extends SetNode                          ? Watchable<void> :
  T extends { readonly __exprType: infer U } ? Watchable<U> :
  T extends readonly any[]                   ? Watchable<any> :
  T extends object                           ? Watchable<any> & { [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]> } :
                                               Watchable<T>

type ProgramOf<T extends object> =
  Watchable<any> & { [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]> }

// ─── Module-level tracking state ─────────────────────────────────────────────

let tracking: Def | null = null
let watchTracking: Watcher | null = null
let currentArgs: any[] = []

// ─── Public API ──────────────────────────────────────────────────────────────

export function watch<T>(target: Watchable<T>, cb: (value: T) => void): () => void {
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
      if (!ctxSymbols.has(sym)) continue
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
      case 'ctx': {
        const def = findDef(node[Symbol.toPrimitive](), scope)
        if (def && tracking) tracking.deps.add(def)
        if (def && watchTracking) watchTracking.deps.add(def)
        return def?.value
      }
      case 'arg':  return currentArgs[node.index]
      case 'calc': return node.fn(...node.args.map((a: any) => eval_(a, scope)))
      case 'iff':  return eval_(node.cond, scope) ? eval_(node.onTrue, scope) : eval_(node.onFalse, scope)
      case 'set':  return (...args: any[]) => {
        const prevArgs = currentArgs
        currentArgs = args
        const updates: [Def, any][] = []
        for (const sym of Object.getOwnPropertySymbols(node.assignments)) {
          if (!ctxSymbols.has(sym)) continue
          const def = findDef(sym, scope)
          if (!def) continue
          const next = eval_((node.assignments as any)[sym], scope)
          if (next !== def.value) updates.push([def, next])
        }
        for (const [def, next] of updates) def.value = next
        for (const [def] of updates) propagate(def)
        currentArgs = prevArgs
      }
    }
  }

  function reeval(def: Def): boolean {
    const prev = tracking
    def.deps = new Set()
    tracking = def
    try {
      const next = eval_(def.formula, def.scope)
      if (next === def.value) return false
      def.value = next
      return true
    } finally {
      tracking = prev
    }
  }

  function propagate(changed: Def): void {
    const dirty = new Set([changed])
    for (const d of allDefs) {
      let hit = false
      for (const dep of d.deps) if (dirty.has(dep)) { hit = true; break }
      if (hit && reeval(d)) dirty.add(d)
    }
    for (const w of watchers) {
      let hit = false
      for (const dep of w.deps) if (dirty.has(dep)) { hit = true; break }
      if (hit) {
        const next = w.track()
        if (next !== w.last) { w.last = next; w.cb(next) }
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

  function makeSubscribe(getValue: () => any) {
    return (cb: (value: any) => void) => {
      const w: Watcher = {
        deps: new Set(),
        last: undefined,
        track: () => {
          w.deps = new Set()
          const prev = watchTracking
          watchTracking = w
          const v = getValue()
          watchTracking = prev
          return v
        },
        cb,
      }
      w.last = w.track()
      watchers.add(w)
      return () => watchers.delete(w)
    }
  }

  function callable(node: any, scope: Scope): Watchable<any> {
    if (Array.isArray(node)) {
      const arr: any = node.map(item => callable(item, scope))
      arr[SUBSCRIBE] = makeSubscribe(() => resolveNode(node, scope))
      return arr
    }
    if (isScope(node)) {
      const fn: any = () => resolve(node)
      for (const [k, child] of Object.entries(node.children)) fn[k] = callable(child, node)
      fn[SUBSCRIBE] = makeSubscribe(() => resolve(node))
      return fn
    }
    const fn: any = (...args: any[]) => { const v = eval_(node, scope); return typeof v === 'function' ? v(...args) : v }
    fn[SUBSCRIBE] = makeSubscribe(() => eval_(node, scope))
    return fn
  }

  const root = build(app, null)
  for (const def of allDefs) reeval(def)
  return callable(root, root) as unknown as ProgramOf<T>
}
