import { ref, calc, iff, set, arg, run, watch, type Expr } from 'treem'
import tsSource   from './main.ts?raw'
import htmlSource from './index.html?raw'
import { renderCodePanel } from '../_shared/code-panel'

// ─── State ────────────────────────────────────────────────────────────────────

const step   = ref<number>('step')
const name   = ref<string>('name')
const email  = ref<string>('email')
const plan   = ref<'free' | 'pro'>('plan')
const agreed = ref<boolean>('agreed')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isStep = (n: number) => calc(s => s === n, [step])
const clamp  = (lo: number, hi: number, x: Expr<number>) =>
  calc(v => Math.min(Math.max(v, lo), hi), [x])

// named expressions — reused in multiple places, keep the tree clean
const isPro   = calc(p => p === 'pro', [plan])
const nameOk  = calc(n => n.trim().length > 0, [name])
const emailOk = calc(e => /^[^@]+@[^@]+$/.test(e), [email])

// ─── App ─────────────────────────────────────────────────────────────────────

const wizard = run({
  [step]:   1,
  [name]:   '',
  [email]:  '',
  [plan]:   'free',
  [agreed]: false,

  // ── Navigation ───────────────────────────────────────────────────────────────
  next: set({ [step]: clamp(1, 3, calc(s => s + 1, [step])) }),
  back: set({ [step]: clamp(1, 3, calc(s => s - 1, [step])) }),

  // ── Step 1: personal details ──────────────────────────────────────────────────
  details: {
    setName:  set<[string]>({ [name]:  arg<string>(0) }),
    setEmail: set<[string]>({ [email]: arg<string>(0) }),

    errors: {
      name:  iff(nameOk,  '', 'Name is required'),
      email: iff(emailOk, '', 'Invalid email'),
    },
  },

  // ── Step 2: plan selection ────────────────────────────────────────────────────
  //    iff over objects → each key is its own reactive node
  planInfo: iff(isPro, {
    label:     'Pro',
    price:     '$12 / month',
    seats:     'Up to 10',
    apiAccess: true,
    cta:       calc(n => `Upgrade, ${n}!`, [name]),
  }, {
    label:     'Free',
    price:     'Free forever',
    seats:     '1 seat',
    apiAccess: false,
    cta:       'Get started',
  }),

  setPlan: set<['free' | 'pro']>({ [plan]: arg<'free' | 'pro'>(0) }),

  // ── Step 3: review ────────────────────────────────────────────────────────────
  agree:    set({ [agreed]: true }),
  disagree: set({ [agreed]: false }),

  summary: {
    greeting: calc(n => `Hi ${n}, you're almost done.`, [name]),
    line1:    calc(e => `Email: ${e}`, [email]),
    line2:    calc(p => `Plan:  ${p}`, [plan]),
  },

  // ── Progress ──────────────────────────────────────────────────────────────────
  progress: {
    label:  iff(isStep(1), 'Your details', iff(isStep(2), 'Choose a plan', 'Confirm')),
    pct:    iff(isStep(1), 33,             iff(isStep(2), 66,              100)),
    isLast: isStep(3),
  },

  // ── Gate — blocks Next until the current step is valid ────────────────────────
  canNext: calc(
    (s, nok, eok, a) => s === 1 ? nok && eok : s === 2 ? true : a,
    [step, nameOk, emailOk, agreed]
  ),

  // ── Tabs array — each tab is a scope ─────────────────────────────────────────
  tabs: [
    { id: 'details', active: isStep(1), done: calc((nok, eok) => nok && eok, [nameOk, emailOk]) },
    { id: 'plan',    active: isStep(2), done: calc(() => true, [plan]) },
    { id: 'confirm', active: isStep(3), done: agreed },
  ],
})

// ─── DOM ─────────────────────────────────────────────────────────────────────

const el = (id: string) => document.getElementById(id)!

wizard.tabs.forEach((tab, i) => {
  watch(tab.active, v => {
    el(`step-${i + 1}`).hidden = !v
    el(`tab-${i}`).classList.toggle('active', v)
  })
  watch(tab.done, v => {
    el(`tab-${i}`).classList.toggle('done', v)
  })
})

watch(wizard.details.errors.name,  v => { el('name-error').textContent  = v; el('name-error').hidden  = !v })
watch(wizard.details.errors.email, v => { el('email-error').textContent = v; el('email-error').hidden = !v })

watch(wizard.planInfo.label, label => {
  el('card-free').classList.toggle('selected', label === 'Free')
  el('card-pro').classList.toggle('selected', label === 'Pro')
})
watch(wizard.planInfo.price,     v => { el('pro-price').textContent = v })
watch(wizard.planInfo.seats,     v => { el('pro-seats').textContent = v })
watch(wizard.planInfo.apiAccess, v => { el('api-badge').hidden = !v })
watch(wizard.planInfo.cta,       v => { el('plan-cta').textContent = v })

watch(wizard.summary.greeting, v => { el('summary-greeting').textContent = v })
watch(wizard.summary.line1,    v => { el('summary-line1').textContent    = v })
watch(wizard.summary.line2,    v => { el('summary-line2').textContent    = v })

watch(wizard.progress.pct,    v => { el('progress-fill').style.width = `${v}%` })
watch(wizard.progress.label,  v => { el('progress-label').textContent = v })
watch(wizard.progress.isLast, v => { el('next-btn').textContent = v ? 'Submit ✓' : 'Next →' })

watch(wizard.canNext, ok => { (el('next-btn') as HTMLButtonElement).disabled = !ok })
watch(wizard.tabs[0].active, v => {
  (el('back-btn') as HTMLButtonElement).disabled = v
  el('back-btn').style.visibility = v ? 'hidden' : 'visible'
})

// ─── Events ───────────────────────────────────────────────────────────────────

el('name-input').addEventListener('input',  e => wizard.details.setName((e.target as HTMLInputElement).value))
el('email-input').addEventListener('input', e => wizard.details.setEmail((e.target as HTMLInputElement).value))

el('card-free').addEventListener('click', () => wizard.setPlan('free'))
el('card-pro').addEventListener('click',  () => wizard.setPlan('pro'))

el('agree-check').addEventListener('change', e => {
  ;(e.target as HTMLInputElement).checked ? wizard.agree() : wizard.disagree()
})

el('back-btn').addEventListener('click', () => wizard.back())
el('next-btn').addEventListener('click', () => { if (!wizard.progress.isLast()) wizard.next() })

// ─── Code panel ───────────────────────────────────────────────────────────────

renderCodePanel(el('code-panel'), [
  { name: 'main.ts',    source: tsSource },
  { name: 'index.html', source: htmlSource },
])
