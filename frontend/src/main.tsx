import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { BootApp } from './components/startup/BootApp';
import { initI18nWithNamespaces } from './i18n';
import { ensureLaunchHash } from './services/ui/navigationPersistence';
import {
  resolveCurrentPresentationRoute,
  resolveStartupBootstrapNamespaces,
} from './services/ui/pagePresentation';

ensureLaunchHash();

const startupRoute = resolveCurrentPresentationRoute();
const root = createRoot(document.getElementById('root')!);

void initI18nWithNamespaces('zh', resolveStartupBootstrapNamespaces(startupRoute))
  .catch((error) => {
    console.error('[Init] Failed to bootstrap i18n before first render.', error);
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <BootApp />
      </StrictMode>,
    );
  });
