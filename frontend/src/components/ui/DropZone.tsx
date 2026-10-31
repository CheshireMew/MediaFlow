import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react";
import { useRef, useState } from "react";

export type DropZoneProps = {
  children: ReactNode;
  onActivate: () => void;
  onDrop: DragEventHandler<HTMLDivElement>;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
};

export function DropZone({
  children,
  onActivate,
  onDrop,
  ariaLabel,
  className = "",
  disabled = false,
}: DropZoneProps) {
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const handleClick: MouseEventHandler<HTMLDivElement> = () => {
    if (!disabled) onActivate();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (disabled || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onActivate();
  };

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-dragging={dragging && !disabled || undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => event.preventDefault()}
      onDragEnter={(event) => {
        event.preventDefault();
        if (disabled || !event.dataTransfer.types.includes('Files')) return;
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (!disabled) onDrop(event);
      }}
      className={`data-[dragging=true]:border-indigo-400 data-[dragging=true]:bg-indigo-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${className}`}
    >
      {children}
    </div>
  );
}
