import type { User } from './types'

const BASE = 'https://dummyjson.com/users/search'

export function searchUsers(query: string, signal: AbortSignal): Promise<User[]> {
  return fetch(`${BASE}?q=${encodeURIComponent(query)}&limit=8`, { signal })
    .then(r => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
      return r.json() as Promise<{ users: User[] }>
    })
    .then(data => data.users)
}
