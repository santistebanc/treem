import { type SetNode } from './nodes.js';
declare const SUBSCRIBE: unique symbol;
export interface Watchable<T> {
    (): T;
    readonly [SUBSCRIBE]: (cb: (value: T) => void) => () => void;
}
type ProgramNodeOf<T> = T extends SetNode<infer Args> ? (...args: Args) => void : T extends {
    readonly __exprType: infer U;
} ? Watchable<U> : T extends readonly any[] ? Watchable<any> : T extends object ? Watchable<any> & {
    [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]>;
} : Watchable<T>;
type ProgramOf<T extends object> = Watchable<any> & {
    dispose: () => void;
} & {
    [K in Extract<keyof T, string>]: ProgramNodeOf<T[K]>;
};
export declare function watch<T>(target: Watchable<T>, cb: (value: T) => void): () => void;
export declare function run<T extends object>(app: T): ProgramOf<T>;
export {};
//# sourceMappingURL=runtime.d.ts.map