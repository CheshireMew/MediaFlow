/* @vitest-environment jsdom */
import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CropOverlay } from "../components/dialogs/synthesis/components/CropOverlay";
import { SubtitlePreviewLayer } from "../components/dialogs/synthesis/components/SubtitlePreviewLayer";
import { WatermarkPreviewLayer } from "../components/dialogs/synthesis/components/WatermarkPreviewLayer";
import { usePreviewDrag } from "../components/dialogs/synthesis/hooks/usePreviewDrag";
import type { SubtitleStyleState } from "../components/dialogs/synthesis/hooks/useSubtitleStyle";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createPointerEvent(
  type: string,
  values: { pointerId: number; clientX: number; clientY: number; pointerType?: string },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: values.pointerId },
    pointerType: { value: values.pointerType ?? "touch" },
    clientX: { value: values.clientX },
    clientY: { value: values.clientY },
  });
  return event;
}

function CropHarness() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState({ x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  return (
    <div ref={frameRef} data-testid="crop-frame">
      <CropOverlay crop={crop} setCrop={setCrop} containerRef={frameRef} />
    </div>
  );
}

function WatermarkHarness() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0.5, y: 0.5 });
  const { dragging, startDrag } = usePreviewDrag({
    viewportRef: frameRef,
    setWmPos: setPosition,
    setSubPos: vi.fn(),
  });
  return (
    <div ref={frameRef} data-testid="watermark-frame">
      <WatermarkPreviewLayer
        watermarkPreviewUrl="data:image/png;base64,AA=="
        wmScale={0.2}
        wmOpacity={0.8}
        wmPos={position}
        dragging={dragging}
        onDragStart={startDrag}
        onPositionChange={setPosition}
      />
      <output data-testid="watermark-position">{position.x.toFixed(2)},{position.y.toFixed(2)}</output>
    </div>
  );
}

function createSubtitleStyle(setSubPos: SubtitleStyleState["setSubPos"]): SubtitleStyleState {
  return {
    fontSize: 24,
    fontColor: "#ffffff",
    fontName: "Arial",
    isBold: false,
    isItalic: false,
    outlineSize: 2,
    shadowSize: 0,
    outlineColor: "#000000",
    bgEnabled: false,
    bgColor: "#000000",
    bgOpacity: 0.5,
    bgPadding: 4,
    alignment: 2,
    multilineAlign: "center",
    isFontAvailable: true,
    setFontSize: vi.fn(),
    setFontColor: vi.fn(),
    setFontName: vi.fn(),
    setIsBold: vi.fn(),
    setIsItalic: vi.fn(),
    setOutlineSize: vi.fn(),
    setShadowSize: vi.fn(),
    setOutlineColor: vi.fn(),
    setBgEnabled: vi.fn(),
    setBgColor: vi.fn(),
    setBgOpacity: vi.fn(),
    setBgPadding: vi.fn(),
    setAlignment: vi.fn(),
    setMultilineAlign: vi.fn(),
    customPresets: [],
    presetNameInput: null,
    setPresetNameInput: vi.fn(),
    confirmSavePreset: vi.fn(),
    applyPreset: vi.fn(),
    deletePreset: vi.fn(),
    subPos: { x: 0.5, y: 0.88 },
    setSubPos,
    resetSubPos: vi.fn(),
    currentSubtitle: "Preview subtitle",
    fontAvailabilityMessage: null,
    isInitialized: { current: true },
  };
}

describe("synthesis position controls", () => {
  it("renders the normalized crop rectangle and supports keyboard move and resize", () => {
    render(<CropHarness />);

    const moveControl = screen.getByRole("button", { name: "preview.cropRegionControl" });
    const overlay = moveControl.parentElement as HTMLElement;
    expect(overlay.style.left).toBe("10%");
    expect(overlay.style.width).toBe("50%");

    fireEvent.keyDown(moveControl, { key: "ArrowRight" });
    expect(overlay.style.left).toBe("11%");

    fireEvent.keyDown(
      screen.getByRole("button", { name: "preview.cropHandleBottomRight" }),
      { key: "ArrowLeft", shiftKey: true },
    );
    expect(Number.parseFloat(overlay.style.width)).toBeCloseTo(45);
  });

  it("moves the watermark from the keyboard and a touch pointer", () => {
    render(<WatermarkHarness />);
    const frame = screen.getByTestId("watermark-frame");
    Object.defineProperty(frame, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }),
    });
    const control = screen.getByRole("button", { name: "watermark.positionControl" });

    fireEvent.keyDown(control, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByTestId("watermark-position")).toHaveTextContent("0.55,0.50");

    fireEvent(control, createPointerEvent("pointerdown", { pointerId: 7, clientX: 110, clientY: 50 }));
    fireEvent(window, createPointerEvent("pointermove", { pointerId: 7, clientX: 150, clientY: 25 }));
    fireEvent(window, createPointerEvent("pointerup", { pointerId: 7, clientX: 150, clientY: 25 }));
    expect(screen.getByTestId("watermark-position")).toHaveTextContent("0.75,0.25");
  });

  it("exposes subtitle position as a vertical slider with keyboard adjustment", () => {
    const setSubPos = vi.fn();
    render(
      <SubtitlePreviewLayer
        style={createSubtitleStyle(setSubPos)}
        frameSize={{ width: 640, height: 360 }}
        sourceSize={{ width: 1920, height: 1080 }}
        fallbackText="Subtitle"
        dragging={null}
        onSubtitleDragStart={vi.fn()}
      />,
    );

    const control = screen.getByRole("slider", { name: "style.positionControl" });
    expect(control).toHaveAttribute("aria-valuenow", "88");
    fireEvent.keyDown(control, { key: "ArrowUp", shiftKey: true });
    expect(setSubPos).toHaveBeenCalledWith({ x: 0.5, y: 0.83 });
  });
});
