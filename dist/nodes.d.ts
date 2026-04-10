export declare const isObj: (x: unknown) => x is Record<string | symbol, any>;
export declare const VALUE: unique symbol;
export declare const ctxSymbols: Set<symbol>;
export declare const isNode: (x: unknown) => boolean;
export type CtxRef<T = any> = symbol & {
    readonly __exprType: T;
};
export type CalcNode<T = any> = object & {
    readonly __exprType: T;
};
export type ArgNode<T = any> = object & {
    readonly __exprType: T;
};
export type IffNode<T = any> = object & {
    readonly __exprType: T;
};
export type SetNode<Args extends any[] = []> = object & {
    readonly __setNode: true;
    readonly __args: Args;
};
/** Discriminated result of an async {@link resource}; readable synchronously from the tree and updated when the fetch settles. */
export type ResourceState<T> = {
    status: 'idle';
    data: undefined;
    error: undefined;
} | {
    status: 'pending';
    data: T | undefined;
    error: undefined;
} | {
    status: 'ok';
    data: T;
    error: undefined;
} | {
    status: 'error';
    data: undefined;
    error: unknown;
};
export type ResourceNode<T = any> = object & {
    readonly __exprType: T;
};
export type Expr<T> = T | CtxRef<T> | CalcNode<T> | ArgNode<T> | IffNode<T> | ResourceNode<T>;
type PlainObj = Record<string, unknown> & {
    readonly __exprType?: never;
} & {
    readonly __setNode?: never;
};
type Unwrap<T> = T extends {
    readonly __setNode: true;
} ? void : T extends {
    readonly __exprType: infer U;
} ? U : T;
type UnwrapArgs<T extends readonly any[]> = {
    [K in keyof T]: Unwrap<T[K]>;
};
type DistributeIff<T extends object, F extends object> = {
    [K in Extract<keyof T | keyof F, string>]: IffNode<(K extends keyof T ? Unwrap<T[K]> : undefined) | (K extends keyof F ? Unwrap<F[K]> : undefined)>;
};
export declare function ctx<T = unknown>(ref: string): CtxRef<T>;
export declare function calc<Args extends readonly any[], R>(fn: (...args: UnwrapArgs<Args>) => R, args: readonly [...Args]): CalcNode<R>;
export declare function iff<T extends PlainObj, F extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse: F): DistributeIff<T, F>;
export declare function iff<T extends PlainObj>(cond: Expr<any>, onTrue: T, onFalse?: Expr<any>): DistributeIff<T, {}>;
export declare function iff<F extends PlainObj>(cond: Expr<any>, onTrue: Expr<any>, onFalse: F): DistributeIff<{}, F>;
export declare function iff<T, F>(cond: Expr<any>, onTrue: Expr<T>, onFalse: Expr<F>): IffNode<T | F>;
export declare function iff<T>(cond: Expr<any>, onTrue: Expr<T>): IffNode<T | undefined>;
export declare function set<Args extends any[] = []>(assignments: object): SetNode<Args>;
export declare function arg<T = unknown>(index: number): ArgNode<T>;
/** Async data keyed by reactive `args`. Re-reads when deps change; passes {@link AbortSignal} for cancellation / stale work. */
export declare function resource<Args extends readonly any[], R>(fetch: (signal: AbortSignal, ...args: UnwrapArgs<Args>) => Promise<R>, args: readonly [...Args]): ResourceNode<ResourceState<R>>;
export {};
//# sourceMappingURL=nodes.d.ts.map