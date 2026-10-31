import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { WindowControls } from './WindowControls';

type AppRegionStyle = React.CSSProperties & {
  WebkitAppRegion: "no-drag";
};

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const controlsRegionStyle: AppRegionStyle = {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '120px',
    height: '40px',
    zIndex: 10000,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag',
    pointerEvents: 'none',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--surface-canvas)', color: 'var(--text-primary)', position: 'relative' }}>
        {children}

        {/* Window Controls (Occupies the reserved space) */}
        <div 
          className="titlebar-controls"
          style={controlsRegionStyle}
        >
             <WindowControls />
        </div>
      </main>
    </div>
  );
}
