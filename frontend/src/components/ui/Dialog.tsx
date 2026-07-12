import {
  type MouseEvent as ReactMouseEvent,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { isKeyboardEventComposing } from "../../utils/keyboardShortcuts";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true",
  );
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  busy?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  overlayClassName?: string;
  style?: CSSProperties;
};

export function Dialog({
  open,
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  busy = false,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className = "",
  overlayClassName = "",
  style,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  const closeOnEscapeRef = useRef(closeOnEscape);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
    closeOnEscapeRef.current = closeOnEscape;
  }, [busy, closeOnEscape, onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const initialFocus = dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]");
      (initialFocus ?? dialog).focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isKeyboardEventComposing(event)) return;

      if (event.key === "Escape") {
        if (!closeOnEscapeRef.current || busyRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = getFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      closeOnBackdrop &&
      !busy
    ) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 flex items-center justify-center ${overlayClassName}`}
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className={className}
        style={style}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
