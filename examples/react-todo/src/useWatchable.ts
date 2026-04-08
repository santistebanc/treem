import { useSyncExternalStore, useRef } from 'react'
import { type Watchable, watch } from 'treem'

/**
 * Subscribe to any treem node. Re-renders the component whenever the value changes.
 *
 * The snapshot is cached in a ref so that getSnapshot returns a stable reference
 * between renders — required by useSyncExternalStore to avoid infinite loops when
 * the node resolves to a new array or object reference on each call (e.g. filtered lists).
 */
export function useWatchable<T>(node: Watchable<T>): T {
  const cache = useRef<{ snap: T }>(null as any)
  if (!cache.current) cache.current = { snap: node() }

  return useSyncExternalStore(
    cb => watch(node, value => {
      cache.current = { snap: value }
      cb()
    }),
    () => cache.current.snap
  )
}
