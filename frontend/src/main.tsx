/// <reference path="./types/electron.d.ts" />
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
import { apiClient } from './api/client';
import i18n, { initI18n } from './i18n';
import { useEffect, useState } from 'react';

type StartupState = {
  backendReady: boolean;
  message: string;
};

function BootApp() {
  const getStartupText = (key: string) => i18n.t(`startup.status.${key}`);
  const [startupState, setStartupState] = useState<StartupState>({
    backendReady: false,
    message: getStartupText('checkingHealth'),
  });

  useEffect(() => {
    let cancelled = false;

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const updateState = (next: Partial<StartupState>) => {
      if (cancelled) return;
      setStartupState((prev) => ({ ...prev, ...next }));
    };

    const bootstrap = async () => {
      while (!cancelled) {
        try {
          if (!window.electronAPI) {
            console.warn('[Init] Electron API not found, assuming web mode.');
            updateState({
              backendReady: true,
              message: getStartupText('webMode'),
            });
            return;
          }

          updateState({ message: getStartupText('checkingHealth') });

          try {
            await apiClient.checkHealth();
            console.log('[Init] Backend is ready!');

            try {
              const settings = await apiClient.getSettings();
              if (settings?.language) {
                await i18n.changeLanguage(settings.language);
              }
            } catch (error) {
              console.warn('[Init] Failed to load user settings during startup.', error);
            }

            updateState({
              backendReady: true,
              message: getStartupText('ready'),
            });
            return;
          } catch (error) {
            console.log('[Init] Backend not healthy yet...', error);
            updateState({ message: getStartupText('retryingHealth') });
          }
        } catch (error) {
          console.error('Failed to load dynamic config', error);
          updateState({ message: getStartupText('retryingGeneric') });
        }

        await sleep(1000);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <App
      backendReady={startupState.backendReady}
      startupMessage={startupState.message}
    />
  );
}

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
