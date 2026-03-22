import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// ── Bundled Fonts (WOFF2, local) ──
// Noto Sans SC: Chinese Simplified subset, Regular + Bold
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-700.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-regular.css'
import 'lxgw-wenkai-webfont/lxgwwenkai-bold.css'

import './index.css'
import { BootApp } from './components/startup/BootApp';
import { initI18n } from './i18n';

const initApp = async () => {
  await initI18n('zh');

  const root = createRoot(document.getElementById('root')!);
  root.render(
    <StrictMode>
      <BootApp />
    </StrictMode>,
  );
};

void initApp();
