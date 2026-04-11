import { ref, calc, update, arg, run, watch } from 'treem'
import { renderCodePanel } from '../_shared/code-panel'
import tsSource   from './main.ts?raw'
import htmlSource from './index.html?raw'

// ─── State ────────────────────────────────────────────────────────────────────

const count = ref<number>('count')
const step  = ref<number>('step')

// ─── Derived ─────────────────────────────────────────────────────────────────

const doubled = calc(n => n * 2, [count])
const canDec  = calc((n, s) => n - s >= 0, [count, step])

// ─── App ─────────────────────────────────────────────────────────────────────

const store = run({
  [count]: 0,
  [step]:  1,

  count,
  step,
  doubled,
  canDec,

  inc:     update({ [count]: calc((n, s) => n + s, [count, step]) }),
  dec:     update({ [count]: calc((n, s) => n - s, [count, step]) }),
  reset:   update({ [count]: 0 }),
  setStep: update<[number]>({ [step]: arg<number>(0) }),
})

// ─── DOM ─────────────────────────────────────────────────────────────────────

const el = (id: string) => document.getElementById(id)!

watch(store.count,   n => { el('count').textContent    = String(n) })
watch(store.doubled, n => { el('doubled').textContent  = String(n) })
watch(store.step,    n => { el('step-val').textContent = String(n) })
watch(store.canDec,  ok => { (el('dec') as HTMLButtonElement).disabled = !ok })

el('inc').addEventListener('click',   () => store.inc())
el('dec').addEventListener('click',   () => store.dec())
el('reset').addEventListener('click', () => store.reset())
el('step').addEventListener('input',  e => {
  store.setStep(Number((e.target as HTMLInputElement).value))
})

// Initial render
el('count').textContent    = String(store.count())
el('doubled').textContent  = String(store.doubled())
el('step-val').textContent = String(store.step())
;(el('dec') as HTMLButtonElement).disabled = !store.canDec()

// ─── Code panel ───────────────────────────────────────────────────────────────

renderCodePanel(el('code-panel'), [
  { name: 'main.ts',    source: tsSource },
  { name: 'index.html', source: htmlSource },
])
