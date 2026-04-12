import { ref, calc, run, update, arg, watch, record } from './src/index'

// ─── mapRef sketch ────────────────────────────────────────────────────────────
//
// Goal: cell-granular reactivity for key-value collections.
//
// Problem with current ref<Record<string, Player>>:
//   One Def holds the whole object. Any mutation (one player answers) replaces
//   the whole value → all downstream calcs recompute from scratch.
//
// mapRef solution:
//   Two layers of Defs:
//     1. Per-key Defs  — one Def per entry, only dirtied when that key changes
//     2. Whole-map Def — dirtied when any key changes (for aggregate calcs)
//
//   store.players.get('alice') subscribes to alice's Def only.
//   calc(..., [players]) subscribes to the whole-map Def.
//   When bob answers, only bob's Def + whole-map Def are dirtied.
//   Alice's watcher never fires.

// ─── API ─────────────────────────────────────────────────────────────────────

// mapRef<K, V>(name) — like ref<Map<K,V>> but with per-key reactivity
// declared: const players = mapRef<string, Player>('players')
//
// mapSet(keyExpr, valueExpr) — update helper: set one key
// mapDelete(keyExpr)         — update helper: remove one key
// mapMerge(keyExpr, patchExpr) — update helper: shallow-merge one entry
//
// In run(), [players] initial value is {} or new Map()
//
// Materialized program exposes:
//   store.players()           → whole map (Record<K,V> snapshot)
//   store.players.get(key)    → Watchable<V | undefined> for that key only
//   store.players.size()      → Watchable<number> (derived, optional sugar)

// ─── Example: multiplayer quiz ───────────────────────────────────────────────

// Hypothetical imports (not yet implemented):
// import { mapRef, mapSet, mapMerge, mapDelete } from './src/index'

// Declarations — same pattern as ref/event
// const players = mapRef<string, Player>('players')
// const myId    = ref<string>('myId')

// const store = run({
//   [players]: {},
//   [myId]:    '',
//
//   players,
//   myId,
//
//   // ── Whole-map calcs (coarse dep — recompute when any player changes) ──────
//   playerList:    calc(ps => Object.values(ps).sort((a, b) => b.score - a.score), [players]),
//   answeredCount: calc(ps => Object.values(ps).filter(p => p.answered).length,    [players]),
//   totalPlayers:  calc(ps => Object.keys(ps).length,                               [players]),
//   allAnswered:   calc((answered, total) => total > 0 && answered === total,
//                       [answeredCount, totalPlayers]),                              // fine — depends on derived
//
//   // ── Per-player calcs (fine dep — only recompute when that player changes) ─
//   // players.entry(myId) is a node: "the entry keyed by myId's current value"
//   // It re-derives when either myId changes OR that specific player changes.
//   myPlayer: calc(p => p, [players.entry(myId)]),
//
//   // ── Actions ───────────────────────────────────────────────────────────────
//   addPlayer:    update<string, Player>({ [players]: mapSet(arg(0), arg(1)) }),
//   removePlayer: update<string>({         [players]: mapDelete(arg(0)) }),
//
//   // Shallow-merge: only updates the entry's changed fields
//   setAnswer: update<string, string>({
//     [players]: mapMerge(arg(0), { answered: true, answer: arg(1) }),
//   }),
//   addScore: update<string, number>({
//     [players]: mapMerge(arg(0), calc((p, n) => ({ score: p.score + n }), [players.entry(arg(0)), arg(1)])),
//   }),
// })

// ─── Usage ───────────────────────────────────────────────────────────────────

// store.addPlayer('alice', { name: 'Alice', score: 0, answered: false, answer: '' })
// store.addPlayer('bob',   { name: 'Bob',   score: 0, answered: false, answer: '' })

// store.playerList()    // [{ name: 'Alice', ... }, { name: 'Bob', ... }]
// store.totalPlayers()  // 2
// store.allAnswered()   // false

// Per-key watchable — only fires when alice's entry changes
// watch(store.players.get('alice'), player => console.log('alice changed', player))

// store.setAnswer('alice', 'Paris')
// → alice's Def dirtied → store.players.get('alice') watcher fires
// → whole-map Def dirtied → answeredCount recomputes → allAnswered recomputes
// → bob's Def untouched → bob watchers silent

// store.setAnswer('bob', 'London')
// → bob's Def dirtied → answeredCount recomputes → allAnswered = true → reveal fires
// → alice's watcher silent

// ─── Runtime notes ───────────────────────────────────────────────────────────
//
// What the runtime needs (changes from current):
//
// nodes.ts:
//   mapRefSymbols: Set<symbol>  — like refSymbols, to identify mapRef nodes
//   mapRef<K,V>(name): MapRefNode<K,V>  — creates sym, registers in mapRefSymbols
//   mapSet / mapDelete / mapMerge — new node types used in update assignments
//   players.entry(keyExpr)  — node that resolves to a per-key Def at eval time
//
// runtime.ts — build():
//   When sym is in mapRefSymbols, create a MapStore<K,V>:
//     { wholeDef: Def, keyDefs: Map<K, Def> }
//   Stored separately from scope.defs (or in scope.defs with a wrapper type).
//
// runtime.ts — eval_():
//   case 'mapSet':    evaluate key+value exprs, return a MapPatch descriptor
//   case 'mapDelete': evaluate key expr, return a MapPatch descriptor
//   case 'mapMerge':  evaluate key+patch exprs, return a MapPatch descriptor
//   case 'mapEntry':  resolve the per-key Def, register dep on it (like 'ref' does)
//
// runtime.ts — update handler:
//   When assignment sym is in mapRefSymbols, apply MapPatch:
//     1. Update / delete the entry in the underlying Map
//     2. Dirty the per-key Def for the affected key (add to stateUpdates)
//     3. Dirty the whole-map Def (add to stateUpdates)
//     → propagate() handles the rest unchanged
//
// callable():
//   When node is a MapStore:
//     fn()           → returns whole map snapshot
//     fn.get(key)    → returns Watchable backed by per-key Def (create lazily)
//     fn[SUBSCRIBE]  → subscribes to wholeDef

type Player = { name: string; score: number; answered: boolean; answer: string }

const players = ref<Record<string, Player>>('players')

const store = {
  [players]: {},
  addPlayer: update<string, Player>({ [players(arg(0))]: arg(1) }),
  removePlayer: update<string>({ [players(arg(0))]: undefined }),
  addScore: update<string, number>({
    [players(arg(0))]: calc(
      (p, n) => (p ? { ...p, score: p.score + n } : p),
      [players(arg<string>(0)), arg<number>(1)]   // players(arg(0)) as a calc dep reads the current entry
    ),
  })

}