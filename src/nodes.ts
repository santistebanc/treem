export const isObj = (x: unknown): x is Record<string | symbol, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

export const isFn = (x: unknown): x is Record<string | symbol, any> =>
  typeof x === 'function'

// ─── Internal node keys (all symbols — no string collision with user paths) ──

export const VALUE    = Symbol('value')
export const TYPE     = Symbol('type')
export const NAME     = Symbol('name')
export const SYM      = Symbol('sym')
export const FN       = Symbol('fn')
export const ARGS     = Symbol('args')
export const INDEX    = Symbol('index')
export const COND     = Symbol('cond')
export const ON_TRUE  = Symbol('onTrue')
export const ON_FALSE = Symbol('onFalse')
export const ASSIGNMENTS = Symbol('assignments')
export const MAP_SYM  = Symbol('mapSym')
export const KEY_EXPR = Symbol('keyExpr')
export const PATH_ROOT  = Symbol('pathRoot')
export const PATH_CHAIN = Symbol('pathChain')

export const refSymbols   = new Set<symbol>()
export const eventSymbols = new Set<symbol>()
const eventRegistry = new Map<symbol, Set<(...args: any[]) => void>>()

export const pathNodeSymbols  = new Set<symbol>()
export const pathNodeRegistry = new Map<symbol, { pathRoot: symbol; pathChain: any[] }>()

export const isNode = (x: unknown) => (isObj(x) || isFn(x)) && TYPE in (x as any)
const allKeys = (o: object): (string | symbol)[] =>
  (Object.keys(o) as (string | symbol)[]).concat(Object.getOwnPropertySymbols(o))

// ─── Types ────────────────────────────────────────────────────────────────────

// string extends keyof T distinguishes Record<string,V> (index sig) from plain shaped objects
type RefPaths<T> =
  string extends keyof T
    ? { readonly [key: string]: Ref<T[string & keyof T] | undefined> }
    : T extends object
    ? { readonly [K in keyof T & string]: Ref<T[K]> }
    : unknown

export type Ref<T = any> = symbol & {
  readonly __exprType: T
  (key: Expr<any>): Ref<any>
} & RefPaths<T>
export type CalcNode<T = any> = object & { readonly __exprType: T }
export type ArgNode<T = any> = object & { readonly __exprType: T }
export type IffNode<T = any> = object & { readonly __exprType: T }
export type EventChannel<Args extends any[] = any[]> = symbol & { readonly __eventArgs: Args }
export type UpdateNode<Args extends any[] = []> = object & { readonly __updateNode: true; readonly __args: Args }
export type Expr<T> = T | Ref<T> | CalcNode<T> | ArgNode<T> | IffNode<T>

type PlainObj = Record<string, unknown> & { readonly __exprType?: never } & { readonly __updateNode?: never }

type Unwrap<T> =
  T extends { readonly __updateNode: true } ? void :
  T extends { readonly __exprType: infer U } ? U :
  T

type UnwrapArgs<T extends readonly any[]> = { [K in keyof T]: Unwrap<T[K]> }

type DistributeIff<T extends object, F extends object> = {
  [K in Extract<keyof T | keyof F, string>]:
  IffNode<(K extends keyof T ? Unwrap<T[K]> : undefined) | (K extends keyof F ? Unwrap<F[K]> : undefined)>
}

// ─── Declarative API ─────────────────────────────────────────────────────────

export function ref<T = unknown>(name: string): Ref<T> {
  const sym = Symbol(name)
  refSymbols.add(sym)

  function makeProxy(chain: any[]): any {
    const target: any = function() {}
    if (chain.length === 0) {
      target[TYPE] = 'ref'
      target[NAME] = name
      target[SYM]  = sym
      target[Symbol.toPrimitive] = () => sym
    } else {
      target[TYPE]       = 'path'
      target[PATH_ROOT]  = sym
      target[PATH_CHAIN] = chain
      // Lazily create a unique entry symbol only when used as an object key
      let entrySym: symbol | undefined
      target[Symbol.toPrimitive] = () => {
        if (!entrySym) {
          entrySym = Symbol(`${name}:path`)
          pathNodeRegistry.set(entrySym, { pathRoot: sym, pathChain: chain })
          pathNodeSymbols.add(entrySym)
        }
        return entrySym
      }
    }
    return new Proxy(target, {
      get(t, key) {
        if (typeof key === 'symbol') return t[key]
        return makeProxy([...chain, key])
      },
      apply(_t, _this, args) {
        return makeProxy([...chain, args[0]])
      },
    })
  }

  return makeProxy([]) as unknown as Ref<T>
}

export function event<Args extends any[] = []>(name: string): EventChannel<Args> {
  const sym = Symbol(name)
  eventSymbols.add(sym)
  eventRegistry.set(sym, new Set())
  return {
    [TYPE]: 'event',
    [NAME]: name,
    [SYM]:  sym,
    [Symbol.toPrimitive]: () => sym,
  } as unknown as EventChannel<Args>
}

export function subscribeEvent(channel: EventChannel<any>, cb: (...args: any[]) => void): () => void {
  const sym = (channel as any)[SYM] as symbol
  const subs = eventRegistry.get(sym)
  if (!subs) return () => {}
  subs.add(cb)
  return () => subs.delete(cb)
}

export function emitEvent(sym: symbol, args: any[]): void {
  for (const cb of eventRegistry.get(sym) ?? []) cb(...args)
}

export function calc<Args extends readonly any[], R>(
  fn: (...args: UnwrapArgs<Args>) => R,
  args: readonly [...Args]
): CalcNode<R> {
  return { [TYPE]: 'calc', [FN]: fn, [ARGS]: args } as unknown as CalcNode<R>
}

const normalize = (v: any) => Array.isArray(v) ? Object.fromEntries(v.map((x: any, i: number) => [i, x])) : v

export function iff<T extends PlainObj, F extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse: F): DistributeIff<T, F>
export function iff<T extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse?: Expr<any>): DistributeIff<T, {}>
export function iff<F extends PlainObj>(cond: Expr<any>, onTrue: Expr<any>, onFalse: F): DistributeIff<{}, F>
export function iff<T, F>(cond: Expr<any>, onTrue: Expr<T>, onFalse: Expr<F>): IffNode<T | F>
export function iff<T>(cond: Expr<any>, onTrue: Expr<T>): IffNode<T | undefined>

export function iff(cond: any, onTrue: any, onFalse: any = undefined): any {
  onTrue = normalize(onTrue)
  onFalse = normalize(onFalse)
  const tObj = isObj(onTrue) && !isNode(onTrue)
  const fObj = isObj(onFalse) && !isNode(onFalse)
  if (!tObj && !fObj) return { [TYPE]: 'iff', [COND]: cond, [ON_TRUE]: onTrue, [ON_FALSE]: onFalse }

  const out: any = {}
  if (tObj !== fObj)
    out[VALUE] = {
      [TYPE]:     'iff',
      [COND]:     cond,
      [ON_TRUE]:  tObj ? undefined : onTrue,
      [ON_FALSE]: fObj ? undefined : onFalse,
    }

  const keys = new Set<string | symbol>([
    ...(tObj ? allKeys(onTrue) : []),
    ...(fObj ? allKeys(onFalse) : []),
  ])
  for (const k of keys) out[k] = iff(cond, tObj ? onTrue[k] : undefined, fObj ? onFalse[k] : undefined)
  return out
}

export function update(assignments: object): UpdateNode<[]>
export function update<A>(assignments: object): UpdateNode<[A]>
export function update<A, B>(assignments: object): UpdateNode<[A, B]>
export function update<A, B, C>(assignments: object): UpdateNode<[A, B, C]>
export function update<A, B, C, D>(assignments: object): UpdateNode<[A, B, C, D]>
export function update<A, B, C, D, E>(assignments: object): UpdateNode<[A, B, C, D, E]>
export function update<A, B, C, D, E, F>(assignments: object): UpdateNode<[A, B, C, D, E, F]>
export function update(assignments: object): UpdateNode<any> {
  return { [TYPE]: 'update', [ASSIGNMENTS]: assignments } as unknown as UpdateNode<any>
}

export function arg<T = unknown>(index: number): ArgNode<T> {
  return { [TYPE]: 'arg', [INDEX]: index } as unknown as ArgNode<T>
}

// ─── Record ───────────────────────────────────────────────────────────────────

export const mapRefSymbols   = new Set<symbol>()
export const mapEntryRegistry = new Map<symbol, { mapSym: symbol; keyExpr: any }>()

export type RecordEntryNode<V = any> = symbol & { readonly __exprType: V | undefined; readonly __recordEntry: true }
export type RecordNode<K = any, V = any> = symbol & {
  readonly __exprType: V[]
  readonly __recordNode: true
  (keyExpr: Expr<K> | K): RecordEntryNode<V>
}

export function record<K = string, V = unknown>(name: string): RecordNode<K, V> {
  const sym = Symbol(name)
  mapRefSymbols.add(sym)

  const node: any = function (keyExpr: any) {
    const entrySym = Symbol(`${name}:entry`)
    const descriptor: any = {
      [TYPE]:    'mapEntry',
      [MAP_SYM]: sym,
      [SYM]:     entrySym,
      [Symbol.toPrimitive]: () => entrySym,
    }
    mapEntryRegistry.set(entrySym, { mapSym: sym, keyExpr })
    return descriptor as unknown as RecordEntryNode<V>
  }

  node[TYPE]   = 'record'
  node[NAME]   = name
  node[SYM]    = sym
  node[Symbol.toPrimitive] = () => sym

  return node as unknown as RecordNode<K, V>
}
