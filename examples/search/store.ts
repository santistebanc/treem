import { ref, calc, event, update, arg, run } from 'treem'
import type { User, Status } from './types'

// ─── Refs ─────────────────────────────────────────────────────────────────────

const query    = ref<string>('query')
const status   = ref<Status>('status')
const users    = ref<User[]>('users')
const errorMsg = ref<string>('errorMsg')

// ─── Events ───────────────────────────────────────────────────────────────────

// Fires once per successful search — good for analytics, caching, logging.
// Watching `users` state would also fire during loading/error transitions;
// this only fires when results actually land.
export const searched = event<[query: string, count: number]>('searched')

// ─── Derived ─────────────────────────────────────────────────────────────────

const isLoading = calc(s => s === 'loading', [status])
const isSuccess = calc(s => s === 'success', [status])
const isError   = calc(s => s === 'error',   [status])
const isEmpty   = calc((s, u) => s === 'success' && u.length === 0, [status, users])

// ─── Store ────────────────────────────────────────────────────────────────────

export const store = run({
  [query]:    '',
  [status]:   'idle' as Status,
  [users]:    [] as User[],
  [errorMsg]: '',

  query, status, users, errorMsg,
  isLoading, isSuccess, isError, isEmpty,

  setQuery: update<[string]>({ [query]: arg<string>(0) }),

  // State transitions — driven by the async layer, not directly by the UI
  reset:        update({ [status]: 'idle'    as Status, [users]: [] as User[], [errorMsg]: '' }),
  startLoading: update({ [status]: 'loading' as Status, [users]: [] as User[], [errorMsg]: '' }),
  setResults:   update<[User[], string]>({
    [status]: 'success' as Status,
    [users]:  arg<User[]>(0),
    [searched]: [arg<string>(1), calc(u => u.length, [arg<User[]>(0)])],
  }),
  setError: update<[string]>({ [status]: 'error' as Status, [errorMsg]: arg<string>(0) }),
})

