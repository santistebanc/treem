"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALUE = void 0;
exports.ctx = ctx;
exports.calc = calc;
exports.iff = iff;
exports.set = set;
exports.arg = arg;
exports.watch = watch;
exports.run = run;
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const NODE = Symbol('node');
exports.VALUE = Symbol('value');
const ctxSymbols = new Set();
const isNode = (x) => isObj(x) && x[NODE] === true;
const allKeys = (o) => [...Object.keys(o), ...Object.getOwnPropertySymbols(o)];
const mark = (n) => Object.defineProperty(n, NODE, { value: true });
function ctx(ref) {
    const sym = Symbol(ref);
    ctxSymbols.add(sym);
    return mark({ type: 'ctx', ref, [Symbol.toPrimitive]: () => sym });
}
function calc(fn, args) {
    return mark({ type: 'calc', fn, args });
}
function iff(cond, onTrue, onFalse = undefined) {
    const tObj = isObj(onTrue) && !isNode(onTrue);
    const fObj = isObj(onFalse) && !isNode(onFalse);
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
const SUBSCRIBE = Symbol('subscribe');
function watch(target, cb) {
    return target[SUBSCRIBE](cb);
}
let tracking = null;
let watchTracking = null;
let currentArgs = [];
function run(app) {
    const allDefs = [];
    const watchers = new Set();
    const scopes = new WeakSet();
    const isScope = (x) => isObj(x) && scopes.has(x);
    function buildNode(v, parent) {
        if (Array.isArray(v))
            return v.map(item => buildNode(item, parent));
        if (isObj(v) && !isNode(v))
            return build(v, parent);
        return v;
    }
    function build(tree, parent) {
        const scope = { parent, defs: new Map(), children: {} };
        scopes.add(scope);
        for (const sym of Object.getOwnPropertySymbols(tree)) {
            if (sym === exports.VALUE) {
                scope.valueNode = tree[sym];
                continue;
            }
            if (!ctxSymbols.has(sym))
                continue;
            const def = { formula: tree[sym], value: undefined, scope, deps: new Set() };
            scope.defs.set(sym, def);
            allDefs.push(def);
        }
        for (const key of Object.keys(tree)) {
            scope.children[key] = buildNode(tree[key], scope);
        }
        return scope;
    }
    function findDef(sym, scope) {
        for (let s = scope; s; s = s.parent)
            if (s.defs.has(sym))
                return s.defs.get(sym);
    }
    function eval_(node, scope) {
        if (!isNode(node))
            return node;
        switch (node.type) {
            case 'ctx': {
                const def = findDef(node[Symbol.toPrimitive](), scope);
                if (def && tracking)
                    tracking.deps.add(def);
                if (def && watchTracking)
                    watchTracking.deps.add(def);
                return def?.value;
            }
            case 'arg': return currentArgs[node.index];
            case 'calc': return node.fn(...node.args.map((a) => eval_(a, scope)));
            case 'iff': return eval_(node.cond, scope) ? eval_(node.onTrue, scope) : eval_(node.onFalse, scope);
            case 'set': return (...args) => {
                const prevArgs = currentArgs;
                currentArgs = args;
                const updates = [];
                for (const sym of Object.getOwnPropertySymbols(node.assignments)) {
                    if (!ctxSymbols.has(sym))
                        continue;
                    const def = findDef(sym, scope);
                    if (!def)
                        continue;
                    const next = eval_(node.assignments[sym], scope);
                    if (next !== def.value)
                        updates.push([def, next]);
                }
                for (const [def, next] of updates)
                    def.value = next;
                for (const [def] of updates)
                    propagate(def);
                currentArgs = prevArgs;
            };
        }
    }
    function reeval(def) {
        const prev = tracking;
        def.deps = new Set();
        tracking = def;
        try {
            const next = eval_(def.formula, def.scope);
            if (next === def.value)
                return false;
            def.value = next;
            return true;
        }
        finally {
            tracking = prev;
        }
    }
    function propagate(changed) {
        const dirty = new Set([changed]);
        for (const d of allDefs) {
            let hit = false;
            for (const dep of d.deps)
                if (dirty.has(dep)) {
                    hit = true;
                    break;
                }
            if (hit && reeval(d))
                dirty.add(d);
        }
        for (const w of watchers) {
            let hit = false;
            for (const dep of w.deps)
                if (dirty.has(dep)) {
                    hit = true;
                    break;
                }
            if (hit) {
                const next = w.track();
                if (next !== w.last) {
                    w.last = next;
                    w.cb(next);
                }
            }
        }
    }
    function resolveNode(v, scope) {
        if (Array.isArray(v))
            return v.map(item => resolveNode(item, scope));
        if (isScope(v))
            return resolve(v);
        return eval_(v, scope);
    }
    function resolve(scope) {
        if (scope.valueNode !== undefined) {
            const v = eval_(scope.valueNode, scope);
            if (v !== undefined)
                return v;
        }
        const out = {};
        for (const [k, child] of Object.entries(scope.children))
            out[k] = resolveNode(child, scope);
        return out;
    }
    function makeSubscribe(getValue) {
        return (cb) => {
            const w = {
                deps: new Set(),
                last: undefined,
                track: () => {
                    w.deps = new Set();
                    const prev = watchTracking;
                    watchTracking = w;
                    const v = getValue();
                    watchTracking = prev;
                    return v;
                },
                cb,
            };
            w.last = w.track();
            watchers.add(w);
            return () => watchers.delete(w);
        };
    }
    function callable(node, scope) {
        if (Array.isArray(node)) {
            const arr = node.map(item => callable(item, scope));
            arr[SUBSCRIBE] = makeSubscribe(() => resolveNode(node, scope));
            return arr;
        }
        if (isScope(node)) {
            const fn = () => resolve(node);
            for (const [k, child] of Object.entries(node.children))
                fn[k] = callable(child, node);
            fn[SUBSCRIBE] = makeSubscribe(() => resolve(node));
            return fn;
        }
        const fn = (...args) => { const v = eval_(node, scope); return typeof v === 'function' ? v(...args) : v; };
        fn[SUBSCRIBE] = makeSubscribe(() => eval_(node, scope));
        return fn;
    }
    const root = build(app, null);
    for (const def of allDefs)
        reeval(def);
    return callable(root, root);
}
//# sourceMappingURL=index.js.map