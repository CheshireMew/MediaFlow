import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { WindowControls } from './WindowControls';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#0a0a0a', color: '#eee', position: 'relative' }}>
        {/* Custom Title Bar / Drag Region */}
        {/* Drag region stops 120px before the right edge to avoid overlap */}
        <div 
          className="titlebar-drag-region"
          style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: '120px', // Reserve space for controls
            height: '40px', 
            zIndex: 50,
            WebkitAppRegion: 'drag',
          } as any}
        />

        {/* Window Controls (Occupies the reserved space) */}
        <div 
          className="titlebar-controls"
          style={{ 
            position: 'absolute', 
            top: 0, 
            right: 0, 
            width: '120px',
            height: '40px',
            zIndex: 60,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            WebkitAppRegion: 'no-drag',
          } as any}
        >
             <WindowControls />
        </div>
        
        {/* Main Content - Add top padding to avoid overlap if necessary, but user wants overlay style? 
            Actually, user said "buttons... integrated into interface".
            If we float them on top, they cover content. 
            Ideally, header components should yield space.
            Let's keep it floating for now as requested "Custom Title Bar" usually implies overlay or dedicated space.
            Current headers are h-16 (64px). Our controls are ~40px.
            So it fits IN the header space.
        */}
        {children}
      </div>
    </div>
  );
}
