import { ref, calc, update, arg, run, watch } from './src/index'
const a = ref<number>('a')


const b = calc((av: number) => av * 2, [a])
const c = calc((bv: number) => bv + 1, [b])
const d = calc((av: number, cv: number) => av + cv, [a, c])

const app = {
  [a]: 1,
  setA: update<number>({ [a]: arg(0) }),
  result: d,
}

const prog = run(app)

watch(prog.result, (val) => console.log('d =', val))

prog.setA(2)
console.log(prog.result())