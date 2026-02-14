import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// ── Bundled Fonts (WOFF2, local) ──
// Noto Sans SC: Chinese Simplified subset, Regular + Bold
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
// LXGW WenKai (霞鹜文楷): Full CJK, Regular + Bold
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-bold.css'

import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
