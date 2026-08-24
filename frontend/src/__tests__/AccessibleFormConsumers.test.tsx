/* @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoDownloadOptions } from "../components/downloader/VideoDownloadOptions";
import { OutputSettingsPanel } from "../components/dialogs/synthesis/components/OutputSettingsPanel";
import { PreviewActionBar } from "../components/dialogs/synthesis/components/PreviewActionBar";
import { PreviewToolbar } from "../components/dialogs/synthesis/components/PreviewToolbar";
import type { CropState } from "../components/dialogs/synthesis/hooks/useCrop";
import type { OutputSettingsState } from "../components/dialogs/synthesis/hooks/useOutputSettings";
import { TranscriptionConfig } from "../components/transcriber/TranscriptionConfig";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

function createOutputState(): OutputSettingsState {
  return {
    quality: "balanced",
    setQuality: vi.fn(),
    isQualityMenuOpen: false,
    setIsQualityMenuOpen: vi.fn(),
    useGpu: true,
    setUseGpu: vi.fn(),
    outputFilename: "video.mp4",
    setOutputFilename: vi.fn(),
    outputDir: "D:/output",
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

describe("real form consumers expose accessible names and states", () => {
  it("associates transcription labels with all native selects", () => {
    render(
      <TranscriptionConfig
        engine="builtin"
        setEngine={vi.fn()}
        model="base"
        setModel={vi.fn()}
        device="cpu"
        setDevice={vi.fn()}
        onTranscribe={vi.fn()}
        isFileSelected
        currentTranscriptionTaskId={null}
        isSubmitting={false}
      />,
    );

    expect(screen.getByRole("combobox", { name: "config.engineLabel" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "config.modelSizeLabel" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "config.deviceLabel" })).toBeInTheDocument();
  });

  it("names downloader controls and exposes toggle state", () => {
    render(
      <VideoDownloadOptions
        mediaKind="video"
        resolution="best"
        setResolution={vi.fn()}
        codec="avc"
        setCodec={vi.fn()}
        downloadSubs
        setDownloadSubs={vi.fn()}
        loading={false}
        analyzing={false}
        url="https://example.test/video"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: /options\.quality/ })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /options\.subtitles/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "options.codecCompatible" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "options.codecEfficient" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows audio-only controls for podcast episodes", () => {
    render(
      <VideoDownloadOptions
        mediaKind="audio"
        resolution="1080p"
        setResolution={vi.fn()}
        codec="avc"
        setCodec={vi.fn()}
        downloadSubs
        setDownloadSubs={vi.fn()}
        loading={false}
        analyzing={false}
        url="https://www.xiaoyuzhoufm.com/episode/6966f416109824f9e15f3cb5"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: /options\.format/ })).toHaveValue("audio");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "options.codecCompatible" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "options.downloadAudio" })).toBeInTheDocument();
  });

  it("switches the full downloader form to audio when audio-only quality is selected", () => {
    render(
      <VideoDownloadOptions
        mediaKind="video"
        resolution="audio"
        setResolution={vi.fn()}
        codec="avc"
        setCodec={vi.fn()}
        downloadSubs
        setDownloadSubs={vi.fn()}
        loading={false}
        analyzing={false}
        url="https://example.test/video"
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByRole("combobox", { name: /options\.format/ })).toHaveValue("audio");
    expect(screen.getByRole("combobox")).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "options.codecCompatible" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "options.downloadAudio" })).toBeInTheDocument();
  });

  it("names synthesis settings and preview icon controls", () => {
    const output = createOutputState();
    const crop: CropState = {
      isEnabled: true,
      setIsEnabled: vi.fn(),
      crop: { x: 0, y: 0, w: 1, h: 1 },
      setCrop: vi.fn(),
    };
    const videoRef = React.createRef<HTMLVideoElement>();

    render(
      <>
        <OutputSettingsPanel output={output} />
        <PreviewToolbar
          output={output}
          crop={crop}
          isTrimOpen={false}
          setIsTrimOpen={vi.fn()}
          onClose={vi.fn()}
        />
        <PreviewActionBar
          videoRef={videoRef}
          currentTime={0}
          duration={10}
          onTimeUpdate={vi.fn()}
          onExportClick={vi.fn()}
          isSubmitting={false}
        />
      </>,
    );

    expect(screen.getByRole("group", { name: "output.encoderSelection" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "output.resolution" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "output.filename" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "output.saveFolder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "preview.cropVideo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "common:close" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "preview.togglePlayback" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "preview.seek" })).toBeInTheDocument();
  });
});
