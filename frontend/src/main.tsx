import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

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

  window.requestAnimationFrame(() => {
    document.getElementById('boot-splash')?.remove();
  });
};

void initApp();
