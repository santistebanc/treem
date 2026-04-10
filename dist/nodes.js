"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isNode = exports.ctxSymbols = exports.VALUE = exports.isObj = void 0;
exports.ctx = ctx;
exports.calc = calc;
exports.iff = iff;
exports.set = set;
exports.arg = arg;
exports.resource = resource;
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
exports.isObj = isObj;
const NODE = Symbol('node');
exports.VALUE = Symbol('value');
exports.ctxSymbols = new Set();
const isNode = (x) => (0, exports.isObj)(x) && x[NODE] === true;
exports.isNode = isNode;
const allKeys = (o) => Object.keys(o).concat(Object.getOwnPropertySymbols(o));
const mark = (n) => Object.defineProperty(n, NODE, { value: true });
// ─── Declarative API ─────────────────────────────────────────────────────────
function ctx(ref) {
    const sym = Symbol(ref);
    exports.ctxSymbols.add(sym);
    return mark({ type: 'ctx', ref, sym, [Symbol.toPrimitive]: () => sym });
}
function calc(fn, args) {
    return mark({ type: 'calc', fn, args });
}
const normalize = (v) => Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [i, x])) : v;
function iff(cond, onTrue, onFalse = undefined) {
    onTrue = normalize(onTrue);
    onFalse = normalize(onFalse);
    const tObj = (0, exports.isObj)(onTrue) && !(0, exports.isNode)(onTrue);
    const fObj = (0, exports.isObj)(onFalse) && !(0, exports.isNode)(onFalse);
    if (!tObj && !fObj)
        return mark({ type: 'iff', cond, onTrue, onFalse });
    const out = {};
    if (tObj !== fObj)
        out[exports.VALUE] = mark({
            type: 'iff',
            cond,
            onTrue: tObj ? undefined : onTrue,
            onFalse: fObj ? undefined : onFalse,
        });
    const keys = new Set([
        ...(tObj ? allKeys(onTrue) : []),
        ...(fObj ? allKeys(onFalse) : []),
    ]);
    for (const k of keys)
        out[k] = iff(cond, tObj ? onTrue[k] : undefined, fObj ? onFalse[k] : undefined);
    return out;
}
function set(assignments) {
    return mark({ type: 'set', assignments });
}
function arg(index) {
    return mark({ type: 'arg', index });
}
/** Async data keyed by reactive `args`. Re-reads when deps change; passes {@link AbortSignal} for cancellation / stale work. */
function resource(fetch, args) {
    return mark({ type: 'resource', fetch, args });
}
//# sourceMappingURL=nodes.js.map