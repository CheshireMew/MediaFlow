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
import { initializeApi, apiClient } from './api/client';

const LoadingScreen = () => (
  <div style={{
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1a1b1e',
    color: '#e0e0e0',
    fontFamily: 'system-ui, sans-serif'
  }}>
    <h2 style={{ marginBottom: '1rem' }}>Connecting to MediaFlow Core...</h2>
    <div className="loader" style={{ 
        width: '20px', 
        height: '20px', 
        border: '2px solid #333', 
        borderTopColor: '#fff', 
        borderRadius: '50%', 
        animation: 'spin 1s linear infinite' 
    }}></div>
    <style>{`
      @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    `}</style>
  </div>
);

const initApp = async () => {
  const root = createRoot(document.getElementById('root')!);
  
  // Show loading initially
  root.render(
    <StrictMode>
       <LoadingScreen />
    </StrictMode>
  );

  const pollConfig = async () => {
    while (true) {
      try {
        // @ts-ignore
        if (window.electronAPI?.getConfig) {
           // @ts-ignore
           const config = await window.electronAPI.getConfig();
           if (config) {
              initializeApi(config);
              
              // Verify connectivity
              try {
                  await apiClient.checkHealth();
                  console.log("[Init] Backend is ready!");
                  return; // Ready!
              } catch (err) {
                  console.log("[Init] Backend found but not healthy yet...", err);
              }
           } else {
               console.log("[Init] Waiting for backend config...");
           }
        } else {
            // Web mode or no electron API? Fallback to default
            console.warn("[Init] Electron API not found, assuming web mode.");
            return;
        }
      } catch (e) {
        console.error("Failed to load dynamic config", e);
      }
      // Wait 1s before retry
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  await pollConfig();

  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
};

initApp();
