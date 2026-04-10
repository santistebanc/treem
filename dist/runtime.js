"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.watch = watch;
exports.run = run;
const nodes_js_1 = require("./nodes.js");
const SUBSCRIBE = Symbol('subscribe');
// ─── Module-level tracking state ─────────────────────────────────────────────
let tracking = null;
let watchTracking = null;
let currentArgs = [];
function addSub(subscribers, dep, sub) {
    let s = subscribers.get(dep);
    if (!s) {
        s = new Set();
        subscribers.set(dep, s);
    }
    s.add(sub);
}
function removeSubs(subscribers, oldDeps, sub) {
    for (const dep of oldDeps)
        subscribers.get(dep)?.delete(sub);
}
function argsEqual(a, b) {
    if (a === undefined || a.length !== b.length)
        return false;
    for (let i = 0; i < a.length; i++)
        if (!Object.is(a[i], b[i]))
            return false;
    return true;
}
// ─── Public API ──────────────────────────────────────────────────────────────
function watch(target, cb) {
    return target[SUBSCRIBE](cb);
}
function run(app) {
    const allDefs = [];
    const watchers = new Set();
    const scopes = new WeakSet();
    const resourceDefByNode = new WeakMap();
    const isScope = (x) => (0, nodes_js_1.isObj)(x) && scopes.has(x);
    function buildNode(v, parent) {
        if (Array.isArray(v))
            return v.map(item => buildNode(item, parent));
        if ((0, nodes_js_1.isObj)(v) && !(0, nodes_js_1.isNode)(v))
            return build(v, parent);
        if ((0, nodes_js_1.isNode)(v) && v.type === 'resource') {
            const def = {
                formula: undefined,
                value: { status: 'idle', data: undefined, error: undefined },
                scope: parent,
                deps: new Set(),
                resource: { node: v, gen: 0 },
            };
            allDefs.push(def);
            resourceDefByNode.set(v, def);
            return v;
        }
        return v;
    }
    function build(tree, parent) {
        const scope = { parent, defs: new Map(), children: {} };
        scopes.add(scope);
        for (const sym of Object.getOwnPropertySymbols(tree)) {
            if (sym === nodes_js_1.VALUE) {
                scope.valueNode = tree[sym];
                continue;
            }
            if (!nodes_js_1.ctxSymbols.has(sym))
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
        if (!(0, nodes_js_1.isNode)(node))
            return node;
        switch (node.type) {
            case 'ctx': {
                const def = findDef(node.sym, scope);
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
                try {
                    for (const sym of Object.getOwnPropertySymbols(node.assignments)) {
                        if (!nodes_js_1.ctxSymbols.has(sym))
                            continue;
                        const def = findDef(sym, scope);
                        if (!def)
                            continue;
                        const next = eval_(node.assignments[sym], scope);
                        if (next !== def.value)
                            updates.push([def, next]);
                    }
                }
                catch (err) {
                    console.error('[treem] set aborted:', err);
                    currentArgs = prevArgs;
                    return;
                }
                for (const [def, next] of updates)
                    def.value = next;
                if (updates.length > 0)
                    propagate(updates.map(([def]) => def), subscribers);
                currentArgs = prevArgs;
            };
            case 'resource': {
                const def = resourceDefByNode.get(node);
                if (def && tracking)
                    tracking.deps.add(def);
                if (def && watchTracking)
                    watchTracking.deps.add(def);
                return def?.value;
            }
        }
    }
    function reevalResource(def, subscribers) {
        const r = def.resource;
        const { node } = r;
        const scope = def.scope;
        const prev = tracking;
        const oldDeps = def.deps;
        def.deps = new Set();
        tracking = def;
        let argsVals;
        try {
            argsVals = node.args.map((a) => eval_(a, scope));
        }
        catch (err) {
            console.error('[treem] resource args error:', err);
            removeSubs(subscribers, oldDeps, def);
            for (const dep of def.deps)
                addSub(subscribers, dep, def);
            tracking = prev;
            return false;
        }
        removeSubs(subscribers, oldDeps, def);
        for (const dep of def.deps)
            addSub(subscribers, dep, def);
        tracking = prev;
        if (argsEqual(r.lastArgs, argsVals))
            return false;
        r.lastArgs = argsVals.slice();
        r.gen++;
        const gen = r.gen;
        r.abort?.abort();
        r.abort = new AbortController();
        const signal = r.abort.signal;
        const prevValue = def.value;
        const keepData = prevValue?.status === 'ok' ? prevValue.data : undefined;
        def.value = { status: 'pending', data: keepData, error: undefined };
        Promise.resolve(node.fetch(signal, ...argsVals)).then((data) => {
            if (r.gen !== gen)
                return;
            def.value = { status: 'ok', data, error: undefined };
            propagate([def], subscribers);
        }, (err) => {
            if (r.gen !== gen || signal.aborted)
                return;
            const name = err && typeof err === 'object' && 'name' in err ? err.name : '';
            if (name === 'AbortError')
                return;
            def.value = { status: 'error', data: undefined, error: err };
            propagate([def], subscribers);
        });
        return prevValue !== def.value;
    }
    function reeval(def, subscribers) {
        if (def.resource)
            return reevalResource(def, subscribers);
        const prev = tracking;
        const oldDeps = def.deps;
        def.deps = new Set();
        tracking = def;
        try {
            const next = eval_(def.formula, def.scope);
            // Update the reverse-dep index: remove from old deps, add to new deps
            removeSubs(subscribers, oldDeps, def);
            for (const dep of def.deps)
                addSub(subscribers, dep, def);
            if (next === def.value)
                return false;
            def.value = next;
            return true;
        }
        catch (err) {
            console.error('[treem] formula error:', err);
            removeSubs(subscribers, oldDeps, def);
            for (const dep of def.deps)
                addSub(subscribers, dep, def);
            return false;
        }
        finally {
            tracking = prev;
        }
    }
    function propagate(changed, subscribers) {
        const dirty = new Set(changed);
        // Walk only the affected subgraph via the reverse-dep index.
        // Use a queue so newly-dirtied defs can propagate further.
        const queue = [...changed];
        for (let i = 0; i < queue.length; i++) {
            const subs = subscribers.get(queue[i]);
            if (!subs)
                continue;
            for (const sub of [...subs]) { // snapshot: reeval modifies the set during iteration
                if ('formula' in sub) {
                    // sub is a Def
                    if (!dirty.has(sub) && reeval(sub, subscribers)) {
                        dirty.add(sub);
                        queue.push(sub);
                    }
                }
            }
        }
        // Notify watchers whose deps overlap with dirty set
        for (const w of watchers) {
            let hit = false;
            for (const dep of w.deps)
                if (dirty.has(dep)) {
                    hit = true;
                    break;
                }
            if (hit) {
                const next = w.track(subscribers);
                if (next !== w.last) {
                    w.last = next;
                    try {
                        w.cb(next);
                    }
                    catch (err) {
                        console.error('[treem] watcher error:', err);
                    }
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
    function makeSubscribe(getValue, subscribers) {
        return (cb) => {
            const w = {
                deps: new Set(),
                last: undefined,
                track: (subs) => {
                    const oldDeps = w.deps;
                    w.deps = new Set();
                    const prev = watchTracking;
                    watchTracking = w;
                    try {
                        const result = getValue();
                        // Update reverse-dep index for the watcher
                        const s = subs ?? subscribers;
                        removeSubs(s, oldDeps, w);
                        for (const dep of w.deps)
                            addSub(s, dep, w);
                        return result;
                    }
                    finally {
                        watchTracking = prev;
                    }
                },
                cb,
            };
            w.last = w.track();
            cb(w.last);
            watchers.add(w);
            return () => {
                removeSubs(subscribers, w.deps, w);
                watchers.delete(w);
            };
        };
    }
    function callable(node, scope, subscribers) {
        if (Array.isArray(node)) {
            const arr = node.map(item => callable(item, scope, subscribers));
            arr[SUBSCRIBE] = makeSubscribe(() => resolveNode(node, scope), subscribers);
            return arr;
        }
        if (isScope(node)) {
            const fn = () => resolve(node);
            for (const [k, child] of Object.entries(node.children))
                fn[k] = callable(child, node, subscribers);
            fn[SUBSCRIBE] = makeSubscribe(() => resolve(node), subscribers);
            return fn;
        }
        const fn = (...args) => { const v = eval_(node, scope); return typeof v === 'function' ? v(...args) : v; };
        fn[SUBSCRIBE] = makeSubscribe(() => eval_(node, scope), subscribers);
        return fn;
    }
    const subscribers = new Map();
    const root = build(app, null);
    for (const def of allDefs)
        reeval(def, subscribers);
    const program = callable(root, root, subscribers);
    program.dispose = () => {
        for (const def of allDefs)
            def.resource?.abort?.abort();
        for (const w of watchers)
            removeSubs(subscribers, w.deps, w);
        watchers.clear();
    };
    return program;
}
//# sourceMappingURL=runtime.js.map