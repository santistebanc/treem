import { ref, iff, update, run, watch } from 'treem'
import tsSource   from './main.ts?raw'
import htmlSource from './index.html?raw'
import { renderCodePanel } from '../_shared/code-panel'

const annual = ref<boolean>('annual')
const pro    = ref<boolean>('pro')

const store = run({
  [annual]: false,
  [pro]:    false,
  annual,
  pro,

  setMonthly: update({ [annual]: false }),
  setAnnual:  update({ [annual]: true }),
  setBasic:   update({ [pro]: false }),
  setPro:     update({ [pro]: true }),

  plan: iff(pro, {
    name:    'Pro',
    tagline: 'For growing teams',
    cta:     'Start Pro',
    accent:  '#5b4fcf',
    price: iff(annual, {
      monthly: 15.99,
      billing: 'Billed $191.88 / year',
      badge:   'Save 20%',
    }, {
      monthly: 19.99,
      billing: 'Billed monthly, cancel anytime',
      badge:   '',
    }),
  }, {
    name:    'Basic',
    tagline: 'For individuals',
    cta:     'Start Basic',
    accent:  '#111111',
    price: iff(annual, {
      monthly: 7.99,
      billing: 'Billed $95.88 / year',
      badge:   'Save 20%',
    }, {
      monthly: 9.99,
      billing: 'Billed monthly, cancel anytime',
      badge:   '',
    }),
  }),
})

const el = (id: string) => document.getElementById(id)!

watch(store.plan.name,          v => { el('plan-name').textContent = v })
watch(store.plan.tagline,       v => { el('tagline').textContent = v })
watch(store.plan.cta,           v => { el('cta').textContent = `${v} →` })
watch(store.plan.accent,        v => { el('cta').style.background = v })
watch(store.plan.price.monthly, v => { el('price').textContent = `$${v.toFixed(2)}` })
watch(store.plan.price.billing, v => { el('billing').textContent = v })
watch(store.plan.price.badge,   v => { el('badge').textContent = v; el('badge').hidden = !v })

watch(store.annual, isAnnual => {
  el('monthly-btn').classList.toggle('active', !isAnnual)
  el('annual-btn').classList.toggle('active', isAnnual)
})
watch(store.pro, isPro => {
  el('basic-btn').classList.toggle('active', !isPro)
  el('pro-btn').classList.toggle('active', isPro)
})

el('monthly-btn').addEventListener('click', () => store.setMonthly())
el('annual-btn').addEventListener('click',  () => store.setAnnual())
el('basic-btn').addEventListener('click',   () => store.setBasic())
el('pro-btn').addEventListener('click',     () => store.setPro())

renderCodePanel(el('code-panel'), [
  { name: 'main.ts',    source: tsSource },
  { name: 'index.html', source: htmlSource },
])
