/* @vitest-environment jsdom */
import React from "react";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPreview } from "../components/dialogs/synthesis/components/VideoPreview";
import type { CropState } from "../components/dialogs/synthesis/hooks/useCrop";
import type { OutputSettingsState } from "../components/dialogs/synthesis/hooks/useOutputSettings";
import type { SubtitleStyleState } from "../components/dialogs/synthesis/hooks/useSubtitleStyle";
import type { WatermarkState } from "../components/dialogs/synthesis/hooks/useWatermark";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

function createOutputState(): OutputSettingsState {
  return {
    quality: "balanced",
    setQuality: vi.fn(),
    isQualityMenuOpen: false,
    setIsQualityMenuOpen: vi.fn(),
    useGpu: true,
    setUseGpu: vi.fn(),
    outputFilename: "",
    setOutputFilename: vi.fn(),
    outputDir: null,
    setOutputDir: vi.fn(),
    handleSelectOutputFolder: vi.fn(),
    trimStart: 0,
    setTrimStart: vi.fn(),
    trimEnd: 0,
    setTrimEnd: vi.fn(),
    targetResolution: "original",
    setTargetResolution: vi.fn(),
  };
}

function createCropState(): CropState {
  return {
    isEnabled: false,
    setIsEnabled: vi.fn(),
    crop: { x: 0, y: 0, w: 1, h: 1 },
    setCrop: vi.fn(),
  };
}

function createWatermarkState(): WatermarkState {
  return {
    watermarkRef: null,
    watermarkPreviewUrl: null,
    wmScale: 0.2,
    wmOpacity: 0.8,
    wmPos: { x: 0.5, y: 0.5 },
    watermarkSize: { w: 0, h: 0 },
    setWmScale: vi.fn(),
    setWmOpacity: vi.fn(),
    setWmPos: vi.fn(),
    handleWatermarkSelect: vi.fn(),
    applyWmPositionPreset: vi.fn(),
  };
}

function createSubtitleStyleState(): SubtitleStyleState {
  const initializedRef = { current: true };
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
    bgPadding: 5,
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
    setSubPos: vi.fn(),
    resetSubPos: vi.fn(),
    currentSubtitle: "",
    fontAvailabilityMessage: null,
    isInitialized: initializedRef,
  };
}

describe("synthesis VideoPreview interactions", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("toggles playback when clicking the video frame", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const onTimeUpdate = vi.fn();

    const { container } = render(
      <VideoPreview
        mediaUrl="file:///D:/source.mp4"
        style={createSubtitleStyleState()}
        watermark={createWatermarkState()}
        output={createOutputState()}
        crop={createCropState()}
        subtitleEnabled={false}
        watermarkEnabled={false}
        onClose={vi.fn()}
        onExportClick={vi.fn()}
        isSubmitting={false}
        videoRef={videoRef}
        setVideoSize={vi.fn()}
        currentTime={0}
        onTimeUpdate={onTimeUpdate}
      />,
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();

    const play = vi.fn(() => Promise.resolve());
    Object.defineProperty(video, "paused", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(video, "play", {
      configurable: true,
      value: play,
    });
    Object.defineProperty(video, "videoWidth", {
      configurable: true,
      value: 1280,
    });
    Object.defineProperty(video, "videoHeight", {
      configurable: true,
      value: 720,
    });
    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 60,
    });

    fireEvent.loadedMetadata(video as HTMLVideoElement);
    fireEvent.canPlay(video as HTMLVideoElement);
    fireEvent.click(video as HTMLVideoElement);

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("previews only the active clip range and stops at its end", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const onTimeUpdate = vi.fn();
    const { container } = render(
      <VideoPreview
        mediaUrl="file:///D:/source.mp4"
        style={createSubtitleStyleState()}
        watermark={createWatermarkState()}
        output={createOutputState()}
        crop={createCropState()}
        subtitleEnabled={false}
        watermarkEnabled={false}
        onClose={vi.fn()}
        onExportClick={vi.fn()}
        isSubmitting={false}
        videoRef={videoRef}
        setVideoSize={vi.fn()}
        currentTime={12}
        onTimeUpdate={onTimeUpdate}
        previewRange={{ start: 10, end: 12 }}
        allowTrim={false}
      />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    const play = vi.fn(() => Promise.resolve());
    const pause = vi.fn();
    Object.defineProperties(video, {
      paused: { configurable: true, value: true },
      play: { configurable: true, value: play },
      pause: { configurable: true, value: pause },
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      duration: { configurable: true, value: 60 },
    });
    video.currentTime = 12;

    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);
    fireEvent.click(video);

    expect(video.currentTime).toBe(10);
    expect(play).toHaveBeenCalledOnce();

    video.currentTime = 12.2;
    fireEvent.timeUpdate(video);
    expect(pause).toHaveBeenCalled();
    expect(video.currentTime).toBe(12);
    expect(onTimeUpdate).toHaveBeenCalledWith(12);
  });

  it("uses the crop rectangle as the subtitle and watermark output viewport", () => {
    const videoRef = React.createRef<HTMLVideoElement>();
    const crop = createCropState();
    crop.isEnabled = true;
    crop.crop = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 };
    const watermark = createWatermarkState();
    watermark.watermarkPreviewUrl = "data:image/png;base64,AA==";
    const style = createSubtitleStyleState();
    style.currentSubtitle = "Preview subtitle";

    const { container, getByTestId } = render(
      <VideoPreview
        mediaUrl="file:///D:/source.mp4"
        style={style}
        watermark={watermark}
        output={createOutputState()}
        crop={crop}
        subtitleEnabled
        watermarkEnabled
        onClose={vi.fn()}
        onExportClick={vi.fn()}
        isSubmitting={false}
        videoRef={videoRef}
        setVideoSize={vi.fn()}
        currentTime={0}
        onTimeUpdate={vi.fn()}
      />,
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    Object.defineProperties(video, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
      duration: { configurable: true, value: 60 },
    });

    fireEvent.loadedMetadata(video);
    fireEvent.canPlay(video);

    const outputViewport = getByTestId("synthesis-output-viewport");
    Object.defineProperties(outputViewport, {
      clientWidth: { configurable: true, value: 768 },
      clientHeight: { configurable: true, value: 360 },
    });
    fireEvent(window, new Event("resize"));
    expect(outputViewport).toHaveStyle({
      left: "10%",
      top: "20%",
      width: "60%",
      height: "50%",
    });
    expect(outputViewport).toContainElement(
      container.querySelector('[aria-label="watermark.positionControl"]'),
    );
    expect(outputViewport).toContainElement(
      container.querySelector('[aria-label="style.positionControl"]'),
    );
  });
});
