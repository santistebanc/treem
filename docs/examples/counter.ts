import { ref, calc, update, run, watch } from 'treem'

const count = ref<number>('count')

const app = run({
  [count]: 0,
  doubled: calc(n => n * 2, [count]),
  increment: update({ [count]: calc(n => n + 1, [count]) }),
})

watch(app.doubled, d => console.log('doubled is', d))

app.increment()
app.increment()
console.log('read:', app.doubled())
