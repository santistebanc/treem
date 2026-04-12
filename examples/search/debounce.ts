// Schedules fn after ms milliseconds, giving it an AbortSignal.
// Returns a cleanup that cancels the timer (if still pending)
// or aborts the signal (if fn already started).
//
// Designed to be returned directly from a watch() callback:
//
//   watch(store.query, q => debounce(300, signal => fetchSomething(q, signal)))

export function debounce(ms: number, fn: (signal: AbortSignal) => void): () => void {
  let controller: AbortController | null = null
  const timer = setTimeout(() => {
    controller = new AbortController()
    fn(controller.signal)
  }, ms)
  return () => {
    clearTimeout(timer)
    controller?.abort()
  }
}
