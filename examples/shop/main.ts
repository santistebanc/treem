import { ref, calc, iff, event, update, arg, run, watch, type Expr } from 'treem'
import { renderCodePanel } from '../_shared/code-panel'
import tsSource   from './main.ts?raw'
import htmlSource from './index.html?raw'

// ─── State ────────────────────────────────────────────────────────────────────

const isDark = ref<boolean>('isDark')
const coupon = ref<number>('coupon')    // discount percentage 0–100
const qtyA   = ref<number>('qtyA')
const qtyB   = ref<number>('qtyB')

// ─── Helpers ─────────────────────────────────────────────────────────────────

const inc = (q: Expr<number>) => calc(n => n + 1, [q])
const dec = (q: Expr<number>) => calc(n => Math.max(0, n - 1), [q])
const fmt = (n: number) => `$${n.toFixed(2)}`

const PRICES = [4.99, 12.99] as const
const COUPONS: Record<string, number> = { SAVE10: 10, SAVE20: 20, HALF: 50 }

// ─── Events ───────────────────────────────────────────────────────────────────

// Fires with the applied discount (> 0) or 0 when the code is invalid.
// Side effects (toast, analytics) subscribe here instead of watching coupon state.
const couponApplied = event<[pct: number, valid: boolean]>('couponApplied')

// ─── Derived ─────────────────────────────────────────────────────────────────

const subtotalA = calc(q => q * PRICES[0], [qtyA])
const subtotalB = calc(q => q * PRICES[1], [qtyB])
const subtotal  = calc((a, b) => a + b, [subtotalA, subtotalB])
const savings   = calc((s, c) => +(s * c / 100).toFixed(2), [subtotal, coupon])
const total     = calc((s, d) => +(s - d).toFixed(2), [subtotal, savings])

// ─── App ─────────────────────────────────────────────────────────────────────

const store = run({
  [isDark]: false,
  [coupon]: 0,
  [qtyA]:   0,
  [qtyB]:   0,

  toggleTheme: update({ [isDark]: calc(d => !d, [isDark]) }),
  applyCoupon: update<string>({
    [coupon]: calc((code: string) => COUPONS[code] ?? 0, [arg<string>(0)]),
    [couponApplied]: [
      calc((code: string) => COUPONS[code] ?? 0, [arg<string>(0)]),
      calc((code: string) => code in COUPONS,     [arg<string>(0)]),
    ],
  }),

  products: [
    { qty: qtyA, subtotal: subtotalA, inc: update({ [qtyA]: inc(qtyA) }), dec: update({ [qtyA]: dec(qtyA) }) },
    { qty: qtyB, subtotal: subtotalB, inc: update({ [qtyB]: inc(qtyB) }), dec: update({ [qtyB]: dec(qtyB) }) },
  ],

  cart: { subtotal, savings, total },

  // iff over objects distributes per key — each CSS variable is its own reactive node
  theme: iff(isDark, {
    bg:       '#0f0f0f',
    surface:  '#1a1a1a',
    border:   '#2a2a2e',
    text:     '#e8e8e8',
    muted:    '#888',
    accent:   '#7c6af7',
    btnBg:    '#252525',
    btnHover: '#333',
    label:    '☀ Light',
  }, {
    bg:       '#f0f2f5',
    surface:  '#ffffff',
    border:   '#e0e0e0',
    text:     '#111',
    muted:    '#666',
    accent:   '#5b4fcf',
    btnBg:    '#eee',
    btnHover: '#e0e0e0',
    label:    '☾ Dark',
  }),
})

// ─── DOM ─────────────────────────────────────────────────────────────────────

const el   = (id: string) => document.getElementById(id)!
const root = document.documentElement
import type { Watchable } from 'treem'
type Product = { qty: Watchable<number>; subtotal: Watchable<number>; inc: () => void; dec: () => void }
const products = store.products as unknown as Product[]

function applyTheme(t: any) {
  root.style.setProperty('--bg',        t.bg)
  root.style.setProperty('--surface',   t.surface)
  root.style.setProperty('--border',    t.border)
  root.style.setProperty('--text',      t.text)
  root.style.setProperty('--muted',     t.muted)
  root.style.setProperty('--accent',    t.accent)
  root.style.setProperty('--btn-bg',    t.btnBg)
  root.style.setProperty('--btn-hover', t.btnHover)
  el('toggle-theme').textContent = t.label
}

watch(store.theme,          applyTheme)
watch(products[0].qty,      (v: number) => { el('qty-0').textContent = String(v) })
watch(products[0].subtotal, (v: number) => { el('sub-0').textContent = fmt(v) })
watch(products[1].qty,      (v: number) => { el('qty-1').textContent = String(v) })
watch(products[1].subtotal, (v: number) => { el('sub-1').textContent = fmt(v) })
watch(store.cart.subtotal,  (v: number) => { el('cart-subtotal').textContent = fmt(v) })
watch(store.cart.total,     (v: number) => { el('cart-total').textContent = fmt(v) })
watch(store.cart.savings,   (v: number) => {
  el('savings-row').style.display = v > 0 ? 'flex' : 'none'
  el('cart-savings').textContent  = `−${fmt(v)}`
})

// couponApplied fires once per apply attempt — show toast feedback then clear it.
// A watch on coupon state couldn't distinguish "just applied" from "already active".
watch(couponApplied, (pct, valid) => {
  const msg = el('coupon-msg')
  msg.textContent = valid ? `✓ ${pct}% off applied!` : '✗ Invalid code'
  msg.className   = valid ? 'coupon-ok' : 'coupon-err'
  msg.hidden      = false
  setTimeout(() => { msg.hidden = true }, 2500)
})

el('toggle-theme').addEventListener('click', () => store.toggleTheme())
el('inc-0').addEventListener('click', () => products[0].inc())
el('dec-0').addEventListener('click', () => products[0].dec())
el('inc-1').addEventListener('click', () => products[1].inc())
el('dec-1').addEventListener('click', () => products[1].dec())
el('coupon-apply').addEventListener('click', () => {
  const input = el('coupon-input') as HTMLInputElement
  store.applyCoupon(input.value.trim().toUpperCase())
})
el('coupon-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') el('coupon-apply').click()
})

// Initial render
applyTheme(store.theme())

// ─── Code panel ───────────────────────────────────────────────────────────────

renderCodePanel(el('code-panel'), [
  { name: 'main.ts',    source: tsSource },
  { name: 'index.html', source: htmlSource },
])
