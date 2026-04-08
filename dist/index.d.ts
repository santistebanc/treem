export declare const VALUE: unique symbol;
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
export type SetNode = object & {
    readonly __setNode: true;
};
export type Expr<T> = T | CtxRef<T> | CalcNode<T> | ArgNode<T> | IffNode<T>;
type PlainObj = Record<string, unknown> & {
    readonly __exprType?: never;
} & {
    readonly __setNode?: never;
};
type Unwrap<T> = T extends SetNode ? void : T extends {
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
export declare function iff<T, F>(cond: Expr<any>, onTrue: Expr<T>, onFalse?: Expr<F>): IffNode<T | F | undefined>;
export declare function set(assignments: object): SetNode;
export declare function arg<T = unknown>(index: number): ArgNode<T>;
declare const SUBSCRIBE: unique symbol;
export interface Watchable<T> {
    (): T;
    readonly [SUBSCRIBE]: (cb: (value: T) => void) => () => void;
}
type ProgramNodeOf<T> = T extends SetNode ? Watchable<void> : T extends {
    readonly __exprType: infer U;
} ? Watchable<U> : T extends readonly any[] ? Watchable<any> : T extends object ? Watchable<any> & {
    [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]>;
} : Watchable<T>;
type ProgramOf<T extends object> = Watchable<any> & {
    [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]>;
};
export declare function watch<T>(target: Watchable<T>, cb: (value: T) => void): () => void;
export declare function run<T extends object>(app: T): ProgramOf<T>;
export {};
//# sourceMappingURL=index.d.ts.map