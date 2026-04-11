import { ref, calc, update, arg, run } from 'treem'

export type Todo   = { id: number; text: string; done: boolean }
export type Filter = 'all' | 'active' | 'done'

// ─── State ────────────────────────────────────────────────────────────────────

const todos  = ref<Todo[]>('todos')
const filter = ref<Filter>('filter')

// ─── Derived ─────────────────────────────────────────────────────────────────

const filtered  = calc(
  (list, f) => f === 'all' ? list : list.filter(t => t.done === (f === 'done')),
  [todos, filter]
)
const remaining  = calc(list => list.filter(t => !t.done).length, [todos])
const hasAnyDone = calc(list => list.some(t => t.done), [todos])

// ─── App ─────────────────────────────────────────────────────────────────────

export const store = run({
  [todos]:  [],
  [filter]: 'all',

  filtered,
  filter,
  remaining,
  hasAnyDone,

  add:       update<[string]>({ [todos]: calc((list, text) => [...list, { id: Date.now(), text, done: false }], [todos, arg<string>(0)]) }),
  toggle:    update<[number]>({ [todos]: calc((list, id) => list.map(t => t.id === id ? { ...t, done: !t.done } : t), [todos, arg<number>(0)]) }),
  remove:    update<[number]>({ [todos]: calc((list, id) => list.filter(t => t.id !== id), [todos, arg<number>(0)]) }),
  clearDone: update({ [todos]: calc(list => list.filter(t => !t.done), [todos]) }),
  setFilter: update<[Filter]>({ [filter]: arg<Filter>(0) }),
})
