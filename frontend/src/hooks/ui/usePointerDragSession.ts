import { useEffect, useState } from "react";
import type React from "react";

export type PointerDragSession<T> = T & { pointerId: number };

export function usePointerDragSession<T>({
  onMove,
  onEnd,
}: {
  onMove: (event: PointerEvent, session: PointerDragSession<T>) => void;
  onEnd?: (session: PointerDragSession<T>) => void;
}) {
  const [session, setSession] = useState<PointerDragSession<T> | null>(null);

  useEffect(() => {
    if (!session) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== session.pointerId) return;
      onMove(event, session);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerId !== session.pointerId) return;
      setSession(null);
      onEnd?.(session);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [onEnd, onMove, session]);

  const start = (event: React.PointerEvent, data: T) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setSession({ ...data, pointerId: event.pointerId });
  };

  return { session, start };
}
