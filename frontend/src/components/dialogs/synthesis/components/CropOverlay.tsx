import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePointerDragSession } from "../../../../hooks/ui/usePointerDragSession";
import { clamp, getArrowDelta } from "../../../../utils/spatialInteraction";

type CropRect = { x: number; y: number; w: number; h: number };
type CropDragMode = "move" | "nw" | "ne" | "sw" | "se";

const MIN_CROP_SIZE = 0.05;

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
    type CropDragSession = {
        mode: CropDragMode;
        startX: number;
        startY: number;
        width: number;
        height: number;
        crop: CropRect;
    };
    const handlePointerMove = useCallback((event: PointerEvent, session: CropDragSession) => {
        const dx = (event.clientX - session.startX) / session.width;
        const dy = (event.clientY - session.startY) / session.height;
        setCrop(applyCropDelta(session.crop, session.mode, dx, dy));
    }, [setCrop]);
    const pointerDrag = usePointerDragSession<CropDragSession>({ onMove: handlePointerMove });

    const startPointerDrag = (event: React.PointerEvent, mode: CropDragMode) => {
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        pointerDrag.start(event, {
            mode,
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
        const delta = getArrowDelta(event.key, event.shiftKey, 0.01, 0.05);
        if (!delta) return;
        event.preventDefault();
        event.stopPropagation();
        setCrop(applyCropDelta(crop, mode, delta.x, delta.y));
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
