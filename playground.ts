import { ctx, calc, set, run, watch } from './src/index'

const phases = [{ color: 'green', time: 4000 }, { color: 'yellow', time: 1000 }, { color: 'red', time: 3000 }]
const idx = ctx<number>('idx')

const store = run({
  [idx]: 0,
  phase: calc((i) => phases[i], [idx]),
  next: set({ [idx]: calc((i) => (i + 1) % phases.length, [idx]) }),
})

console.log('Traffic Light')
console.log('==============\n')

watch(store.phase, ({ color, time }) => {
  console.log(color)
  const timeoutId = setTimeout(() => {
    store.next()
  }, time)

  return () => {
    clearTimeout(timeoutId)
  }
})

console.log('Press Enter for next light')
const readline = require('readline')
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', store.next)