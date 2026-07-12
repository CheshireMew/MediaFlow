import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type CropRect = { x: number; y: number; w: number; h: number };
type CropDragMode = "move" | "nw" | "ne" | "sw" | "se";

const MIN_CROP_SIZE = 0.05;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function applyCropDelta(
    crop: CropRect,
    mode: CropDragMode,
    dx: number,
    dy: number,
): CropRect {
    if (mode === "move") {
        return {
            ...crop,
            x: clamp(crop.x + dx, 0, 1 - crop.w),
            y: clamp(crop.y + dy, 0, 1 - crop.h),
        };
    }

    const right = crop.x + crop.w;
    const bottom = crop.y + crop.h;
    let nextLeft = crop.x;
    let nextRight = right;
    let nextTop = crop.y;
    let nextBottom = bottom;

    if (mode.includes("w")) {
        nextLeft = clamp(crop.x + dx, 0, right - MIN_CROP_SIZE);
    }
    if (mode.includes("e")) {
        nextRight = clamp(right + dx, crop.x + MIN_CROP_SIZE, 1);
    }
    if (mode.includes("n")) {
        nextTop = clamp(crop.y + dy, 0, bottom - MIN_CROP_SIZE);
    }
    if (mode.includes("s")) {
        nextBottom = clamp(bottom + dy, crop.y + MIN_CROP_SIZE, 1);
    }

    return {
        x: nextLeft,
        y: nextTop,
        w: nextRight - nextLeft,
        h: nextBottom - nextTop,
    };
}

interface Props {
    crop: CropRect;
    setCrop: (v: CropRect) => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const CropOverlay: React.FC<Props> = ({ crop, setCrop, containerRef }) => {
    const { t } = useTranslation("synthesis");
    const [dragState, setDragState] = useState<{
        mode: CropDragMode;
        pointerId: number;
        startX: number;
        startY: number;
        width: number;
        height: number;
        crop: CropRect;
    } | null>(null);

    useEffect(() => {
        if (!dragState) return;

        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerId !== dragState.pointerId) return;
            const dx = (event.clientX - dragState.startX) / dragState.width;
            const dy = (event.clientY - dragState.startY) / dragState.height;
            setCrop(applyCropDelta(dragState.crop, dragState.mode, dx, dy));
        };

        const handlePointerEnd = (event: PointerEvent) => {
            if (event.pointerId === dragState.pointerId) setDragState(null);
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", handlePointerEnd);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", handlePointerEnd);
        };
    }, [dragState, setCrop]);

    const startPointerDrag = (event: React.PointerEvent, mode: CropDragMode) => {
        const container = containerRef.current;
        if (!container) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        const rect = container.getBoundingClientRect();
        setDragState({
            mode,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            width: Math.max(1, rect.width),
            height: Math.max(1, rect.height),
            crop,
        });
    };

    const handleKeyboardDelta = (
        event: React.KeyboardEvent,
        mode: CropDragMode,
    ) => {
        const directions: Record<string, { x: number; y: number }> = {
            ArrowLeft: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 },
            ArrowUp: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 },
        };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        const step = event.shiftKey ? 0.05 : 0.01;
        setCrop(applyCropDelta(crop, mode, direction.x * step, direction.y * step));
    };

    const handles: Array<{
        mode: Exclude<CropDragMode, "move">;
        positionClass: string;
        cursorClass: string;
        label: string;
    }> = [
        { mode: "nw", positionClass: "-left-3 -top-3", cursorClass: "cursor-nw-resize", label: t("preview.cropHandleTopLeft") },
        { mode: "ne", positionClass: "-right-3 -top-3", cursorClass: "cursor-ne-resize", label: t("preview.cropHandleTopRight") },
        { mode: "sw", positionClass: "-bottom-3 -left-3", cursorClass: "cursor-sw-resize", label: t("preview.cropHandleBottomLeft") },
        { mode: "se", positionClass: "-bottom-3 -right-3", cursorClass: "cursor-se-resize", label: t("preview.cropHandleBottomRight") },
    ];

    return (
        <div
            className="pointer-events-none absolute z-40 border border-indigo-500"
            style={{
                left: `${crop.x * 100}%`,
                top: `${crop.y * 100}%`,
                width: `${crop.w * 100}%`,
                height: `${crop.h * 100}%`,
            }}
        >
            <button
                type="button"
                aria-label={t("preview.cropRegionControl")}
                className="pointer-events-auto absolute inset-0 cursor-move border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
                style={{ touchAction: "none" }}
                onPointerDown={(event) => startPointerDrag(event, "move")}
                onKeyDown={(event) => handleKeyboardDelta(event, "move")}
            />
            <div className="pointer-events-none absolute inset-y-0 left-1/3 border-r border-white/20" />
            <div className="pointer-events-none absolute inset-y-0 left-2/3 border-r border-white/20" />
            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/20" />
            <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/20" />

            {handles.map(({ mode, positionClass, cursorClass, label }) => (
                <button
                    key={mode}
                    type="button"
                    aria-label={label}
                    className={`pointer-events-auto absolute z-50 flex h-6 w-6 items-center justify-center rounded-full border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${positionClass} ${cursorClass}`}
                    style={{ touchAction: "none" }}
                    onPointerDown={(event) => startPointerDrag(event, mode)}
                    onKeyDown={(event) => handleKeyboardDelta(event, mode)}
                >
                    <span className="h-2.5 w-2.5 rounded-full border border-indigo-500 bg-white" />
                </button>
            ))}
        </div>
    );
};
