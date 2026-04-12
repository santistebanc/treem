import { watch } from 'treem'
import { store, searched } from './store'
import { searchUsers } from './api'
import { debounce } from './debounce'
import { renderCodePanel } from '../_shared/code-panel'
import storeSource   from './store.ts?raw'
import apiSource     from './api.ts?raw'
import debounceSource from './debounce.ts?raw'
import mainSource    from './main.ts?raw'
import htmlSource    from './index.html?raw'

// ─── Async layer ──────────────────────────────────────────────────────────────
//
// The store is entirely synchronous. Async work lives here, outside the tree.
//
// `debounce` returns the cleanup directly — watch passes it to treem,
// which calls it when the query changes. One cleanup handles both cases:
// timer still pending → clearTimeout; fetch in flight → abort.

watch(store.query, q => {
  if (!q.trim()) return void store.reset()
  return debounce(300, signal => {
    store.startLoading()
    searchUsers(q.trim(), signal)
      .then(users => store.setResults(users, q.trim()))
      .catch(err  => { if (err.name !== 'AbortError') store.setError(err.message) })
  })
})

watch(searched, (q, n) => console.log(`searched "${q}" → ${n} result${n === 1 ? '' : 's'}`))

// ─── DOM ─────────────────────────────────────────────────────────────────────

const el = (id: string) => document.getElementById(id)!

watch(store.isLoading, v => { el('spinner').hidden   = !v })
watch(store.isError,   v => { el('error-box').hidden = !v })
watch(store.isEmpty,   v => { el('empty-box').hidden = !v })
watch(store.isSuccess, v => { el('results').hidden   = !v })
watch(store.errorMsg,  v => { el('error-text').textContent = v })
watch(store.users, list => {
  el('results').innerHTML = list.map(u => `
    <div class="user-card">
      <img src="${u.image}" alt="${u.username}" loading="lazy">
      <span class="name">${u.firstName} ${u.lastName}</span>
      <span class="username">@${u.username}</span>
    </div>
  `).join('')
})

el('search-input').addEventListener('input', e => {
  store.setQuery((e.target as HTMLInputElement).value)
})

// ─── Code panel ───────────────────────────────────────────────────────────────

renderCodePanel(el('code-panel'), [
  { name: 'store.ts',    source: storeSource    },
  { name: 'api.ts',      source: apiSource      },
  { name: 'debounce.ts', source: debounceSource },
  { name: 'main.ts',     source: mainSource     },
  { name: 'index.html',  source: htmlSource     },
])
