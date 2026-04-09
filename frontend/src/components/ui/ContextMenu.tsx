import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  hasEditableKeyboardTarget,
  isKeyboardEventComposing,
} from '../../utils/keyboardShortcuts';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

export function ContextMenu({ items, position, onClose }: ContextMenuProps) {
  const [menuNode, setMenuNode] = useState<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const adjustedPosition = useMemo(() => {
    if (!position || !menuNode) return null;

    const rect = menuNode.getBoundingClientRect();
    let x = position.x;
    let y = position.y;

    if (x + rect.width > window.innerWidth) {
      x = window.innerWidth - rect.width - 10;
    }

    if (y + rect.height > window.innerHeight) {
      y = window.innerHeight - rect.height - 10;
    }

    return { x, y };
  }, [menuNode, position]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    
    // Handle Esc key
    const handleKeyDown = (event: KeyboardEvent) => {
        if (isKeyboardEventComposing(event) || hasEditableKeyboardTarget(event)) {
          return;
        }

        if(event.key === 'Escape') onClose();
    }

    if (position) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  if (!position) return null;

  // Use adjustedPosition if available, otherwise hide initially to prevent flash
  const finalPos = adjustedPosition || { x: -9999, y: -9999 };

  return createPortal(
    <div
      ref={(node) => {
        menuRef.current = node;
        setMenuNode(node);
      }}
      className={`fixed z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-75 text-slate-100 select-none`}
      style={{ top: finalPos.y, left: finalPos.x, opacity: adjustedPosition ? 1 : 0 }}
    >
      {items.map((item, index) => (
        item.separator ? (
            <div key={index} className="h-[1px] bg-slate-700 my-1 mx-2" />
        ) : (
            <button
            key={index}
            onClick={() => {
                if(!item.disabled) {
                    item.onClick();
                    onClose();
                }
            }}
            disabled={item.disabled}
            className={`
                w-full text-left px-3 py-1.5 text-sm flex items-center justify-between
                ${item.danger ? 'text-red-400 hover:bg-red-900/20' : 'text-slate-200 hover:bg-slate-700'}
                ${item.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                transition-colors
            `}
            >
            <span>{item.label}</span>
            {item.shortcut && (
                <span className="text-xs text-slate-500 ml-4 font-mono">{item.shortcut}</span>
            )}
            </button>
        )
      ))}
    </div>,
    document.body
  );
}
