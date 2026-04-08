import assert from 'node:assert/strict'
import { ctx, calc, iff, set, arg, run, watch, Expr } from './src/index'

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

// ─── ctx ─────────────────────────────────────────────────────────────────────

section('ctx')

test('defines initial literal value', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 42, val: calc(n => n, [x]) })
  assert.equal(p.val(), 42)
})

test('multiple independent ctx refs', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({ [a]: 1, [b]: 2, sum: calc((a, b) => a + b, [a, b]) })
  assert.equal(p.sum(), 3)
})

test('ctx not defined in tree resolves to undefined', () => {
  const x = ctx<number>('x')
  const p = run({ val: calc(v => v, [x]) })
  assert.equal(p.val(), undefined)
})

test('ctx defined with false is falsy but readable', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: calc(f => f, [flag]) })
  assert.equal(p.val(), false)
})

test('ctx defined with 0 is readable', () => {
  const n = ctx<number>('n')
  const p = run({ [n]: 0, val: calc(n => n, [n]) })
  assert.equal(p.val(), 0)
})

test('ctx defined with null is readable', () => {
  const x = ctx<null>('x')
  const p = run({ [x]: null, val: calc(v => v, [x]) })
  assert.equal(p.val(), null)
})

// ─── calc ─────────────────────────────────────────────────────────────────────

section('calc')

test('basic derived value', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 10, doubled: calc(n => n * 2, [x]) })
  assert.equal(p.doubled(), 20)
})

test('multiple ctx args', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({ [a]: 3, [b]: 4, sum: calc((a, b) => a + b, [a, b]) })
  assert.equal(p.sum(), 7)
})

test('mixed ctx and literal args', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 5, plus10: calc((n, c) => n + c, [x, 10]) })
  assert.equal(p.plus10(), 15)
})

test('nested calcs', () => {
  const x = ctx<number>('x')
  const double = (v: Expr<number>) => calc((n: number) => n * 2, [v])
  const p = run({ [x]: 3, quad: double(double(x)) })
  assert.equal(p.quad(), 12)
})

test('calc with no args (constant)', () => {
  const p = run({ val: calc(() => 42, []) })
  assert.equal(p.val(), 42)
})

test('calc updates reactively when ctx changes', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 1, doubled: calc(n => n * 2, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  assert.equal(p.doubled(), 2)
  p.inc()
  assert.equal(p.doubled(), 4)
})

test('ctx defined with object as initial value', () => {
  const config = ctx<{ debug: boolean }>('config')
  const p = run({ [config]: { debug: true }, isDebug: calc(c => c.debug, [config]) })
  assert.equal(p.isDebug(), true)
})

// ─── iff — scalar ─────────────────────────────────────────────────────────────

section('iff — scalar branches')

test('picks true branch', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'yes', 'no') })
  assert.equal(p.val(), 'yes')
})

test('picks false branch', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'yes', 'no') })
  assert.equal(p.val(), 'no')
})

test('switches when ctx changes', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'yes', 'no'), on: set({ [flag]: true }) })
  assert.equal(p.val(), 'no')
  p.on()
  assert.equal(p.val(), 'yes')
})

test('cond can be a calc node', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 5, val: iff(calc(n => n > 3, [x]), 'big', 'small') })
  assert.equal(p.val(), 'big')
})

test('cond can be an iff node', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  const p = run({
    [a]: true, [b]: false,
    val: iff(iff(a, b, true), 'yes', 'no'),  // cond = b when a=true, true when a=false
    flipA: set({ [a]: calc(v => !v, [a]) }),
    flipB: set({ [b]: calc(v => !v, [b]) }),
  })
  assert.equal(p.val(), 'no')   // a=true → cond=b=false → 'no'
  p.flipB()
  assert.equal(p.val(), 'yes')  // a=true → cond=b=true → 'yes'
  p.flipA()
  assert.equal(p.val(), 'yes')  // a=false → cond=true → 'yes'
})

test('branches can be calc nodes', () => {
  const x = ctx<number>('x')
  const flag = ctx<boolean>('flag')
  const p = run({ [x]: 4, [flag]: true, val: iff(flag, calc(n => n * 2, [x]), calc(n => n + 1, [x])) })
  assert.equal(p.val(), 8)
})

test('cond with 0 is falsy', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: iff(x, 'truthy', 'falsy') })
  assert.equal(p.val(), 'falsy')
})

test('cond with empty string is falsy', () => {
  const s = ctx<string>('s')
  const p = run({ [s]: '', val: iff(s, 'truthy', 'falsy') })
  assert.equal(p.val(), 'falsy')
})

test('onFalse omitted — returns value when true', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'present') })
  assert.equal(p.val(), 'present')
})

test('onFalse omitted — returns undefined when false', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 'present') })
  assert.equal(p.val(), undefined)
})

test('onFalse omitted — switches correctly when ctx changes', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: iff(flag, 42), on: set({ [flag]: true }) })
  assert.equal(p.val(), undefined)
  p.on()
  assert.equal(p.val(), 42)
})

test('onFalse omitted with object branch — keys undefined when false', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { x: 1, y: 2 }) })
  assert.equal((p.s as any).x(), undefined)
  assert.equal((p.s as any).y(), undefined)
})

test('onFalse omitted with object branch — keys resolve when true', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, { x: 1, y: 2 }) })
  assert.equal((p.s as any).x(), 1)
  assert.equal((p.s as any).y(), 2)
})

test('onFalse omitted — watch fires when value becomes undefined', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, val: iff(flag, 'hi'), off: set({ [flag]: false }) })
  const seen: any[] = []
  watch(p.val, v => seen.push(v))
  p.off()
  assert.deepEqual(seen, [undefined])
})

// ─── iff — object distribution ────────────────────────────────────────────────

section('iff — object distribution')

test('distributes both-object branches per key', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, { a: 1, b: 2 }, { a: 3, b: 4 }) })
  assert.deepEqual(p.s(), { a: 1, b: 2 })
  assert.equal(p.s.a(), 1)
  assert.equal(p.s.b(), 2)
})

test('distributed keys update independently', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { a: 1, b: 2 }, { a: 3, b: 4 }) })
  assert.equal(p.s.a(), 3)
  assert.equal(p.s.b(), 4)
})

test('key only in true branch → undefined when false', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { extra: 99 }, {}) })
  assert.equal((p.s as any).extra(), undefined)
})

test('key only in false branch → undefined when true', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: true, s: iff(flag, {}, { extra: 99 }) })
  assert.equal((p.s as any).extra(), undefined)
})

test('one object branch one scalar — value node accessible', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, s: iff(flag, { val: 1 }, 'fallback') })
  // when false → the scalar 'fallback' is the [VALUE] node on the scope
  assert.equal(p.s(), 'fallback')
})

test('keys with calc values distribute correctly', () => {
  const flag = ctx<boolean>('flag')
  const x = ctx<number>('x')
  const p = run({
    [flag]: true, [x]: 5,
    s: iff(flag, { res: calc(n => n * 2, [x]) }, { res: calc(n => n + 1, [x]) })
  })
  assert.equal(p.s.res(), 10)
})

test('deeply nested object distribution', () => {
  const flag = ctx<boolean>('flag')
  const p = run({
    [flag]: true,
    s: iff(flag, { a: { nested: 1 } }, { a: { nested: 2 } })
  })
  assert.equal((p.s as any).a.nested(), 1)
})

test('distributed iff with set actions', () => {
  const flag = ctx<boolean>('flag')
  const x = ctx<number>('x')
  const p = run({
    [flag]: false,
    [x]: 0,
    s: iff(flag,
      { [x]: 10, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) },
      { [x]: 0,  val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) }
    ),
  })
  assert.equal(p.s.val(), 0)
  p.s.inc()
  assert.equal(p.s.val(), 1)
})

test('nested iff — both branches are object iffs, keys distribute flat', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  // iff(b, {...}, {...}) is a plain object — outer iff distributes over it
  const p = run({
    [a]: true, [b]: false,
    s: iff(a, { x: 1 }, iff(b, { x: 2 }, { x: 3 }))
  })
  assert.equal((p.s as any).x(), 1)  // a=true → 1
})

test('nested iff — outer false branch resolves through inner', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  const p = run({
    [a]: false, [b]: true,
    s: iff(a, { x: 1 }, iff(b, { x: 2 }, { x: 3 })),
    flipA: set({ [a]: calc(v => !v, [a]) }),
    flipB: set({ [b]: calc(v => !v, [b]) }),
  })
  assert.equal((p.s as any).x(), 2)  // a=false, b=true → 2
  p.flipB()
  assert.equal((p.s as any).x(), 3)  // a=false, b=false → 3
  p.flipA()
  assert.equal((p.s as any).x(), 1)  // a=true → 1
})

test('nested iff — disjoint keys across branches', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  const tree = (av: boolean, bv: boolean) =>
    run({ [a]: av, [b]: bv, s: iff(a, { x: 1 }, iff(b, { x: 2, y: 9 }, { x: 3 })) })

  const p1 = tree(false, true)
  assert.equal((p1.s as any).x(), 2)
  assert.equal((p1.s as any).y(), 9)    // a=false, b=true → y present

  const p2 = tree(true, true)
  assert.equal((p2.s as any).y(), undefined)  // a=true → outer true branch has no y
})

test('nested iff — scalar inside object branch', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  const p = run({
    [a]: true, [b]: false,
    s: iff(a, { x: iff(b, 'yes', 'no') }, { x: 'other' })
  })
  assert.equal((p.s as any).x(), 'no')   // a=true, b=false → 'no'
})

test('nested iff — scalar outer true, object outer false (mixed branch)', () => {
  const a = ctx<boolean>('a')
  const b = ctx<boolean>('b')
  const p = run({
    [a]: false, [b]: true,
    s: iff(a, 'scalar', iff(b, { x: 1 }, { x: 2 }))
  })
  // a=false → resolve through VALUE: fallback to inner iff object
  assert.equal((p.s as any).x(), 1)
  // a=true → resolve as scalar
  const p2 = run({ [a]: true, [b]: true, s: iff(a, 'scalar', iff(b, { x: 1 }, { x: 2 })) })
  assert.equal(p2.s(), 'scalar')
})

// ─── set ─────────────────────────────────────────────────────────────────────

section('set')

test('basic mutation', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  p.inc()
  assert.equal(p.val(), 1)
  p.inc()
  assert.equal(p.val(), 2)
})

test('multiple assignments are computed before any are applied (atomic swap)', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({ [a]: 1, [b]: 2, va: calc(n => n, [a]), vb: calc(n => n, [b]), swap: set({ [a]: b, [b]: a }) })
  p.swap()
  assert.equal(p.va(), 2) // a got old b
  assert.equal(p.vb(), 1) // b got old a
})

test('set with same value skips propagation', () => {
  const x = ctx<number>('x')
  const y = ctx<number>('y')
  let yEvals = 0
  // y is a reactive ctx that depends on x; if x doesn't change, y should not reeval
  const p = run({
    [x]: 5,
    [y]: calc(n => { yEvals++; return n * 2 }, [x]),
    val: calc(n => n, [y]),
    noop: set({ [x]: 5 }), // sets x to its current value
  })
  yEvals = 0
  p.noop() // x stays 5 → y should not reeval
  assert.equal(yEvals, 0)
})

test('set cascade: changing one ctx updates dependents', () => {
  const x = ctx<number>('x')
  const y = ctx<number>('y')
  const p = run({
    [x]: 2,
    [y]: calc(n => n * 3, [x]),
    valY: calc(n => n, [y]),
    incX: set({ [x]: calc(n => n + 1, [x]) })
  })
  assert.equal(p.valY(), 6)
  p.incX()
  assert.equal(p.valY(), 9)
})

// ─── arg ─────────────────────────────────────────────────────────────────────

section('arg')

test('basic arg passing', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), setX: set({ [x]: arg<number>(0) }) })
  ;(p.setX as any)(42)
  assert.equal(p.val(), 42)
})

test('multiple args', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    va: calc(n => n, [a]), vb: calc(n => n, [b]),
    setAB: set({ [a]: arg<number>(0), [b]: arg<number>(1) })
  })
  ;(p.setAB as any)(10, 20)
  assert.equal(p.va(), 10)
  assert.equal(p.vb(), 20)
})

test('arg used inside calc', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 0,
    val: calc(n => n, [x]),
    addN: set({ [x]: calc((cur, n) => cur + n, [x, arg<number>(0)]) })
  })
  ;(p.addN as any)(5)
  assert.equal(p.val(), 5)
  ;(p.addN as any)(3)
  assert.equal(p.val(), 8)
})

test('arg defaults to undefined when not passed', () => {
  const x = ctx<any>('x')
  const p = run({ [x]: 'initial', val: calc(v => v, [x]), setX: set({ [x]: arg(0) }) })
  ;(p.setX as any)()
  assert.equal(p.val(), undefined)
})

test('args are scoped to action call, do not leak', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    va: calc(n => n, [a]), vb: calc(n => n, [b]),
    setA: set({ [a]: arg<number>(0) }),
    setB: set({ [b]: arg<number>(0) }),
  })
  ;(p.setA as any)(10)
  ;(p.setB as any)(20)
  assert.equal(p.va(), 10)
  assert.equal(p.vb(), 20)
})

// ─── scoping ─────────────────────────────────────────────────────────────────

section('scoping')

test('child reads ctx from parent scope', () => {
  const theme = ctx<string>('theme')
  const p = run({ [theme]: 'dark', child: { label: calc(t => `theme: ${t}`, [theme]) } })
  assert.equal(p.child.label(), 'theme: dark')
})

test('nearest ancestor wins', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 1, child: { [x]: 2, val: calc(n => n, [x]) } })
  assert.equal(p.child.val(), 2)
})

test('parent ctx unaffected by child definition', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 1, val: calc(n => n, [x]), child: { [x]: 99, val: calc(n => n, [x]) } })
  assert.equal(p.val(), 1)
  assert.equal(p.child.val(), 99)
})

test('set targets nearest ancestor from action location', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 0,
    rootVal: calc(n => n, [x]),
    child: {
      [x]: 10,
      childVal: calc(n => n, [x]),
      inc: set({ [x]: calc(n => n + 1, [x]) })
    }
  })
  assert.equal(p.rootVal(), 0)
  assert.equal(p.child.childVal(), 10)
  p.child.inc()
  assert.equal(p.rootVal(), 0)    // root x unchanged
  assert.equal(p.child.childVal(), 11) // child x incremented
})

test('deep nesting resolves ancestor ctx', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 7, a: { b: { c: { val: calc(n => n, [x]) } } } })
  assert.equal(p.a.b.c.val(), 7)
})

test('sibling ctx is not visible — resolves to undefined', () => {
  const x = ctx<number>('x')
  const p = run({
    left:  { [x]: 10 },
    right: { val: calc(n => n, [x]) } // x not an ancestor of right
  })
  assert.equal(p.right.val(), undefined)
})

test('deeply nested action sets correct scope ctx', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 0,
    rootVal: calc(n => n, [x]),
    a: { b: { [x]: 5, childVal: calc(n => n, [x]), reset: set({ [x]: 0 }) } }
  })
  assert.equal(p.a.b.childVal(), 5)
  p.a.b.reset()
  assert.equal(p.rootVal(), 0)   // root x still 0
  assert.equal(p.a.b.childVal(), 0) // child x reset
})

// ─── reactivity ──────────────────────────────────────────────────────────────

section('reactivity')

test('reactive ctx formula resets when dep changes', () => {
  const active = ctx<boolean>('active')
  const x = ctx<number>('x')
  const p = run({
    [active]: false,
    child: { [x]: iff(active, 10, 0), val: calc(n => n, [x]), on: set({ [active]: true }) }
  })
  assert.equal(p.child.val(), 0)
  p.child.on()
  assert.equal(p.child.val(), 10)
})

test('manual set is overwritten when formula dep changes', () => {
  const active = ctx<boolean>('active')
  const x = ctx<number>('x')
  const p = run({
    [active]: false,
    child: {
      [x]: iff(active, 10, 0),
      val: calc(n => n, [x]),
      setX: set({ [x]: 99 }),
      toggle: set({ [active]: calc(b => !b, [active]) })
    }
  })
  p.child.setX()
  assert.equal(p.child.val(), 99)
  p.child.toggle()               // active changes → x formula re-runs
  assert.equal(p.child.val(), 10) // x reset to formula result
})

test('unchanged ctx value halts propagation chain', () => {
  const x = ctx<number>('x')
  const y = ctx<string>('y')
  const z = ctx<number>('z')
  let zEvals = 0
  const p = run({
    [x]: 0,
    [y]: calc(() => 'fixed', [x]),        // always returns same value despite depending on x
    [z]: calc((s: string) => { zEvals++; return s.length }, [y]),
    incX: set({ [x]: calc(n => n + 1, [x]) })
  })
  zEvals = 0
  p.incX() // x changes → y reruns but returns same 'fixed' → z should NOT reeval
  assert.equal(zEvals, 0)
})

test('chain of deps propagates correctly', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 1,
    a: calc(n => n * 2, [x]),
    b: calc(n => n + 10, [calc(n => n * 2, [x])]),
    inc: set({ [x]: calc(n => n + 1, [x]) })
  })
  assert.equal(p.a(), 2)
  assert.equal(p.b(), 12)
  p.inc()
  assert.equal(p.a(), 4)
  assert.equal(p.b(), 14)
})

test('multiple ctxs changing in one set — all dependents update', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({
    [a]: 1, [b]: 10,
    sum: calc((a, b) => a + b, [a, b]),
    setBoth: set({ [a]: 5, [b]: 20 })
  })
  assert.equal(p.sum(), 11)
  p.setBoth()
  assert.equal(p.sum(), 25)
})

// ─── watch ────────────────────────────────────────────────────────────────────

section('watch')

test('callback fires with new value on change', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n * 2, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => seen.push(v))
  p.inc()
  p.inc()
  assert.deepEqual(seen, [2, 4])
})

test('unsubscribe stops callbacks', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  const unwatch = watch(p.val, v => seen.push(v))
  p.inc()
  unwatch()
  p.inc()
  p.inc()
  assert.equal(seen.length, 1)
  assert.equal(seen[0], 1)
})

test('watch on subtree only fires for subtree deps', () => {
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({
    [a]: 0, [b]: 0,
    left:  { val: calc(n => n, [a]) },
    right: { val: calc(n => n, [b]) },
    incA: set({ [a]: calc(n => n + 1, [a]) }),
    incB: set({ [b]: calc(n => n + 1, [b]) }),
  })
  const leftFires: number[] = []
  watch(p.left, v => leftFires.push(v.val))
  p.incB() // b changes — left should NOT fire
  assert.equal(leftFires.length, 0)
  p.incA() // a changes — left fires
  assert.equal(leftFires.length, 1)
  assert.equal(leftFires[0], 1)
})

test('watch on leaf value', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n + 1, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  const seen: number[] = []
  watch(p.val, v => seen.push(v))
  p.inc()
  assert.deepEqual(seen, [2])
})

test('multiple watchers on same node all fire', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  const a: number[] = [], b: number[] = []
  watch(p.val, v => a.push(v))
  watch(p.val, v => b.push(v))
  p.inc()
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
})

test('watch on subtree receives full resolved object', () => {
  const x = ctx<number>('x')
  const p = run({ [x]: 0, sub: { a: calc(n => n, [x]), b: calc(n => n * 2, [x]) }, inc: set({ [x]: calc(n => n + 1, [x]) }) })
  let last: any = null
  watch(p.sub, v => { last = v })
  p.inc()
  assert.deepEqual(last, { a: 1, b: 2 })
})

test('watch re-tracks deps after branch switch', () => {
  const flag = ctx<boolean>('flag')
  const a = ctx<number>('a')
  const b = ctx<number>('b')
  const p = run({
    [flag]: true, [a]: 1, [b]: 10,
    val: iff(flag, calc(n => n, [a]), calc(n => n, [b])),
    toggle: set({ [flag]: calc(f => !f, [flag]) }),
    incA: set({ [a]: calc(n => n + 1, [a]) }),
    incB: set({ [b]: calc(n => n + 1, [b]) }),
  })
  const seen: any[] = []
  watch(p.val, v => seen.push(v))
  p.incA()   // on a branch → fires
  assert.equal(seen.length, 1)
  p.toggle() // switch to b → fires
  assert.equal(seen.length, 2)
  p.incA()   // no longer watching a → should NOT fire
  assert.equal(seen.length, 2)
  p.incB()   // now watching b → fires
  assert.equal(seen.length, 3)
})

test('watch does not fire when value unchanged', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 5,
    val: calc(() => 'constant', [x]), // reads x but always returns same value
    incX: set({ [x]: calc(n => n + 1, [x]) })
  })
  const seen: any[] = []
  watch(p.val, v => seen.push(v))
  p.incX() // x changes → val re-evals but result unchanged → watcher should not fire
  assert.equal(seen.length, 0)
})

// ─── arrays ───────────────────────────────────────────────────────────────────

section('arrays')

test('array as ctx leaf value', () => {
  const items = ctx<string[]>('items')
  const p = run({ [items]: ['a', 'b'], count: calc(arr => arr.length, [items]) })
  assert.equal(p.count(), 2)
})

test('array in tree with object elements — element access', () => {
  const p = run({ items: [{ label: 'one' }, { label: 'two' }] })
  assert.equal((p.items as any)[0].label(), 'one')
  assert.equal((p.items as any)[1].label(), 'two')
})

test('array element with iff — updates when ctx changes', () => {
  const flag = ctx<boolean>('flag')
  const p = run({
    [flag]: false,
    items: [iff(flag, 'yes', 'no')],
    on: set({ [flag]: true })
  })
  assert.equal((p.items as any)[0](), 'no')
  p.on()
  assert.equal((p.items as any)[0](), 'yes')
})

test('mixed array: plain and reactive elements', () => {
  const flag = ctx<boolean>('flag')
  const p = run({
    [flag]: false,
    items: [{ label: 'static' }, iff(flag, { label: 'active' }, { label: 'inactive' })]
  })
  assert.equal((p.items as any)[0].label(), 'static')
  assert.equal((p.items as any)[1].label(), 'inactive')
})

test('watch on array fires when element changes', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, items: [iff(flag, 1, 0)], on: set({ [flag]: true }) })
  const seen: any[] = []
  watch(p.items as any, v => seen.push(v))
  p.on()
  assert.equal(seen.length, 1)
  assert.deepEqual(seen[0], [1])
})

// ─── edge cases ───────────────────────────────────────────────────────────────

section('edge cases')

test('run with empty object', () => {
  const p = run({})
  assert.deepEqual(p(), {})
})

test('multiple independent run() instances do not interfere', () => {
  const x = ctx<number>('x')
  const p1 = run({ [x]: 1, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  const p2 = run({ [x]: 100, val: calc(n => n, [x]), inc: set({ [x]: calc(n => n + 1, [x]) }) })
  p1.inc()
  assert.equal(p1.val(), 2)
  assert.equal(p2.val(), 100)
})

test('same ctx symbol reused across multiple run() calls is independent', () => {
  const x = ctx<number>('x')
  const p1 = run({ [x]: 1, val: calc(n => n, [x]) })
  const p2 = run({ [x]: 99, val: calc(n => n, [x]) })
  assert.equal(p1.val(), 1)
  assert.equal(p2.val(), 99)
})

test('string values pass through calc unchanged', () => {
  const name = ctx<string>('name')
  const p = run({ [name]: 'Alice', greeting: calc(n => `Hello, ${n}!`, [name]) })
  assert.equal(p.greeting(), 'Hello, Alice!')
})

test('boolean toggling via calc', () => {
  const flag = ctx<boolean>('flag')
  const p = run({ [flag]: false, val: calc(f => f, [flag]), toggle: set({ [flag]: calc(f => !f, [flag]) }) })
  assert.equal(p.val(), false)
  p.toggle()
  assert.equal(p.val(), true)
  p.toggle()
  assert.equal(p.val(), false)
})

test('reactive iff with nested scope and inherited ctx', () => {
  const mode = ctx<string>('mode')
  const base = ctx<number>('base')
  const p = run({
    [mode]: 'a',
    [base]: 10,
    child: iff(
      calc(m => m === 'a', [mode]),
      { result: calc(b => b * 2, [base]) },
      { result: calc(b => b + 1, [base]) }
    ),
    setMode: set({ [mode]: 'b' }),
  })
  assert.equal(p.child.result(), 20)
  p.setMode()
  assert.equal(p.child.result(), 11)
})

test('action called multiple times accumulates state', () => {
  const count = ctx<number>('count')
  const p = run({ [count]: 0, val: calc(n => n, [count]), inc: set({ [count]: calc(n => n + 1, [count]) }) })
  for (let i = 0; i < 10; i++) p.inc()
  assert.equal(p.val(), 10)
})

// ─── combinations ────────────────────────────────────────────────────────────

section('combinations')

test('iff as set assignment value — evaluated at call time', () => {
  const flag = ctx<boolean>('flag')
  const x    = ctx<number>('x')
  const p = run({
    [flag]: true, [x]: 0,
    val:    x,
    assign: set({ [x]: iff(flag, 1, 0) }),
  })
  p.assign()
  assert.equal(p.val(), 1)  // flag=true → iff resolves to 1
})

test('iff as calc arg', () => {
  const flag = ctx<boolean>('flag')
  const p = run({
    [flag]: true,
    val: calc(v => v * 2, [iff(flag, 3, 5)]),
    flip: set({ [flag]: calc(f => !f, [flag]) }),
  })
  assert.equal(p.val(), 6)   // flag=true → iff=3 → 6
  p.flip()
  assert.equal(p.val(), 10)  // flag=false → iff=5 → 10
})

test('arg inside iff inside set', () => {
  const flag = ctx<boolean>('flag')
  const x    = ctx<number>('x')
  const p = run({
    [flag]: true, [x]: 0,
    val:    x,
    assign: set({ [x]: iff(flag, arg<number>(0), 0) }),
  })
  ;(p.assign as any)(42)
  assert.equal(p.val(), 42)  // flag=true → iff picks arg(0)=42
})

test('watch on a single key of a distributed iff', () => {
  const flag = ctx<boolean>('flag')
  const p = run({
    [flag]: false,
    s: iff(flag, { x: 1, y: 2 }, { x: 3, y: 4 }),
    flip: set({ [flag]: calc(f => !f, [flag]) }),
  })
  const seen: number[] = []
  watch((p.s as any).x, (v: number) => seen.push(v))
  p.flip()
  assert.deepEqual(seen, [1])  // x changed from 3 → 1
  p.flip()
  assert.deepEqual(seen, [1, 3])  // x changed back to 3
})

test('chain of reactive ctx formulas — cascade through two resets', () => {
  const x = ctx<number>('x')
  const y = ctx<number>('y')
  const z = ctx<number>('z')
  const p = run({
    [x]: 1,
    [y]: calc(n => n * 2, [x]),   // reactive: resets when x changes
    [z]: calc(n => n + 10, [y]),  // reactive: resets when y changes
    val:  z,
    incX: set({ [x]: calc(n => n + 1, [x]) }),
  })
  assert.equal(p.val(), 12)  // z = (1*2)+10 = 12
  p.incX()
  assert.equal(p.val(), 14)  // z = (2*2)+10 = 14
})

test('iff cond reads arg via calc', () => {
  const x = ctx<number>('x')
  const p = run({
    [x]: 0,
    val:    x,
    assign: set({ [x]: iff(calc((n: number) => n > 0, [arg<number>(0)]), 1, -1) }),
  })
  ;(p.assign as any)(5)
  assert.equal(p.val(), 1)   // arg=5 > 0 → iff picks 1
  ;(p.assign as any)(-3)
  assert.equal(p.val(), -1)  // arg=-3 ≤ 0 → iff picks -1
})

// ─── summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
