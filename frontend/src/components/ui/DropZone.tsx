import type {
  DragEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactNode,
} from "react";

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
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!disabled) onDrop(event);
      }}
      className={`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${className}`}
    >
      {children}
    </div>
  );
}
