export const isObj = (x: unknown): x is Record<string | symbol, any> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

const NODE = Symbol('node')
export const VALUE = Symbol('value')
export const ctxSymbols = new Set<symbol>()

export const isNode = (x: unknown) => isObj(x) && (x as any)[NODE] === true
const allKeys = (o: object): (string | symbol)[] =>
  [...Object.keys(o), ...Object.getOwnPropertySymbols(o)]
const mark = <T extends object>(n: T) =>
  Object.defineProperty(n, NODE, { value: true }) as T

// ─── Types ────────────────────────────────────────────────────────────────────

export type CtxRef<T = any>   = symbol & { readonly __exprType: T }
export type CalcNode<T = any> = object & { readonly __exprType: T }
export type ArgNode<T = any>  = object & { readonly __exprType: T }
export type IffNode<T = any>  = object & { readonly __exprType: T }
export type SetNode           = object & { readonly __setNode: true }
export type Expr<T> = T | CtxRef<T> | CalcNode<T> | ArgNode<T> | IffNode<T>

type PlainObj = Record<string, unknown> & { readonly __exprType?: never } & { readonly __setNode?: never }

type Unwrap<T> =
  T extends SetNode                          ? void :
  T extends { readonly __exprType: infer U } ? U :
  T

type UnwrapArgs<T extends readonly any[]> = { [K in keyof T]: Unwrap<T[K]> }

type DistributeIff<T extends object, F extends object> = {
  [K in Extract<keyof T | keyof F, string>]:
    IffNode<(K extends keyof T ? Unwrap<T[K]> : undefined) | (K extends keyof F ? Unwrap<F[K]> : undefined)>
}

// ─── Declarative API ─────────────────────────────────────────────────────────

export function ctx<T = unknown>(ref: string): CtxRef<T> {
  const sym = Symbol(ref)
  ctxSymbols.add(sym)
  return mark({ type: 'ctx' as const, ref, [Symbol.toPrimitive]: () => sym }) as unknown as CtxRef<T>
}

export function calc<Args extends readonly any[], R>(
  fn: (...args: UnwrapArgs<Args>) => R,
  args: readonly [...Args]
): CalcNode<R> {
  return mark({ type: 'calc' as const, fn, args }) as unknown as CalcNode<R>
}

export function iff<T extends PlainObj, F extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse: F): DistributeIff<T, F>
export function iff<T extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse?: Expr<any>): DistributeIff<T, {}>
export function iff<F extends PlainObj>(cond: Expr<any>, onTrue: Expr<any>, onFalse: F): DistributeIff<{}, F>
export function iff<T, F>(cond: Expr<any>, onTrue: Expr<T>, onFalse: Expr<F>): IffNode<T | F>
export function iff<T>(cond: Expr<any>, onTrue: Expr<T>): IffNode<T | undefined>
export function iff(cond: any, onTrue: any, onFalse: any = undefined): any {
  const tObj = isObj(onTrue) && !isNode(onTrue)
  const fObj = isObj(onFalse) && !isNode(onFalse)
  if (!tObj && !fObj) return mark({ type: 'iff', cond, onTrue, onFalse })

  const out: any = {}
  if (tObj !== fObj)
    out[VALUE] = mark({
      type: 'iff',
      cond,
      onTrue: tObj ? undefined : onTrue,
      onFalse: fObj ? undefined : onFalse,
    })

  const keys = new Set<string | symbol>([
    ...(tObj ? allKeys(onTrue) : []),
    ...(fObj ? allKeys(onFalse) : []),
  ])
  for (const k of keys) out[k] = iff(cond, tObj ? onTrue[k] : undefined, fObj ? onFalse[k] : undefined)
  return out
}

export function set(assignments: object): SetNode {
  return mark({ type: 'set' as const, assignments }) as unknown as SetNode
}

export function arg<T = unknown>(index: number): ArgNode<T> {
  return mark({ type: 'arg' as const, index }) as unknown as ArgNode<T>
}
