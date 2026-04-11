import { isNode, isObj } from './nodes.js'
import { watch } from './runtime.js'

// ─── Types ────────────────────────────────────────────────────────────────────

type Kind = 'ref' | 'calc' | 'iff' | 'set' | 'scope' | 'value'

interface IffInfo { condDesc: string; trueDesc: string; falseDesc: string }

interface DevNode {
  key: string
  path: string
  kind: Kind
  decl: any
  prog: any
  children: DevNode[]
  refName?: string
  calcDeps?: string[]
  iffInfo?: IffInfo
  setArgCount?: number
}

interface LogEntry { t: number; path: string; prev: any; next: any }

// ─── Expression utilities ─────────────────────────────────────────────────────

function describeExpr(e: any, depth = 0): string {
  if (e === undefined || e === null) return '—'
  if (!isNode(e)) return JSON.stringify(e)
  switch (e.type) {
    case 'ref':  return e.name
    case 'calc': return depth > 0 ? 'calc(…)' : `calc(${e.args.map((a: any) => describeExpr(a, 1)).join(', ')})`
    case 'iff':  return `iff(${describeExpr(e.cond, 1)})`
    case 'arg':  return `arg[${e.index}]`
    default:     return e.type
  }
}

function scanMaxArg(node: any): number {
  if (!isNode(node)) return -1
  switch (node.type) {
    case 'arg':  return node.index
    case 'calc': return (node.args as any[]).reduce((m: number, a: any) => Math.max(m, scanMaxArg(a)), -1)
    case 'iff':  return Math.max(scanMaxArg(node.cond), scanMaxArg(node.onTrue), scanMaxArg(node.onFalse))
    default:     return -1
  }
}

function getSetArgCount(setNode: any): number {
  let max = -1
  for (const sym of Object.getOwnPropertySymbols(setNode.assignments)) {
    max = Math.max(max, scanMaxArg((setNode.assignments as any)[sym]))
  }
  return max + 1
}

// ─── Tree building ────────────────────────────────────────────────────────────

function buildDevNode(key: string, parentPath: string, declVal: any, progNode: any): DevNode | null {
  const path = parentPath ? `${parentPath}.${key}` : key

  if (isNode(declVal)) {
    const kind = declVal.type as Kind
    const base: DevNode = { key, path, kind, decl: declVal, prog: progNode, children: [] }
    switch (kind) {
      case 'ref':  base.refName = declVal.name; break
      case 'calc': base.calcDeps = (declVal.args as any[]).map((a: any) => describeExpr(a)); break
      case 'iff':  base.iffInfo = {
          condDesc:  describeExpr(declVal.cond),
          trueDesc:  describeExpr(declVal.onTrue),
          falseDesc: describeExpr(declVal.onFalse),
        }; break
      case 'set': base.setArgCount = getSetArgCount(declVal); break
    }
    return base
  }

  if (Array.isArray(declVal)) {
    const children = (declVal as any[]).flatMap((item: any, i: number) => {
      const c = buildDevNode(String(i), path, item, progNode?.[i])
      return c ? [c] : []
    })
    return { key, path, kind: 'scope', decl: declVal, prog: progNode, children }
  }

  if (isObj(declVal)) {
    const children = Object.keys(declVal).flatMap(k => {
      const c = buildDevNode(k, path, (declVal as any)[k], progNode?.[k])
      return c ? [c] : []
    })
    return { key, path, kind: 'scope', decl: declVal, prog: progNode, children }
  }

  return { key, path, kind: 'value', decl: declVal, prog: progNode, children: [] }
}

function buildDevTree(app: object, program: any): DevNode[] {
  return Object.keys(app).flatMap(key => {
    const c = buildDevNode(key, '', (app as any)[key], program?.[key])
    return c ? [c] : []
  })
}

// ─── Value formatting ─────────────────────────────────────────────────────────

function fmtVal(v: any): { text: string; cls: string } {
  if (v === undefined) return { text: 'undefined', cls: 'dt-v-undef' }
  if (v === null)      return { text: 'null',      cls: 'dt-v-null'  }
  if (typeof v === 'boolean') return { text: String(v), cls: 'dt-v-bool' }
  if (typeof v === 'number')  return { text: String(v), cls: 'dt-v-num'  }
  if (typeof v === 'string')  return { text: `"${v}"`,  cls: 'dt-v-str'  }
  if (typeof v === 'function') return { text: 'fn()',   cls: 'dt-v-fn'   }
  if (Array.isArray(v))  return { text: `[…${v.length}]`, cls: 'dt-v-obj' }
  if (typeof v === 'object')   return { text: '{…}',    cls: 'dt-v-obj'  }
  return { text: String(v), cls: '' }
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
.dt-panel{position:fixed;bottom:16px;right:16px;width:390px;height:540px;background:#13161d;border:1px solid #2d333b;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,.65);font-family:'Fira Code','Cascadia Code',Consolas,monospace;font-size:12px;color:#c9d1d9;z-index:999999;display:flex;flex-direction:column;overflow:hidden;resize:both;min-width:260px;min-height:180px}
.dt-header{background:#0d1117;border-bottom:1px solid #2d333b;padding:7px 10px;display:flex;align-items:center;gap:8px;cursor:grab;user-select:none;flex-shrink:0}
.dt-header:active{cursor:grabbing}
.dt-dots{display:flex;gap:5px}
.dt-dot{width:11px;height:11px;border-radius:50%;cursor:pointer;flex-shrink:0}
.dt-dot-close{background:#ff5f57}.dt-dot-close:hover{filter:brightness(1.2)}
.dt-dot-min{background:#febc2e}.dt-dot-min:hover{filter:brightness(1.2)}
.dt-title{font-size:10px;font-weight:700;color:#58a6ff;letter-spacing:.07em;text-transform:uppercase;flex:1;text-align:center}
.dt-tabs{display:flex;background:#0d1117;border-bottom:1px solid #2d333b;flex-shrink:0}
.dt-tab{flex:1;padding:5px;font-size:10px;font-weight:700;border:none;background:none;color:#8b949e;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit;letter-spacing:.05em;text-transform:uppercase}
.dt-tab.active{color:#e6edf3;border-bottom-color:#58a6ff}
.dt-search{padding:5px 8px;background:#0d1117;border-bottom:1px solid #2d333b;flex-shrink:0}
.dt-search-input{width:100%;background:#161b22;border:1px solid #2d333b;border-radius:5px;padding:3px 8px;color:#c9d1d9;font-family:inherit;font-size:11px;outline:none;box-sizing:border-box}
.dt-search-input:focus{border-color:#58a6ff}
.dt-scroll{flex:1;overflow-y:auto;overflow-x:hidden}
.dt-scroll::-webkit-scrollbar{width:4px}
.dt-scroll::-webkit-scrollbar-track{background:transparent}
.dt-scroll::-webkit-scrollbar-thumb{background:#2d333b;border-radius:2px}
.dt-tree{padding:4px 0}
.dt-node{}
.dt-row{display:flex;align-items:center;gap:4px;padding:2px 6px 2px 2px;cursor:pointer;min-height:22px;border-radius:4px;margin:0 4px;transition:background .08s}
.dt-row:hover{background:rgba(255,255,255,.05)}
.dt-toggle{width:14px;text-align:center;color:#6e7681;font-size:9px;flex-shrink:0;line-height:1}
.dt-badge{font-size:8px;font-weight:800;padding:1px 5px;border-radius:3px;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0}
.dt-b-ref{background:#0d2543;color:#58a6ff}
.dt-b-calc{background:#1c1040;color:#a78bfa}
.dt-b-iff{background:#0d2a14;color:#3fb950}
.dt-b-set{background:#2a1208;color:#f78166}
.dt-b-scope{background:#1c2128;color:#6e7681}
.dt-b-value{background:#1c2128;color:#6e7681}
.dt-key{color:#79c0ff;flex-shrink:0;font-size:11px}
.dt-colon{color:#6e7681;flex-shrink:0}
.dt-val{font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;transition:color .1s}
.dt-v-num{color:#79c0ff}.dt-v-str{color:#a5d6ff}.dt-v-bool{color:#f78166}.dt-v-undef,.dt-v-null,.dt-v-fn{color:#6e7681}.dt-v-obj{color:#8b949e}
.dt-action-area{display:flex;align-items:center;gap:4px;margin-left:auto;flex-shrink:0}
.dt-arg{background:#161b22;border:1px solid #2d333b;border-radius:4px;padding:2px 5px;color:#c9d1d9;font-family:inherit;font-size:10px;width:52px;outline:none}
.dt-arg:focus{border-color:#58a6ff}
.dt-run{background:#f78166;border:none;border-radius:4px;color:#fff;font-size:8px;font-weight:800;padding:2px 8px;cursor:pointer;font-family:inherit;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0}
.dt-run:hover{background:#ff9580}
.dt-run:active{transform:scale(.93)}
.dt-children{padding-left:14px}
.dt-extra{padding:3px 8px 3px 30px;display:flex;flex-direction:column;gap:2px}
.dt-iff-row{display:flex;align-items:baseline;gap:6px;font-size:10px;color:#8b949e}
.dt-iff-cond{color:#6e7681;font-size:9px}
.dt-iff-t{color:#3fb950;font-weight:700;font-size:9px}
.dt-iff-f{color:#f78166;font-weight:700;font-size:9px}
.dt-iff-v{color:#c9d1d9}
.dt-deps{font-size:10px;color:#6e7681}
.dt-deps-label{color:#a78bfa}
.dt-sep{width:100%;height:1px;background:#2d333b;margin:2px 0;flex-shrink:0}
@keyframes dt-flash{0%{background:rgba(255,220,0,.3)}100%{background:transparent}}
.dt-flash{animation:dt-flash .55s ease-out}
.dt-log-toolbar{display:flex;align-items:center;padding:5px 10px;border-bottom:1px solid #2d333b;flex-shrink:0;gap:8px}
.dt-log-count{color:#6e7681;font-size:10px;flex:1}
.dt-log-clear{background:none;border:1px solid #2d333b;border-radius:4px;color:#8b949e;font-size:9px;padding:2px 8px;cursor:pointer;font-family:inherit}
.dt-log-clear:hover{border-color:#f78166;color:#f78166}
.dt-log-list{display:flex;flex-direction:column}
.dt-log-group{border-bottom:1px solid rgba(45,51,59,.5)}
.dt-log-group-header{padding:3px 10px;display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.dt-log-group-header:hover{background:rgba(255,255,255,.03)}
.dt-log-group-ts{color:#6e7681;font-size:10px;flex-shrink:0}
.dt-log-group-badge{font-size:8px;font-weight:800;padding:1px 5px;border-radius:3px;background:#1c2128;color:#6e7681;letter-spacing:.05em}
.dt-log-group-toggle{color:#6e7681;font-size:9px;margin-left:auto}
.dt-log-group-body{display:flex;flex-direction:column}
.dt-log-entry{padding:2px 10px 2px 20px;font-size:10px;display:flex;flex-wrap:wrap;gap:3px;align-items:baseline}
.dt-log-entry:hover{background:rgba(255,255,255,.03)}
.dt-log-path{color:#79c0ff}
.dt-log-arr{color:#6e7681}
.dt-log-new{color:#3fb950}
.dt-minimized .dt-tabs,.dt-minimized .dt-search,.dt-minimized .dt-scroll,.dt-minimized .dt-log-toolbar{display:none}
.dt-minimized{height:auto!important;resize:none}
.dt-hidden{display:none!important}
`

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls)  e.className = cls
  if (text) e.textContent = text
  return e
}

// ─── Flash helper ─────────────────────────────────────────────────────────────

function flash(e: HTMLElement) {
  e.classList.remove('dt-flash')
  void e.offsetWidth
  e.classList.add('dt-flash')
}

// ─── Node renderer ────────────────────────────────────────────────────────────

function renderNode(
  node: DevNode,
  container: HTMLElement,
  filter: () => string,
  log: LogEntry[],
  onLog: () => void,
  subs: Array<() => void>,
  depth: number = 0
) {
  const wrapper = el('div', 'dt-node')

  // ── Row ──────────────────────────────────────────────────────────────────
  const row = el('div', 'dt-row')
  row.style.paddingLeft = `${6 + depth * 14}px`

  const toggle = el('span', 'dt-toggle')
  const badge  = el('span', `dt-badge dt-b-${node.kind}`, node.kind)
  const keyEl  = el('span', 'dt-key', node.key)
  const colon  = el('span', 'dt-colon', ':')

  row.append(toggle, badge, keyEl)

  const hasChildren = node.children.length > 0
  const hasExtra = node.kind === 'iff' || (node.kind === 'calc' && node.calcDeps && node.calcDeps.length > 0)
  const expandable = hasChildren || hasExtra

  // ── Children container ───────────────────────────────────────────────────
  const childCont = el('div', 'dt-children')
  let expanded = node.kind === 'scope' && depth < 2  // auto-expand top scopes
  let scopePlaceholder: HTMLElement | null = null

  function setExpanded(v: boolean) {
    expanded = v
    toggle.textContent = expandable ? (expanded ? '▾' : '▸') : ''
    childCont.style.display = expanded ? '' : 'none'
    if (scopePlaceholder) scopePlaceholder.style.display = expanded ? 'none' : ''
  }

  if (expandable) {
    row.addEventListener('click', e => {
      // Don't toggle when clicking action area
      if ((e.target as HTMLElement).closest('.dt-action-area')) return
      setExpanded(!expanded)
    })
  } else {
    toggle.textContent = ''
  }

  // ── Value display ────────────────────────────────────────────────────────
  if (node.kind !== 'set' && node.kind !== 'scope') {
    row.append(colon)
    const valEl = el('span', 'dt-val')

    function updateVal(v: any) {
      const { text, cls } = fmtVal(v)
      valEl.textContent = text
      valEl.className = `dt-val ${cls}`
      flash(valEl)
    }

    if (node.prog) {
      try {
        let lastVal: any = node.prog()
        updateVal(lastVal)
        const unsub = watch(node.prog, (next: any) => {
          const prev = lastVal
          lastVal = next
          updateVal(next)
          log.push({ t: Date.now(), path: node.path, prev, next })
          onLog()
        })
        subs.push(unsub)
      } catch {
        valEl.textContent = 'err'
        valEl.className = 'dt-val dt-v-undef'
      }
    } else {
      const { text, cls } = fmtVal(node.decl)
      valEl.textContent = text
      valEl.className = `dt-val ${cls}`
    }
    row.append(valEl)
  }

  // ── Scope collapsed placeholder ──────────────────────────────────────────
  if (node.kind === 'scope' && hasChildren) {
    scopePlaceholder = el('span', 'dt-val dt-v-obj', '{…}')
    row.append(colon, scopePlaceholder)
    scopePlaceholder.style.display = expanded ? 'none' : ''
  }

  // ── Action area (set nodes) ──────────────────────────────────────────────
  if (node.kind === 'set') {
    const area = el('div', 'dt-action-area')
    const argInputs: HTMLInputElement[] = []

    for (let i = 0; i < (node.setArgCount ?? 0); i++) {
      const inp = el('input', 'dt-arg') as HTMLInputElement
      inp.placeholder = `arg${i}`
      inp.title = `Argument ${i} (JSON)`
      area.append(inp)
      argInputs.push(inp)
    }

    const runBtn = el('button', 'dt-run', 'Run')
    runBtn.addEventListener('click', () => {
      if (!node.prog) return
      const args = argInputs.map(inp => {
        try { return JSON.parse(inp.value || 'undefined') } catch { return inp.value }
      })
      try { node.prog(...args) } catch(e) { console.error('[treem devtool] action error:', e) }
    })
    area.append(runBtn)
    row.append(area)
  }

  wrapper.append(row)

  // ── Extra panel (iff branches, calc deps) ────────────────────────────────
  if (hasExtra) {
    const extra = el('div', 'dt-extra')

    if (node.kind === 'iff' && node.iffInfo) {
      const condRow = el('div', 'dt-iff-row')
      condRow.append(
        el('span', 'dt-iff-cond', `cond: ${node.iffInfo.condDesc}`)
      )
      const trueRow = el('div', 'dt-iff-row')
      trueRow.append(el('span', 'dt-iff-t', 'TRUE'), el('span', 'dt-iff-v', node.iffInfo.trueDesc))
      const falseRow = el('div', 'dt-iff-row')
      falseRow.append(el('span', 'dt-iff-f', 'FALSE'), el('span', 'dt-iff-v', node.iffInfo.falseDesc))
      extra.append(condRow, trueRow, falseRow)
    }

    if (node.kind === 'calc' && node.calcDeps && node.calcDeps.length > 0) {
      const depRow = el('div', 'dt-deps')
      const lbl = el('span', 'dt-deps-label', 'deps: ')
      depRow.append(lbl, document.createTextNode(node.calcDeps.join(', ')))
      extra.append(depRow)
    }

    childCont.append(extra)
  }

  // ── Recurse into children ────────────────────────────────────────────────
  if (hasChildren) {
    if (hasExtra) childCont.append(el('div', 'dt-sep'))
    for (const child of node.children) {
      renderNode(child, childCont, filter, log, onLog, subs, depth + 1)
    }
  }

  wrapper.append(childCont)
  setExpanded(expanded)
  container.append(wrapper)

  // ── Filter support ───────────────────────────────────────────────────────
  function applyFilter() {
    const q = filter().toLowerCase().trim()
    if (!q) { wrapper.classList.remove('dt-hidden'); return }
    const match = node.key.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)
    wrapper.classList.toggle('dt-hidden', !match)
  }
  ;(wrapper as any).__applyFilter = applyFilter
  applyFilter()
}

// ─── Panel factory ────────────────────────────────────────────────────────────

function createPanel(): { panel: HTMLElement; stateTab: HTMLElement; logTab: HTMLElement; stateContent: HTMLElement; logContent: HTMLElement; searchInput: HTMLInputElement; onClear: (cb: () => void) => void } {
  const panel = el('div', 'dt-panel')

  // Header
  const header = el('div', 'dt-header')
  const dots = el('div', 'dt-dots')
  const dotClose = el('div', 'dt-dot dt-dot-close'); dotClose.title = 'Close'
  const dotMin   = el('div', 'dt-dot dt-dot-min');   dotMin.title   = 'Minimise'
  dots.append(dotClose, dotMin)
  const title = el('div', 'dt-title', 'treem devtools')
  header.append(dots, title)
  panel.append(header)

  // Tabs
  const tabs = el('div', 'dt-tabs')
  const stateTab = el('button', 'dt-tab active', 'State')
  const logTab   = el('button', 'dt-tab',        'Log')
  tabs.append(stateTab, logTab)
  panel.append(tabs)

  // Search (state tab only)
  const searchDiv = el('div', 'dt-search')
  const searchInput = el('input', 'dt-search-input') as HTMLInputElement
  searchInput.placeholder = 'Filter…'
  searchDiv.append(searchInput)
  panel.append(searchDiv)

  // State content
  const stateScroll = el('div', 'dt-scroll')
  const stateContent = el('div', 'dt-tree')
  stateScroll.append(stateContent)

  // Log content
  const logScroll = el('div', 'dt-scroll dt-hidden')
  const logToolbar = el('div', 'dt-log-toolbar')
  const logCountEl = el('span', 'dt-log-count', '0 events')
  const logClearBtn = el('button', 'dt-log-clear', 'Clear')
  logToolbar.append(logCountEl, logClearBtn)
  const logList = el('div', 'dt-log-list')
  logScroll.append(logToolbar, logList)

  panel.append(stateScroll, logScroll)

  // Tab switching
  stateTab.addEventListener('click', () => {
    stateTab.classList.add('active');   logTab.classList.remove('active')
    stateScroll.classList.remove('dt-hidden'); logScroll.classList.add('dt-hidden')
    searchDiv.classList.remove('dt-hidden')
  })
  logTab.addEventListener('click', () => {
    logTab.classList.add('active');   stateTab.classList.remove('active')
    logScroll.classList.remove('dt-hidden'); stateScroll.classList.add('dt-hidden')
    searchDiv.classList.add('dt-hidden')
  })

  // Minimise / close
  let minimised = false
  dotMin.addEventListener('click', () => {
    minimised = !minimised
    panel.classList.toggle('dt-minimized', minimised)
  })
  dotClose.addEventListener('click', () => panel.remove())

  // Drag
  let dragging = false, ox = 0, oy = 0, pr = 0, pb = 0
  header.addEventListener('mousedown', e => {
    dragging = true
    const rect = panel.getBoundingClientRect()
    ox = e.clientX - rect.left
    oy = e.clientY - rect.top
    pr = window.innerWidth  - rect.right
    pb = window.innerHeight - rect.bottom
    document.body.style.userSelect = 'none'
  })
  document.addEventListener('mousemove', e => {
    if (!dragging) return
    const l = e.clientX - ox
    const t = e.clientY - oy
    panel.style.right = `${window.innerWidth - l - panel.offsetWidth}px`
    panel.style.bottom = `${window.innerHeight - t - panel.offsetHeight}px`
    panel.style.left = 'auto'
    panel.style.top  = 'auto'
  })
  document.addEventListener('mouseup', () => {
    dragging = false
    document.body.style.userSelect = ''
  })

  // Log clear
  let clearCb: (() => void) | null = null
  logClearBtn.addEventListener('click', () => {
    logList.innerHTML = ''
    logCountEl.textContent = '0 events'
    clearCb?.()
  })

  return { panel, stateTab, logTab, stateContent, logContent: logList, searchInput, onClear: cb => { clearCb = cb } }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function devtool(program: any, app: object): () => void {
  // Inject styles once
  if (!document.getElementById('treem-dt-styles')) {
    const style = document.createElement('style')
    style.id = 'treem-dt-styles'
    style.textContent = CSS
    document.head.append(style)
  }

  const nodes = buildDevTree(app, program)
  const subs: Array<() => void> = []
  const log: LogEntry[] = []

  const { panel, stateContent, logContent, searchInput, onClear } = createPanel()

  // Search / filter
  let filterQuery = ''
  searchInput.addEventListener('input', () => {
    filterQuery = searchInput.value
    // Re-apply filter to all rendered nodes
    stateContent.querySelectorAll('.dt-node').forEach(n => {
      const fn = (n as any).__applyFilter
      if (typeof fn === 'function') fn()
    })
  })

  // Log renderer — batches all entries that arrive in the same synchronous flush
  let logCursor = 0
  let flushPending = false
  onClear(() => { log.length = 0; logCursor = 0 })

  function fmtTs(t: number): string {
    const d = new Date(t)
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}.${d.getMilliseconds().toString().padStart(3,'0')}`
  }

  function flushLog() {
    flushPending = false
    const batch = log.slice(logCursor)
    logCursor = log.length
    if (batch.length === 0) return

    const group = el('div', 'dt-log-group')
    const header = el('div', 'dt-log-group-header')
    const ts = el('span', 'dt-log-group-ts', fmtTs(batch[0].t))
    const badge = el('span', 'dt-log-group-badge', `${batch.length} change${batch.length === 1 ? '' : 's'}`)
    const toggle = el('span', 'dt-log-group-toggle', '▾')
    header.append(ts, badge, toggle)

    const body = el('div', 'dt-log-group-body')
    for (const entry of batch) {
      const row = el('div', 'dt-log-entry')
      row.append(
        el('span', 'dt-log-path', entry.path),
        el('span', 'dt-log-arr', '→'),
        el('span', 'dt-log-new', fmtVal(entry.next).text),
      )
      body.append(row)
    }

    let collapsed = false
    header.addEventListener('click', () => {
      collapsed = !collapsed
      body.style.display = collapsed ? 'none' : ''
      toggle.textContent = collapsed ? '▸' : '▾'
    })

    group.append(header, body)
    logContent.prepend(group)

    const countEl = logContent.closest('.dt-scroll')?.querySelector('.dt-log-count')
    if (countEl) countEl.textContent = `${log.length} event${log.length === 1 ? '' : 's'}`
  }

  function renderLog() {
    if (flushPending) return
    flushPending = true
    queueMicrotask(flushLog)
  }

  // Render all tree nodes
  for (const node of nodes) {
    renderNode(node, stateContent, () => filterQuery, log, renderLog, subs)
  }

  document.body.append(panel)

  return () => {
    subs.forEach(u => u())
    panel.remove()
  }
}
