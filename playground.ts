import { ref, calc, run, update, arg } from './src/index'

const fruits = ref<string[]>('fruits')
const item = ref<string>('item')
const index = ref<number>('index')


const store = run({
  [fruits]: [],
  view: map({ list: fruits, item, index }, { name: item, initial: calc(it => it.charAt(0), [item]), eat: update({ [fruits]: calc((f, i) => f.toSpliced(i, 1), [fruits, index]) }) }),
  addFruit: update<[string]>({ [fruits]: calc((f, n) => [...f, n], [fruits, arg(0)]) }),
})

const app = run(store)

app.view[0].initial() //returns undefined
app.addFruit('apple')
app.view[0].initial() //returns 'a'