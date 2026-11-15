import { ref, calc, iff, update, run } from 'treem'

const theme = ref<'light' | 'dark'>('theme')
const isDark = calc(t => t === 'dark', [theme])

const app = run({
  [theme]: 'light',
  toggle: update({ [theme]: iff(isDark, 'light', 'dark') }),

  // Both branches are objects, so each key becomes its own reactive value
  colors: iff(isDark,
    { background: '#111', text: '#eee' },
    { background: '#fff', text: '#111' },
  ),
})

console.log(app.colors())
app.toggle()
console.log(app.colors.background())
