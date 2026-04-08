import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { renderCodePanel } from '../../_shared/code-panel'
import storeSource        from './store.ts?raw'
import useWatchableSource from './useWatchable.ts?raw'
import appSource          from './App.tsx?raw'
import mainSource         from './main.tsx?raw'
import htmlSource         from '../index.html?raw'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

renderCodePanel(document.getElementById('code-panel')!, [
  { name: 'store.ts',        source: storeSource },
  { name: 'useWatchable.ts', source: useWatchableSource },
  { name: 'App.tsx',         source: appSource },
  { name: 'main.tsx',        source: mainSource },
  { name: 'index.html',      source: htmlSource },
])
