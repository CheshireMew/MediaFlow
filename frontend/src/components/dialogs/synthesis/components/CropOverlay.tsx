
import React, { useState, useEffect, useRef } from 'react';

interface Props {
    crop: { x: number; y: number; w: number; h: number };
    setCrop: (v: { x: number; y: number; w: number; h: number }) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const CropOverlay: React.FC<Props> = ({ crop, setCrop, containerRef }) => {
    const [dragMode, setDragMode] = useState<'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null>(null);
    const startPos = useRef<{ x: number; y: number } | null>(null);
    const startCrop = useRef(crop);

    useEffect(() => {
        if (!dragMode) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current || !startPos.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const dx = (e.clientX - startPos.current.x) / rect.width;
            const dy = (e.clientY - startPos.current.y) / rect.height;

            const next = { ...startCrop.current };

            // Helper to clamp
            const clamp = (v: number) => Math.max(0, Math.min(1, v));

            switch (dragMode) {
                case 'move':
                    // Clamp movement
                    const maxX = 1 - next.w;
                    const maxY = 1 - next.h;
                    next.x = Math.max(0, Math.min(maxX, next.x + dx));
                    next.y = Math.max(0, Math.min(maxY, next.y + dy));
                    break;
                
                case 'nw': // Top-Left
                    next.x = Math.min(next.x + next.w - 0.05, Math.max(0, next.x + dx));
                    next.w = startCrop.current.w - (next.x - startCrop.current.x);
                    next.y = Math.min(next.y + next.h - 0.05, Math.max(0, next.y + dy));
                    next.h = startCrop.current.h - (next.y - startCrop.current.y);
                    break;
                    
                case 'ne': // Top-Right
                    next.w = clamp(startCrop.current.w + dx);
                    if (next.x + next.w > 1) next.w = 1 - next.x;
                    
                    next.y = Math.min(next.y + next.h - 0.05, Math.max(0, next.y + dy));
                    next.h = startCrop.current.h - (next.y - startCrop.current.y);
                    break;
                    
                case 'sw': // Bottom-Left
                    next.x = Math.min(next.x + next.w - 0.05, Math.max(0, next.x + dx));
                    next.w = startCrop.current.w - (next.x - startCrop.current.x);
                    
                    next.h = clamp(startCrop.current.h + dy);
                    if (next.y + next.h > 1) next.h = 1 - next.y;
                    break;
                    
                case 'se': // Bottom-Right
                    next.w = clamp(startCrop.current.w + dx);
                    if (next.x + next.w > 1) next.w = 1 - next.x;
                    
                    next.h = clamp(startCrop.current.h + dy);
                    if (next.y + next.h > 1) next.h = 1 - next.y;
                    break;
                    
                // (Simplified: edges invoke corners logic or just expansion)
                // For MVP, just corners are usually enough, but let's add edges if needed.
                // Or map edges to nearest logic.
            }
            
            setCrop(next);
        };

        const handleMouseUp = () => {
            setDragMode(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragMode, containerRef, setCrop]);

    const handleMouseDown = (e: React.MouseEvent, mode: typeof dragMode) => {
        e.preventDefault();
        e.stopPropagation();
        setDragMode(mode);
        startPos.current = { x: e.clientX, y: e.clientY };
        startCrop.current = crop;
    };

    const handleStyle = {
        position: 'absolute' as const,
        width: 10,
        height: 10,
        backgroundColor: 'white',
        border: '1px solid #6366f1',
        borderRadius: '50%',
        zIndex: 50
    };

    return (
        <div 
            className="absolute z-40"
            style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)', // Dim outside
                border: '1px solid #6366f1'
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
            {/* Grid Lines */}
            <div className="absolute inset-0 border-r border-white/20 ml-[33%]" />
            <div className="absolute inset-0 border-r border-white/20 ml-[66%]" />
            <div className="absolute inset-0 border-t border-white/20 mt-[33%]" />
            <div className="absolute inset-0 border-t border-white/20 mt-[66%]" />

            {/* Handles */}
            <div style={{...handleStyle, top: -5, left: -5, cursor: 'nw-resize'}} onMouseDown={(e) => handleMouseDown(e, 'nw')} />
            <div style={{...handleStyle, top: -5, right: -5, cursor: 'ne-resize'}} onMouseDown={(e) => handleMouseDown(e, 'ne')} />
            <div style={{...handleStyle, bottom: -5, left: -5, cursor: 'sw-resize'}} onMouseDown={(e) => handleMouseDown(e, 'sw')} />
            <div style={{...handleStyle, bottom: -5, right: -5, cursor: 'se-resize'}} onMouseDown={(e) => handleMouseDown(e, 'se')} />
        </div>
    );
};
