import { ref, calc, set, run, watch } from 'treem'
import tsSource from './main.ts?raw'
import htmlSource from './index.html?raw'
import { renderCodePanel } from '../_shared/code-panel'

const phases = [{ color: 'green', time: 4000 }, { color: 'yellow', time: 1000 }, { color: 'red', time: 3000 }]
const idx = ref<number>('idx')

const store = run({
  [idx]: 0,
  phase: calc((i) => phases[i], [idx]),
  next: set({ [idx]: calc((i) => (i + 1) % phases.length, [idx]) }),
})

const el = (id: string) => document.getElementById(id)!

watch(store.phase, ({ color, time }) => {
  el('red').classList.toggle('active', color === 'red')
  el('yellow').classList.toggle('active', color === 'yellow')
  el('green').classList.toggle('active', color === 'green')

  const progressEl = el('progress')
  progressEl.classList.remove('animating')
  progressEl.classList.toggle('yellow', color === 'yellow')
  progressEl.classList.toggle('red', color === 'red')

  void progressEl.offsetWidth // force reflow

  progressEl.style.animationDuration = `${time}ms`
  progressEl.classList.add('animating')

  el('timeout').textContent = `${time}ms`
  const timeoutId = setTimeout(() => store.next(), time)
  return () => clearTimeout(timeoutId)
})

el('next').addEventListener('click', () => {
  store.next()
})

renderCodePanel(document.getElementById('code-panel')!, [
  { name: 'main.ts', source: tsSource },
  { name: 'index.html', source: htmlSource },
])