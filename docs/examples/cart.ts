import { ref, calc, event, update, arg, run, watch } from 'treem'

const items = ref<number>('items')
const added = event<[name: string, qty: number]>('added')

const cart = run({
  [items]: 0,
  label: calc(n => `${n} item(s)`, [items]),

  // One action changes state and emits an event
  add: update<string, number>({
    [items]: calc((n, qty) => n + qty, [items, arg<number>(1)]),
    [added]: [arg<string>(0), arg<number>(1)],
  }),
})

watch(added, (name, qty) => console.log(`toast: added ${qty} x ${name}`))

cart.add('coffee', 2)
cart.add('tea', 1)
console.log(cart.label())
