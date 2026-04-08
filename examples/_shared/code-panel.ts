import hljs from 'highlight.js/lib/core'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/atom-one-dark.css'

hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)

function highlight(source: string, name: string): string {
  const lang = name.endsWith('.html') ? 'xml' : 'typescript'
  return hljs.highlight(source, { language: lang }).value
}

/**
 * Renders source code into a styled panel with syntax highlighting.
 * Supports multiple tabs when given more than one file.
 */
export function renderCodePanel(
  container: HTMLElement,
  files: { name: string; source: string }[]
) {
  container.innerHTML = ''
  container.style.cssText = `
    display: flex; flex-direction: column;
    background: #282c34; border-radius: 12px;
    overflow: hidden; font-size: 13px; line-height: 1.6;
    height: 100%;
  `

  let activeIndex = 0

  // Tabs
  const tabBar = document.createElement('div')
  tabBar.style.cssText = `
    display: flex; background: #21252b;
    border-bottom: 1px solid #21262d; flex-shrink: 0;
    overflow-x: auto;
  `

  files.forEach((f, i) => {
    const tab = document.createElement('button')
    tab.textContent = f.name
    tab.dataset.index = String(i)
    tab.style.cssText = `
      padding: .45rem 1rem; border: none; background: transparent;
      color: ${i === 0 ? '#e6edf3' : '#8b949e'};
      font-family: inherit; font-size: .78rem; font-weight: 600;
      cursor: pointer; white-space: nowrap;
      border-bottom: 2px solid ${i === 0 ? '#58a6ff' : 'transparent'};
      transition: color .15s;
    `
    tabBar.appendChild(tab)
  })

  // Single file: still show the filename bar for context
  if (files.length === 1) {
    tabBar.querySelector('button')!.style.cursor = 'default'
  }

  container.appendChild(tabBar)

  const pre = document.createElement('pre')
  pre.style.cssText = `
    margin: 0; padding: 1rem 1.25rem;
    overflow: auto; flex: 1;
    font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: inherit; line-height: inherit;
    tab-size: 2;
  `
  const code = document.createElement('code')
  code.className = 'hljs'
  code.innerHTML = highlight(files[0].source, files[0].name)
  pre.appendChild(code)
  container.appendChild(pre)

  tabBar.addEventListener('click', e => {
    const btn = (e.target as HTMLElement).closest('button')
    if (!btn || files.length === 1) return
    const idx = Number(btn.dataset.index)
    if (idx === activeIndex) return
    activeIndex = idx

    tabBar.querySelectorAll('button').forEach((b, i) => {
      const active = i === idx
      ;(b as HTMLElement).style.color = active ? '#e6edf3' : '#8b949e'
      ;(b as HTMLElement).style.borderBottomColor = active ? '#58a6ff' : 'transparent'
    })

    code.innerHTML = highlight(files[idx].source, files[idx].name)
  })
}
