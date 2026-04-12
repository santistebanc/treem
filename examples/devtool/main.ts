import { ref, calc, iff, update, arg, run, watch, devtool } from 'treem'

// ─── Refs ─────────────────────────────────────────────────────────────────────

const count   = ref<number>('count')
const step    = ref<number>('step')
const isDark  = ref<boolean>('isDark')
const name    = ref<string>('name')
const visible = ref<boolean>('visible')

// ─── App tree ─────────────────────────────────────────────────────────────────

const store = run({
  [count]:   0,
  [step]:    1,
  [isDark]:  false,
  [name]:    'World',
  [visible]: true,

  // Exposed refs (so devtool can subscribe to them)
  count,
  step,
  isDark,
  name,
  visible,

  // Derived values
  doubled:  calc(n => n * 2, [count]),
  canDec:   calc((n, s) => n - s >= 0, [count, step]),
  greeting: calc((n: string) => `Hello, ${n}!`, [name]),

  // Conditional: simple iff node
  label: iff(isDark, 'Dark mode', 'Light mode'),

  // Distributed iff: each key gets its own iff leaf
  theme: iff(isDark,
    { bg: '#111111', fg: '#eeeeee', accent: '#58a6ff' },
    { bg: '#ffffff', fg: '#111111', accent: '#0969da' },
  ),

  // Actions (no args)
  inc:       update({ [count]: calc((n, s) => n + s, [count, step]) }),
  dec:       update({ [count]: calc((n, s) => n - s, [count, step]) }),
  reset:     update({ [count]: 0, [step]: 1 }),
  toggleDark: update({ [isDark]: calc(v => !v, [isDark]) }),
  toggleVis:  update({ [visible]: calc(v => !v, [visible]) }),

  // Actions with args
  setStep:  update<[number]>({ [step]:  arg<number>(0) }),
  setName:  update<[string]>({ [name]:  arg<string>(0) }),
  addCount: update<[number]>({ [count]: calc((n: number, delta: number) => n + delta, [count, arg<number>(0)]) }),

  // Nested scope
  nested: {
    [count]: 100,   // shadow count inside this scope
    count,          // exposes the shadowed count
    halved: calc(n => n / 2, [count]),
    bump:   update({ [count]: calc(n => n + 10, [count]) }),
  },
})

// ─── Simple demo UI so there's something on the page ─────────────────────────

document.body.innerHTML = `
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f5f5f7;min-height:100vh;display:grid;place-items:center}
    .card{background:#fff;border-radius:16px;padding:2rem;box-shadow:0 4px 24px rgba(0,0,0,.08);width:320px;display:flex;flex-direction:column;gap:1rem}
    h2{font-size:1rem;font-weight:700;color:#111}
    .row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
    button{border:none;border-radius:8px;padding:.45rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;font-family:inherit}
    .btn-dark{background:#111;color:#fff}
    .btn-light{background:#eee;color:#111}
    .value{font-size:1.5rem;font-weight:800;font-variant-numeric:tabular-nums;color:#111}
    input[type=text]{border:1px solid #ddd;border-radius:8px;padding:.4rem .75rem;font-family:inherit;font-size:.85rem;flex:1;outline:none}
    input[type=text]:focus{border-color:#007aff}
    small{color:#aaa;font-size:.75rem}
    .back{font-size:.8rem;color:#888;text-decoration:none;display:inline-block;margin-bottom:.25rem}
    .back:hover{color:#111}
  </style>
  <div class="card">
    <a class="back" href="../">← Examples</a>
    <h2>treem devtools demo</h2>
    <small>Open the devtool panel in the bottom-right corner.</small>
    <div class="row">
      <span class="value" id="count">0</span>
      <span id="x2" style="color:#aaa">×2 =</span>
      <span class="value" id="doubled" style="color:#58a6ff">0</span>
    </div>
    <div class="row">
      <button class="btn-light" id="dec">−</button>
      <button class="btn-light" id="reset">Reset</button>
      <button class="btn-dark"  id="inc">+</button>
    </div>
    <div class="row">
      <button class="btn-light" id="toggleDark">Toggle dark</button>
      <span id="label" style="color:#aaa;font-size:.85rem"></span>
    </div>
    <div class="row">
      <input type="text" id="name" placeholder="Name…">
      <span id="greeting" style="color:#333;font-size:.85rem"></span>
    </div>
  </div>
`

const $ = (id: string) => document.getElementById(id)!

watch(store.count,    n => { $('count').textContent    = String(n) })
watch(store.doubled,  n => { $('doubled').textContent  = String(n) })
watch(store.label,    v => { $('label').textContent    = String(v) })
watch(store.greeting, v => { $('greeting').textContent = String(v) })

const card = document.querySelector('.card') as HTMLElement
watch(store.theme.bg, (bg: string) => {
  const dark = bg !== '#ffffff'
  document.body.style.background = dark ? '#0d1117' : '#f5f5f7'
  card.style.background = bg
  card.style.boxShadow = dark ? '0 4px 24px rgba(0,0,0,.4)' : '0 4px 24px rgba(0,0,0,.08)'
  ;(card.querySelector('h2') as HTMLElement).style.color = dark ? '#eeeeee' : '#111111'
  card.querySelectorAll<HTMLElement>('.btn-light').forEach(b => {
    b.style.background = dark ? '#30363d' : '#eee'
    b.style.color = dark ? '#e6edf3' : '#111'
  })
  ;(card.querySelector('.btn-dark') as HTMLElement).style.background = dark ? '#58a6ff' : '#111'
  ;(card.querySelector('input') as HTMLElement).style.background = dark ? '#161b22' : ''
  ;(card.querySelector('input') as HTMLElement).style.borderColor = dark ? '#30363d' : '#ddd'
  ;(card.querySelector('input') as HTMLElement).style.color = dark ? '#e6edf3' : ''
  ;($('count') as HTMLElement).style.color = dark ? '#e6edf3' : '#111'
  ;($('x2') as HTMLElement).style.color = dark ? '#6e7681' : '#aaa'
  ;($('label') as HTMLElement).style.color = dark ? '#8b949e' : '#aaa'
  ;($('greeting') as HTMLElement).style.color = dark ? '#c9d1d9' : '#333'
  ;(card.querySelector('small') as HTMLElement).style.color = dark ? '#6e7681' : '#aaa'
})

$('inc').addEventListener('click', () => store.inc())
$('dec').addEventListener('click', () => store.dec())
$('reset').addEventListener('click', () => store.reset())
$('toggleDark').addEventListener('click', () => store.toggleDark())
$('name').addEventListener('input', e => {
  store.setName((e.target as HTMLInputElement).value || 'World')
})

// Initial render
$('count').textContent    = String(store.count())
$('doubled').textContent  = String(store.doubled())
$('label').textContent    = String(store.label())
$('greeting').textContent = String(store.greeting())

// ─── Open devtool (must be after body is update up) ──────────────────────────────

devtool(store, {
  count,
  step,
  isDark,
  name,
  visible,
  doubled:    calc(n => n * 2, [count]),
  canDec:     calc((n, s) => n - s >= 0, [count, step]),
  greeting:   calc((n: string) => `Hello, ${n}!`, [name]),
  label:      iff(isDark, 'Dark mode', 'Light mode'),
  theme: iff(isDark,
    { bg: '#111111', fg: '#eeeeee', accent: '#58a6ff' },
    { bg: '#ffffff', fg: '#111111', accent: '#0969da' },
  ),
  inc:        update({ [count]: calc((n, s) => n + s, [count, step]) }),
  dec:        update({ [count]: calc((n, s) => n - s, [count, step]) }),
  reset:      update({ [count]: 0, [step]: 1 }),
  toggleDark: update({ [isDark]: calc(v => !v, [isDark]) }),
  toggleVis:  update({ [visible]: calc(v => !v, [visible]) }),
  setStep:    update<[number]>({ [step]:  arg<number>(0) }),
  setName:    update<[string]>({ [name]:  arg<string>(0) }),
  addCount:   update<[number]>({ [count]: calc((n: number, delta: number) => n + delta, [count, arg<number>(0)]) }),
  nested: {
    [count]: 100,
    count,
    halved: calc(n => n / 2, [count]),
    bump:   update({ [count]: calc(n => n + 10, [count]) }),
  },
})
