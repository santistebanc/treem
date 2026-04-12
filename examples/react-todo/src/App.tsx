import { useState, useRef, useEffect } from 'react'
import { store, type Filter, type Todo } from './store'
import { useWatchable } from './useWatchable'

export function App() {
  const todos      = useWatchable(store.filtered)
  const filter     = useWatchable(store.filter)
  const remaining  = useWatchable(store.remaining)
  const hasAnyDone = useWatchable(store.hasAnyDone)

  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed) return
    store.add(trimmed)
    setText('')
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <a href="../" style={styles.back}>← Examples</a>
        <h1 style={styles.title}>Tasks</h1>

        {/* Input */}
        <div style={styles.inputRow}>
          <input
            ref={inputRef}
            style={styles.input}
            value={text}
            placeholder="Add a task…"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
          />
          <button style={styles.addBtn} onClick={submit}>Add</button>
        </div>

        {/* List */}
        {todos.length === 0 ? (
          <div style={styles.empty}>
            {filter === 'all' ? 'No tasks yet.' : `No ${filter} tasks.`}
          </div>
        ) : (
          <ul style={styles.list}>
            {todos.map((todo: Todo) => (
              <li key={todo.id} style={styles.item}>
                <button
                  style={{ ...styles.check, ...(todo.done ? styles.checkDone : {}) }}
                  onClick={() => store.toggle(todo.id)}
                  aria-label="Toggle"
                >
                  {todo.done && '✓'}
                </button>
                <span style={{ ...styles.itemText, ...(todo.done ? styles.itemDone : {}) }}>
                  {todo.text}
                </span>
                <button
                  style={styles.remove}
                  onClick={() => store.remove(todo.id)}
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <div style={styles.footer}>
          <span style={styles.count}>{remaining} left</span>
          <div style={styles.filters}>
            {(['all', 'active', 'done'] as Filter[]).map(f => (
              <button
                key={f}
                style={{ ...styles.filterBtn, ...(filter === f ? styles.filterActive : {}) }}
                onClick={() => store.setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {hasAnyDone && (
            <button style={styles.clearBtn} onClick={() => store.clearDone()}>
              Clear done
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    background: '#f5f5f7',
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: '2rem 1rem',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: '2rem',
    boxShadow: '0 4px 24px rgba(0,0,0,.08)',
    width: '100%',
    maxWidth: 440,
  },
  back: {
    display: 'block',
    fontSize: '.82rem',
    color: '#aaa',
    textDecoration: 'none',
    marginBottom: '1rem',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 800,
    marginBottom: '1.5rem',
    color: '#111',
  },
  inputRow: {
    display: 'flex',
    gap: '.5rem',
    marginBottom: '1.25rem',
  },
  input: {
    flex: 1,
    padding: '.6rem .9rem',
    border: '1.5px solid #e0e0e0',
    borderRadius: 10,
    fontSize: '.95rem',
    fontFamily: 'inherit',
    outline: 'none',
    color: '#111',
  },
  addBtn: {
    padding: '.6rem 1.1rem',
    background: '#111',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: '.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  list: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '.4rem',
    marginBottom: '1.25rem',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '.75rem',
    padding: '.6rem .75rem',
    borderRadius: 10,
    background: '#fafafa',
    border: '1px solid #f0f0f0',
  },
  check: {
    width: 22, height: 22,
    borderRadius: 6,
    border: '2px solid #ddd',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '.75rem',
    fontWeight: 700,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  },
  checkDone: {
    background: '#111',
    border: '2px solid #111',
  },
  itemText: {
    flex: 1,
    fontSize: '.95rem',
    color: '#111',
  },
  itemDone: {
    textDecoration: 'line-through',
    color: '#aaa',
  },
  remove: {
    width: 24, height: 24,
    borderRadius: 6,
    border: 'none',
    background: 'transparent',
    color: '#ccc',
    fontSize: '1.1rem',
    cursor: 'pointer',
    display: 'grid',
    placeItems: 'center',
    lineHeight: 1,
    flexShrink: 0,
  },
  empty: {
    textAlign: 'center',
    color: '#bbb',
    fontSize: '.9rem',
    padding: '2rem 0',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '.5rem',
    fontSize: '.82rem',
    color: '#aaa',
  },
  count: { marginRight: 'auto' },
  filters: { display: 'flex', gap: '.25rem' },
  filterBtn: {
    padding: '.3rem .6rem',
    border: '1px solid transparent',
    borderRadius: 6,
    background: 'transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: '.82rem',
    fontFamily: 'inherit',
  },
  filterActive: {
    border: '1px solid #ddd',
    color: '#111',
    fontWeight: 600,
  },
  clearBtn: {
    padding: '.3rem .6rem',
    border: 'none',
    borderRadius: 6,
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontSize: '.82rem',
    fontFamily: 'inherit',
  },
}
