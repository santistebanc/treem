import assert from 'node:assert/strict'
import { ref, calc, iff, update, arg, record, run, watch, type Expr } from './src/index'

let passed = 0
let failed = 0

function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
    passed++
  } catch (e: any) {
    console.error(`  ✗ ${name}`)
    console.error(`    ${e.message}`)
    failed++
  }
}

function section(name: string) {
  console.log(`\n${name}`)
}

// ─── ref ─────────────────────────────────────────────────────────────────────

section('ref')

test('defines initial literal value', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 42, val: calc(n => n, [x]) })
  assert.equal(p.val(), 42)
})

test('multiple independent ref refs', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({ [a]: 1, [b]: 2, sum: calc((a, b) => a + b, [a, b]) })
  assert.equal(p.sum(), 3)
})

test('ref not defined in tree resolves to undefined', () => {
  const x = ref<number>('x')
  const p = run({ val: calc(v => v, [x]) })
  assert.equal(p.val(), undefined)
})

test('ref defined with false is falsy but readable', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: calc(f => f, [flag]) })
  assert.equal(p.val(), false)
})

test('ref defined with 0 is readable', () => {
  const n = ref<number>('n')
  const p = run({ [n]: 0, val: calc(n => n, [n]) })
  assert.equal(p.val(), 0)
})

test('ref defined with null is readable', () => {
  const x = ref<null>('x')
  const p = run({ [x]: null, val: calc(v => v, [x]) })
  assert.equal(p.val(), null)
})

// ─── calc ─────────────────────────────────────────────────────────────────────

section('calc')

test('basic derived value', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 10, doubled: calc(n => n * 2, [x]) })
  assert.equal(p.doubled(), 20)
})

test('multiple ref args', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({ [a]: 3, [b]: 4, sum: calc((a, b) => a + b, [a, b]) })
  assert.equal(p.sum(), 7)
})

test('mixed ref and literal args', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 5, plus10: calc((n, c) => n + c, [x, 10]) })
  assert.equal(p.plus10(), 15)
})

test('nested calcs', () => {
  const x = ref<number>('x')
  const double = (v: Expr<number>) => calc((n: number) => n * 2, [v])
  const p = run({ [x]: 3, quad: double(double(x)) })
  assert.equal(p.quad(), 12)
})

test('calc with no args (constant)', () => {
  const p = run({ val: calc(() => 42, []) })
  assert.equal(p.val(), 42)
})

test('calc updates reactively when ref changes', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 1, doubled: calc(n => n * 2, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  assert.equal(p.doubled(), 2)
  p.inc()
  assert.equal(p.doubled(), 4)
})

test('ref defined with object as initial value', () => {
  const config = ref<{ debug: boolean }>('config')
  const p = run({ [config]: { debug: true }, isDebug: calc(c => c.debug, [config]) })
  assert.equal(p.isDebug(), true)
})

// ─── iff — scalar ─────────────────────────────────────────────────────────────

section('iff — scalar branches')

test('picks true branch', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'yes', 'no') })
  assert.equal(p.val(), 'yes')
})

test('picks false branch', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'yes', 'no') })
  assert.equal(p.val(), 'no')
})

test('switches when ref changes', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'yes', 'no'), on: update({ [flag]: true }) })
  assert.equal(p.val(), 'no')
  p.on()
  assert.equal(p.val(), 'yes')
})

test('cond can be a calc node', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 5, val: iff(calc(n => n > 3, [x]), 'big', 'small') })
  assert.equal(p.val(), 'big')
})

test('cond can be an iff node', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const p = run({
    [a]: true, [b]: false,
    val: iff(iff(a, b, true), 'yes', 'no'),
    flipA: update({ [a]: calc(v => !v, [a]) }),
    flipB: update({ [b]: calc(v => !v, [b]) }),
  })
  assert.equal(p.val(), 'no')
  p.flipB()
  assert.equal(p.val(), 'yes')
  p.flipA()
  assert.equal(p.val(), 'yes')
})

test('branches can be calc nodes', () => {
  const x = ref<number>('x')
  const flag = ref<boolean>('flag')
  const p = run({ [x]: 4, [flag]: true, val: iff(flag, calc(n => n * 2, [x]), calc(n => n + 1, [x])) })
  assert.equal(p.val(), 8)
})

test('cond with 0 is falsy', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: iff(x, 'truthy', 'falsy') })
  assert.equal(p.val(), 'falsy')
})

test('cond with empty string is falsy', () => {
  const s = ref<string>('s')
  const p = run({ [s]: '', val: iff(s, 'truthy', 'falsy') })
  assert.equal(p.val(), 'falsy')
})

test('onFalse omitted — returns value when true', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'present') })
  assert.equal(p.val(), 'present')
})

test('onFalse omitted — returns undefined when false', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'present') })
  assert.equal(p.val(), undefined)
})

test('onFalse omitted — switches correctly when ref changes', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 42), on: update({ [flag]: true }) })
  assert.equal(p.val(), undefined)
  p.on()
  assert.equal(p.val(), 42)
})

test('onFalse omitted with object branch — keys undefined when false', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { x: 1, y: 2 }) })
  assert.equal((p.s as any).x(), undefined)
  assert.equal((p.s as any).y(), undefined)
})

test('onFalse omitted with object branch — keys resolve when true', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, { x: 1, y: 2 }) })
  assert.equal((p.s as any).x(), 1)
  assert.equal((p.s as any).y(), 2)
})

test('onFalse omitted — watch fires when value becomes undefined', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'hi'), off: update({ [flag]: false }) })
  const seen: any[] = []
  watch(p.val, v => void seen.push(v))
  p.off()
  assert.deepEqual(seen, ['hi', undefined])
})

// ─── iff — object distribution ────────────────────────────────────────────────

section('iff — object distribution')

test('distributes both-object branches per key', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, { a: 1, b: 2 }, { a: 3, b: 4 }) })
  assert.deepEqual(p.s(), { a: 1, b: 2 })
  assert.equal(p.s.a(), 1)
  assert.equal(p.s.b(), 2)
})

test('distributed keys update independently', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { a: 1, b: 2 }, { a: 3, b: 4 }) })
  assert.equal(p.s.a(), 3)
  assert.equal(p.s.b(), 4)
})

test('key only in true branch → undefined when false', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { extra: 99 }, {}) })
  assert.equal((p.s as any).extra(), undefined)
})

test('key only in false branch → undefined when true', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, {}, { extra: 99 }) })
  assert.equal((p.s as any).extra(), undefined)
})

test('one object branch one scalar — value node accessible', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { val: 1 }, 'fallback') })
  assert.equal(p.s(), 'fallback')
})

test('keys with calc values distribute correctly', () => {
  const flag = ref<boolean>('flag')
  const x = ref<number>('x')
  const p = run({
    [flag]: true, [x]: 5,
    s: iff(flag, { res: calc(n => n * 2, [x]) }, { res: calc(n => n + 1, [x]) })
  })
  assert.equal(p.s.res(), 10)
})

test('deeply nested object distribution', () => {
  const flag = ref<boolean>('flag')
  const p = run({
    [flag]: true,
    s: iff(flag, { a: { nested: 1 } }, { a: { nested: 2 } })
  })
  assert.equal((p.s as any).a.nested(), 1)
})

test('distributed iff with update actions', () => {
  const flag = ref<boolean>('flag')
  const x = ref<number>('x')
  const p = run({
    [flag]: false,
    [x]: 0,
    s: iff(flag,
      { [x]: 10, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) },
      { [x]: 0,  val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) }
    ),
  })
  assert.equal(p.s.val(), 0)
  p.s.inc()
  assert.equal(p.s.val(), 1)
})

test('nested iff — both branches are object iffs, keys distribute flat', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const p = run({
    [a]: true, [b]: false,
    s: iff(a, { x: 1 }, iff(b, { x: 2 }, { x: 3 }))
  })
  assert.equal((p.s as any).x(), 1)
})

test('nested iff — outer false branch resolves through inner', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const p = run({
    [a]: false, [b]: true,
    s: iff(a, { x: 1 }, iff(b, { x: 2 }, { x: 3 })),
    flipA: update({ [a]: calc(v => !v, [a]) }),
    flipB: update({ [b]: calc(v => !v, [b]) }),
  })
  assert.equal((p.s as any).x(), 2)
  p.flipB()
  assert.equal((p.s as any).x(), 3)
  p.flipA()
  assert.equal((p.s as any).x(), 1)
})

test('nested iff — disjoint keys across branches', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const tree = (av: boolean, bv: boolean) =>
    run({ [a]: av, [b]: bv, s: iff(a, { x: 1 }, iff(b, { x: 2, y: 9 }, { x: 3 })) })

  const p1 = tree(false, true)
  assert.equal((p1.s as any).x(), 2)
  assert.equal((p1.s as any).y(), 9)

  const p2 = tree(true, true)
  assert.equal((p2.s as any).y(), undefined)
})

test('nested iff — scalar inside object branch', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const p = run({
    [a]: true, [b]: false,
    s: iff(a, { x: iff(b, 'yes', 'no') }, { x: 'other' })
  })
  assert.equal((p.s as any).x(), 'no')
})

test('nested iff — scalar outer true, object outer false (mixed branch)', () => {
  const a = ref<boolean>('a')
  const b = ref<boolean>('b')
  const p = run({
    [a]: false, [b]: true,
    s: iff(a, 'scalar', iff(b, { x: 1 }, { x: 2 }))
  })
  assert.equal((p.s as any).x(), 1)
  const p2 = run({ [a]: true, [b]: true, s: iff(a, 'scalar', iff(b, { x: 1 }, { x: 2 })) })
  assert.equal(p2.s(), 'scalar')
})

// ─── update ─────────────────────────────────────────────────────────────────────

section('update')

test('basic mutation', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  p.inc()
  assert.equal(p.val(), 1)
  p.inc()
  assert.equal(p.val(), 2)
})

test('multiple assignments are computed before any are applied (atomic swap)', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({ [a]: 1, [b]: 2, va: calc(n => n, [a]), vb: calc(n => n, [b]), swap: update({ [a]: b, [b]: a }) })
  p.swap()
  assert.equal(p.va(), 2)
  assert.equal(p.vb(), 1)
})

test('update with same value skips propagation', () => {
  const x = ref<number>('x')
  const y = ref<number>('y')
  let yEvals = 0
  const p = run({
    [x]: 5,
    [y]: calc(n => { yEvals++; return n * 2 }, [x]),
    val: calc(n => n, [y]),
    noop: update({ [x]: 5 }),
  })
  yEvals = 0
  p.noop()
  assert.equal(yEvals, 0)
})

test('update cascade: changing one ref updates dependents', () => {
  const x = ref<number>('x')
  const y = ref<number>('y')
  const p = run({
    [x]: 2,
    [y]: calc(n => n * 3, [x]),
    valY: calc(n => n, [y]),
    incX: update({ [x]: calc(n => n + 1, [x]) })
  })
  assert.equal(p.valY(), 6)
  p.incX()
  assert.equal(p.valY(), 9)
})

// ─── arg ─────────────────────────────────────────────────────────────────────

section('arg')

test('basic arg passing', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), setX: update<number>({ [x]: arg<number>(0) }) })
  p.setX(42)
  assert.equal(p.val(), 42)
})

test('multiple args', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    va: calc(n => n, [a]), vb: calc(n => n, [b]),
    setAB: update<number, number>({ [a]: arg<number>(0), [b]: arg<number>(1) })
  })
  p.setAB(10, 20)
  assert.equal(p.va(), 10)
  assert.equal(p.vb(), 20)
})

test('arg used inside calc', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 0,
    val: calc(n => n, [x]),
    addN: update<number>({ [x]: calc((cur, n) => cur + n, [x, arg<number>(0)]) })
  })
  p.addN(5)
  assert.equal(p.val(), 5)
  p.addN(3)
  assert.equal(p.val(), 8)
})

test('arg defaults to undefined when not passed', () => {
  const x = ref<any>('x')
  const p = run({ [x]: 'initial', val: calc(v => v, [x]), setX: update({ [x]: arg(0) }) })
  ;(p.setX as any)()
  assert.equal(p.val(), undefined)
})

test('args are scoped to action call, do not leak', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    va: calc(n => n, [a]), vb: calc(n => n, [b]),
    setA: update<number>({ [a]: arg<number>(0) }),
    setB: update<number>({ [b]: arg<number>(0) }),
  })
  p.setA(10)
  p.setB(20)
  assert.equal(p.va(), 10)
  assert.equal(p.vb(), 20)
})

// ─── scoping ─────────────────────────────────────────────────────────────────

section('scoping')

test('child reads ref from parent scope', () => {
  const theme = ref<string>('theme')
  const p = run({ [theme]: 'dark', child: { label: calc(t => `theme: ${t}`, [theme]) } })
  assert.equal(p.child.label(), 'theme: dark')
})

test('nearest ancestor wins', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 1, child: { [x]: 2, val: calc(n => n, [x]) } })
  assert.equal(p.child.val(), 2)
})

test('parent ref unaffected by child definition', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 1, val: calc(n => n, [x]), child: { [x]: 99, val: calc(n => n, [x]) } })
  assert.equal(p.val(), 1)
  assert.equal(p.child.val(), 99)
})

test('update targets nearest ancestor from action location', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 0,
    rootVal: calc(n => n, [x]),
    child: {
      [x]: 10,
      childVal: calc(n => n, [x]),
      inc: update({ [x]: calc(n => n + 1, [x]) })
    }
  })
  assert.equal(p.rootVal(), 0)
  assert.equal(p.child.childVal(), 10)
  p.child.inc()
  assert.equal(p.rootVal(), 0)
  assert.equal(p.child.childVal(), 11)
})

test('deep nesting resolves ancestor ref', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 7, a: { b: { c: { val: calc(n => n, [x]) } } } })
  assert.equal(p.a.b.c.val(), 7)
})

test('sibling ref is not visible — resolves to undefined', () => {
  const x = ref<number>('x')
  const p = run({
    left:  { [x]: 10 },
    right: { val: calc(n => n, [x]) }
  })
  assert.equal(p.right.val(), undefined)
})

test('deeply nested action sets correct scope ref', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 0,
    rootVal: calc(n => n, [x]),
    a: { b: { [x]: 5, childVal: calc(n => n, [x]), reset: update({ [x]: 0 }) } }
  })
  assert.equal(p.a.b.childVal(), 5)
  p.a.b.reset()
  assert.equal(p.rootVal(), 0)
  assert.equal(p.a.b.childVal(), 0)
})

// ─── reactivity ──────────────────────────────────────────────────────────────

section('reactivity')

test('reactive ref formula resets when dep changes', () => {
  const active = ref<boolean>('active')
  const x = ref<number>('x')
  const p = run({
    [active]: false,
    child: { [x]: iff(active, 10, 0), val: calc(n => n, [x]), on: update({ [active]: true }) }
  })
  assert.equal(p.child.val(), 0)
  p.child.on()
  assert.equal(p.child.val(), 10)
})

test('manual update is overwritten when formula dep changes', () => {
  const active = ref<boolean>('active')
  const x = ref<number>('x')
  const p = run({
    [active]: false,
    child: {
      [x]: iff(active, 10, 0),
      val: calc(n => n, [x]),
      setX: update({ [x]: 99 }),
      toggle: update({ [active]: calc(b => !b, [active]) })
    }
  })
  p.child.setX()
  assert.equal(p.child.val(), 99)
  p.child.toggle()
  assert.equal(p.child.val(), 10)
})

test('unchanged ref value halts propagation chain', () => {
  const x = ref<number>('x')
  const y = ref<string>('y')
  const z = ref<number>('z')
  let zEvals = 0
  const p = run({
    [x]: 0,
    [y]: calc(() => 'fixed', [x]),
    [z]: calc((s: string) => { zEvals++; return s.length }, [y]),
    incX: update({ [x]: calc(n => n + 1, [x]) })
  })
  zEvals = 0
  p.incX()
  assert.equal(zEvals, 0)
})

test('chain of deps propagates correctly', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 1,
    a: calc(n => n * 2, [x]),
    b: calc(n => n + 10, [calc(n => n * 2, [x])]),
    inc: update({ [x]: calc(n => n + 1, [x]) })
  })
  assert.equal(p.a(), 2)
  assert.equal(p.b(), 12)
  p.inc()
  assert.equal(p.a(), 4)
  assert.equal(p.b(), 14)
})

test('multiple refs changing in one update — all dependents update', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({
    [a]: 1, [b]: 10,
    sum: calc((a, b) => a + b, [a, b]),
    setBoth: update({ [a]: 5, [b]: 20 })
  })
  assert.equal(p.sum(), 11)
  p.setBoth()
  assert.equal(p.sum(), 25)
})

// ─── watch ────────────────────────────────────────────────────────────────────

section('watch')

test('fires immediately with current value on subscribe', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 5, val: calc(n => n * 2, [x]) })
  const seen: number[] = []
  watch(p.val, v => void seen.push(v))
  assert.deepEqual(seen, [10])
})

test('callback fires with new value on change', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n * 2, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => void seen.push(v))
  p.inc()
  p.inc()
  assert.deepEqual(seen, [0, 2, 4])
})

test('unsubscribe stops callbacks', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  const unwatch = watch(p.val, v => void seen.push(v))
  p.inc()
  unwatch()
  p.inc()
  p.inc()
  assert.equal(seen.length, 2)
  assert.equal(seen[0], 0)
  assert.equal(seen[1], 1)
})

test('watch on subtree only fires for subtree deps', () => {
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    left:  { val: calc(n => n, [a]) },
    right: { val: calc(n => n, [b]) },
    incA: update({ [a]: calc(n => n + 1, [a]) }),
    incB: update({ [b]: calc(n => n + 1, [b]) }),
  })
  const leftFires: number[] = []
  watch(p.left, v => void leftFires.push(v.val))
  p.incB()
  assert.equal(leftFires.length, 1)
  p.incA()
  assert.equal(leftFires.length, 2)
  assert.equal(leftFires[1], 1)
})

test('watch on leaf value', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n + 1, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => void seen.push(v))
  p.inc()
  assert.deepEqual(seen, [1, 2])
})

test('multiple watchers on same node all fire', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const a: number[] = [], b: number[] = []
  watch(p.val, v => void a.push(v))
  watch(p.val, v => void b.push(v))
  p.inc()
  assert.equal(a.length, 2)
  assert.equal(b.length, 2)
})

test('watch on subtree receives full resolved object', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, sub: { a: calc(n => n, [x]), b: calc(n => n * 2, [x]) }, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  let last: any = null
  watch(p.sub, v => { last = v })
  p.inc()
  assert.deepEqual(last, { a: 1, b: 2 })
})

test('watch re-tracks deps after branch switch', () => {
  const flag = ref<boolean>('flag')
  const a = ref<number>('a')
  const b = ref<number>('b')
  const p = run({
    [flag]: true, [a]: 1, [b]: 10,
    val: iff(flag, calc(n => n, [a]), calc(n => n, [b])),
    toggle: update({ [flag]: calc(f => !f, [flag]) }),
    incA: update({ [a]: calc(n => n + 1, [a]) }),
    incB: update({ [b]: calc(n => n + 1, [b]) }),
  })
  const seen: any[] = []
  watch(p.val, v => void seen.push(v))
  p.incA()
  assert.equal(seen.length, 2)
  p.toggle()
  assert.equal(seen.length, 3)
  p.incA()
  assert.equal(seen.length, 3)
  p.incB()
  assert.equal(seen.length, 4)
})

test('cleanup runs before next callback', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: x, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const log: string[] = []
  watch(p.val, v => {
    log.push(`start:${v}`)
    return () => log.push(`cleanup:${v}`)
  })
  p.inc()
  p.inc()
  assert.deepEqual(log, ['start:0', 'cleanup:0', 'start:1', 'cleanup:1', 'start:2'])
})

test('cleanup runs on unsubscribe', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: x })
  let cleaned = false
  const unwatch = watch(p.val, () => () => { cleaned = true })
  assert.equal(cleaned, false)
  unwatch()
  assert.equal(cleaned, true)
})

test('no cleanup when callback returns nothing', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: x, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => { seen.push(v) })  // returns undefined — no cleanup
  p.inc()
  assert.deepEqual(seen, [0, 1])
})

test('watch does not fire when value unchanged', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 5,
    val: calc(() => 'constant', [x]),
    incX: update({ [x]: calc(n => n + 1, [x]) })
  })
  const seen: any[] = []
  watch(p.val, v => void seen.push(v))
  p.incX()
  assert.equal(seen.length, 1)
})

// ─── arrays ───────────────────────────────────────────────────────────────────

section('arrays')

test('array as ref leaf value', () => {
  const items = ref<string[]>('items')
  const p = run({ [items]: ['a', 'b'], count: calc(arr => arr.length, [items]) })
  assert.equal(p.count(), 2)
})

test('array in tree with object elements — element access', () => {
  const p = run({ items: [{ label: 'one' }, { label: 'two' }] })
  assert.equal((p.items as any)[0].label(), 'one')
  assert.equal((p.items as any)[1].label(), 'two')
})

test('array element with iff — updates when ref changes', () => {
  const flag = ref<boolean>('flag')
  const p = run({
    [flag]: false,
    items: [iff(flag, 'yes', 'no')],
    on: update({ [flag]: true })
  })
  assert.equal((p.items as any)[0](), 'no')
  p.on()
  assert.equal((p.items as any)[0](), 'yes')
})

test('mixed array: plain and reactive elements', () => {
  const flag = ref<boolean>('flag')
  const p = run({
    [flag]: false,
    items: [{ label: 'static' }, iff(flag, { label: 'active' }, { label: 'inactive' })]
  })
  assert.equal((p.items as any)[0].label(), 'static')
  assert.equal((p.items as any)[1].label(), 'inactive')
})

test('watch on array fires when element changes', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, items: [iff(flag, 1, 0)], on: update({ [flag]: true }) })
  const seen: any[] = []
  watch(p.items as any, v => void seen.push(v))
  p.on()
  assert.equal(seen.length, 2)
  assert.deepEqual(seen[1], [1])
})

// ─── edge cases ───────────────────────────────────────────────────────────────

section('edge cases')

test('run with empty object', () => {
  const p = run({})
  assert.deepEqual(p(), {})
})

test('multiple independent run() instances do not interfere', () => {
  const x = ref<number>('x')
  const p1 = run({ [x]: 1, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const p2 = run({ [x]: 100, val: calc(n => n, [x]), inc: update({ [x]: calc(n => n + 1, [x]) }) })
  p1.inc()
  assert.equal(p1.val(), 2)
  assert.equal(p2.val(), 100)
})

test('same ref symbol reused across multiple run() calls is independent', () => {
  const x = ref<number>('x')
  const p1 = run({ [x]: 1, val: calc(n => n, [x]) })
  const p2 = run({ [x]: 99, val: calc(n => n, [x]) })
  assert.equal(p1.val(), 1)
  assert.equal(p2.val(), 99)
})

test('string values pass through calc unchanged', () => {
  const name = ref<string>('name')
  const p = run({ [name]: 'Alice', greeting: calc(n => `Hello, ${n}!`, [name]) })
  assert.equal(p.greeting(), 'Hello, Alice!')
})

test('boolean toggling via calc', () => {
  const flag = ref<boolean>('flag')
  const p = run({ [flag]: false, val: calc(f => f, [flag]), toggle: update({ [flag]: calc(f => !f, [flag]) }) })
  assert.equal(p.val(), false)
  p.toggle()
  assert.equal(p.val(), true)
  p.toggle()
  assert.equal(p.val(), false)
})

test('reactive iff with nested scope and inherited ref', () => {
  const mode = ref<string>('mode')
  const base = ref<number>('base')
  const p = run({
    [mode]: 'a',
    [base]: 10,
    child: iff(
      calc(m => m === 'a', [mode]),
      { result: calc(b => b * 2, [base]) },
      { result: calc(b => b + 1, [base]) }
    ),
    setMode: update({ [mode]: 'b' }),
  })
  assert.equal(p.child.result(), 20)
  p.setMode()
  assert.equal(p.child.result(), 11)
})

test('action called multiple times accumulates state', () => {
  const count = ref<number>('count')
  const p = run({ [count]: 0, val: calc(n => n, [count]), inc: update({ [count]: calc(n => n + 1, [count]) }) })
  for (let i = 0; i < 10; i++) p.inc()
  assert.equal(p.val(), 10)
})

// ─── combinations ────────────────────────────────────────────────────────────

section('combinations')

test('iff as update assignment value — evaluated at call time', () => {
  const flag = ref<boolean>('flag')
  const x    = ref<number>('x')
  const p = run({
    [flag]: true, [x]: 0,
    val:    x,
    assign: update({ [x]: iff(flag, 1, 0) }),
  })
  p.assign()
  assert.equal(p.val(), 1)
})

test('iff as calc arg', () => {
  const flag = ref<boolean>('flag')
  const p = run({
    [flag]: true,
    val: calc(v => v * 2, [iff(flag, 3, 5)]),
    flip: update({ [flag]: calc(f => !f, [flag]) }),
  })
  assert.equal(p.val(), 6)
  p.flip()
  assert.equal(p.val(), 10)
})

test('arg inside iff inside update', () => {
  const flag = ref<boolean>('flag')
  const x    = ref<number>('x')
  const p = run({
    [flag]: true, [x]: 0,
    val:    x,
    assign: update<number>({ [x]: iff(flag, arg<number>(0), 0) }),
  })
  p.assign(42)
  assert.equal(p.val(), 42)
})

test('watch on a single key of a distributed iff', () => {
  const flag = ref<boolean>('flag')
  const p = run({
    [flag]: false,
    s: iff(flag, { x: 1, y: 2 }, { x: 3, y: 4 }),
    flip: update({ [flag]: calc(f => !f, [flag]) }),
  })
  const seen: number[] = []
  watch((p.s as any).x, (v: number) => void seen.push(v))
  p.flip()
  assert.deepEqual(seen, [3, 1])
  p.flip()
  assert.deepEqual(seen, [3, 1, 3])
})

test('chain of reactive ref formulas — cascade through two resets', () => {
  const x = ref<number>('x')
  const y = ref<number>('y')
  const z = ref<number>('z')
  const p = run({
    [x]: 1,
    [y]: calc(n => n * 2, [x]),
    [z]: calc(n => n + 10, [y]),
    val:  z,
    incX: update({ [x]: calc(n => n + 1, [x]) }),
  })
  assert.equal(p.val(), 12)
  p.incX()
  assert.equal(p.val(), 14)
})

test('arg inside calc inside update', () => {
  const x = ref<number>('x')
  const p = run({
    [x]: 0,
    val:    x,
    assign: update<number>({ [x]: iff(calc((n: number) => n > 0, [arg<number>(0)]), 1, -1) }),
  })
  p.assign(5)
  assert.equal(p.val(), 1)
  p.assign(-3)
  assert.equal(p.val(), -1)
})

// ─── event ───────────────────────────────────────────────────────────────────

import { event } from './src/index'

section('event')

test('watch on event channel fires when emitted', () => {
  const clicked = event<[]>('clicked')
  const p = run({ click: update({ [clicked]: [] }) })
  let count = 0
  watch(clicked, () => { count++ })
  p.click()
  assert.equal(count, 1)
  p.click()
  assert.equal(count, 2)
})

test('watch on event passes args to callback', () => {
  const selected = event<[string, number]>('selected')
  const p = run({ select: update<string, number>({ [selected]: [arg<string>(0), arg<number>(1)] }) })
  const seen: [string, number][] = []
  watch(selected, (label, idx) => void seen.push([label, idx]))
  p.select('foo', 3)
  p.select('bar', 7)
  assert.deepEqual(seen, [['foo', 3], ['bar', 7]])
})

test('unsubscribe from event stops callbacks', () => {
  const ev = event<[]>('ev')
  const p = run({ fire: update({ [ev]: [] }) })
  let count = 0
  const unsub = watch(ev, () => { count++ })
  p.fire()
  unsub()
  p.fire()
  p.fire()
  assert.equal(count, 1)
})

test('multiple event subscribers all fire', () => {
  const ev = event<[number]>('ev')
  const p = run({ fire: update<number>({ [ev]: [arg<number>(0)] }) })
  const a: number[] = [], b: number[] = []
  watch(ev, n => void a.push(n))
  watch(ev, n => void b.push(n))
  p.fire(42)
  assert.deepEqual(a, [42])
  assert.deepEqual(b, [42])
})

test('event emission happens after state updates', () => {
  const x = ref<number>('x')
  const changed = event<[number]>('changed')
  const p = run({
    [x]: 0,
    val: x,
    set: update<number>({ [x]: arg<number>(0), [changed]: [arg<number>(0)] }),
  })
  const emitted: number[] = []
  watch(changed, n => void emitted.push(n))
  p.set(5)
  assert.equal(p.val(), 5)
  assert.deepEqual(emitted, [5])
})

test('event args can be calc expressions', () => {
  const x = ref<number>('x')
  const doubled = event<[number]>('doubled')
  const p = run({
    [x]: 3,
    inc: update({ [x]: calc(n => n + 1, [x]), [doubled]: [calc(n => (n + 1) * 2, [x])] }),
  })
  const seen: number[] = []
  watch(doubled, n => void seen.push(n))
  p.inc()
  assert.deepEqual(seen, [8])
})

test('event not fired unless action is called', () => {
  const ev = event<[]>('ev')
  run({ fire: update({ [ev]: [] }) })
  let count = 0
  watch(ev, () => { count++ })
  assert.equal(count, 0)
})

// ─── dispose ─────────────────────────────────────────────────────────────────

section('dispose')

test('dispose stops all watchers', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: x, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => void seen.push(v))
  p.inc()
  assert.equal(seen.length, 2)
  p.dispose()
  p.inc()
  p.inc()
  assert.equal(seen.length, 2)
})

test('dispose runs cleanup on active watchers', () => {
  const x = ref<number>('x')
  const p = run({ [x]: 0, val: x })
  let cleaned = false
  watch(p.val, () => () => { cleaned = true })
  assert.equal(cleaned, false)
  p.dispose()
  assert.equal(cleaned, true)
})

test('dispose does not affect other run() instances', () => {
  const x = ref<number>('x')
  const p1 = run({ [x]: 0, val: x, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const p2 = run({ [x]: 0, val: x, inc: update({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p2.val, v => void seen.push(v))
  p1.dispose()
  p2.inc()
  assert.equal(seen.length, 2)
})

// ─── record ──────────────────────────────────────────────────────────────────

console.log('\nrecord')

test('record initialises from array-of-pairs', () => {
  type P = { name: string; score: number }
  const players = record<string, P>('players')
  const store = run({ [players]: [['alice', { name: 'Alice', score: 0 }]], players })
  assert.deepEqual(store.players(), [{ name: 'Alice', score: 0 }])
})

test('whole-map calc recomputes when any entry changes', () => {
  type P = { score: number }
  const players = record<string, P>('players')
  const store = run({
    [players]: [],
    players,
    count: calc((ps: P[]) => ps.length, [players]),
    addPlayer: update<string, P>({ [players(arg(0))]: arg(1) }),
  })
  assert.equal(store.count(), 0)
  store.addPlayer('a', { score: 1 })
  assert.equal(store.count(), 1)
  store.addPlayer('b', { score: 2 })
  assert.equal(store.count(), 2)
})

test('per-key watcher fires only when that entry changes', () => {
  type P = { score: number }
  const players = record<string, P>('players')
  const store = run({
    [players]: [['alice', { score: 0 }], ['bob', { score: 0 }]],
    players,
    addScore: update<string, number>({
      [players(arg(0))]: calc(
        (p: P | undefined, n: number) => p ? { score: p.score + n } : p,
        [players(arg(0)), arg<number>(1)]
      ),
    }),
  })
  const aliceSeen: any[] = [], bobSeen: any[] = []
  watch(store.players('alice'), v => void aliceSeen.push(v))
  watch(store.players('bob'),   v => void bobSeen.push(v))
  store.addScore('alice', 5)
  assert.equal(aliceSeen.length, 2)  // initial + update
  assert.equal(bobSeen.length, 1)    // initial only — bob untouched
  assert.deepEqual(aliceSeen[1], { score: 5 })
})

test('per-key watcher fires on add and resolves to undefined after delete', () => {
  type P = { name: string }
  const players = record<string, P>('players')
  const store = run({
    [players]: [],
    players,
    addPlayer:    update<string, P>({ [players(arg(0))]: arg(1) }),
    removePlayer: update<string>({   [players(arg(0))]: undefined }),
  })
  const seen: any[] = []
  watch(store.players('alice'), v => void seen.push(v))
  store.addPlayer('alice', { name: 'Alice' })
  store.removePlayer('alice')
  assert.equal(seen.length, 3)          // undefined, { name: 'Alice' }, undefined
  assert.deepEqual(seen[1], { name: 'Alice' })
  assert.equal(seen[2], undefined)
})

test('whole-map watcher is unaffected by unrelated per-key changes', () => {
  type P = { score: number }
  const players = record<string, P>('players')
  const store = run({
    [players]: [['alice', { score: 0 }], ['bob', { score: 0 }]],
    players,
    addScore: update<string, number>({
      [players(arg(0))]: calc(
        (p: P | undefined, n: number) => p ? { score: p.score + n } : p,
        [players(arg(0)), arg<number>(1)]
      ),
    }),
  })
  const wholeSeen: any[] = []
  watch(store.players, v => void wholeSeen.push(v))
  store.addScore('alice', 1)
  store.addScore('bob',   1)
  assert.equal(wholeSeen.length, 3)  // initial + 2 updates
})

// ─── summary ─────────────────────────────────────────────────────────────────

test('bulk update replaces whole map and triggers single propagation', () => {
  type P = { score: number; answered: boolean }
  const players = record<string, P>('players')
  const store = run({
    [players]: [['a', { score: 10, answered: true }], ['b', { score: 5, answered: true }]],
    players,
    answered: calc((ps: P[]) => ps.every(p => p.answered), [players]),
    // Bulk reset — replaces whole map
    resetRound: update({
      [players]: calc(
        (ps: P[]) => ps.map((p, i) => [['a', 'b'][i], { ...p, score: 0, answered: false }]),
        [players]
      ),
    }),
  })

  const wholeFires: number[] = []
  watch(store.players, ps => void wholeFires.push(ps.length))

  assert.equal(store.answered(), true)
  store.resetRound()
  assert.equal(store.answered(), false)
  assert.deepEqual(store.players().map(p => p.score), [0, 0])
  // Whole-map watcher fired exactly twice: initial + one bulk update
  assert.equal(wholeFires.length, 2)
})

test('bulk update diffs entries — only changed per-key watchers fire', () => {
  type P = { score: number }
  const players = record<string, P>('players')
  const aliceObj = { score: 10 }
  const store = run({
    [players]: [['alice', aliceObj], ['bob', { score: 5 }]],
    players,
    setAll: update<[string, P][]>({
      [players]: arg<[string, P][]>(0),
    }),
  })

  const aliceSeen: any[] = [], bobSeen: any[] = []
  watch(store.players('alice'), v => void aliceSeen.push(v))
  watch(store.players('bob'),   v => void bobSeen.push(v))

  // Replace map — alice is the same reference, bob gets new score
  store.setAll([['alice', aliceObj], ['bob', { score: 99 }]])

  assert.equal(aliceSeen.length, 1)  // initial only — alice reference unchanged
  assert.equal(bobSeen.length, 2)    // initial + update
  assert.deepEqual(bobSeen[1], { score: 99 })
})

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
