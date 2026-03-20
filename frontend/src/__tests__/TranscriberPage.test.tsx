/* @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriberPage } from "../pages/TranscriberPage";

const useTranscriberMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../hooks/useTranscriber", () => ({
  useTranscriber: () => useTranscriberMock(),
}));

vi.mock("../components/transcriber/AudioFileUploader", () => ({
  AudioFileUploader: ({ file }: { file: { name: string; size: number } | null }) => (
    <div data-testid="audio-file-uploader">
      {file ? `${file.name} (${file.size})` : "no file"}
    </div>
  ),
}));

vi.mock("../components/transcriber/TranscriptionConfig", () => ({
  TranscriptionConfig: ({
    isFileSelected,
    onTranscribe,
    isSubmitting,
  }: {
    isFileSelected: boolean;
    onTranscribe: () => void;
    isSubmitting: boolean;
  }) => (
    <button disabled={!isFileSelected || isSubmitting} onClick={onTranscribe}>
      Start Transcription
    </button>
  ),
}));

vi.mock("../components/transcriber/TranscriptionResults", () => ({
  TranscriptionResults: () => <div data-testid="transcription-results">results</div>,
}));

describe("TranscriberPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useTranscriberMock.mockReturnValue({
      state: {
        file: null,
        model: "base",
        device: "cuda",
        isUploading: false,
        activeTaskId: null,
        result: null,
        activeTask: null,
      },
      actions: {
        onFileSelect: vi.fn(),
        onFileDrop: vi.fn(),
        setModel: vi.fn(),
        setDevice: vi.fn(),
        startTranscription: vi.fn(),
        sendToEditor: vi.fn(),
        sendToTranslator: vi.fn(),
      },
    });
  });

  it("renders correctly", () => {
    render(<TranscriberPage />);
    expect(screen.getByText("title")).toBeTruthy();
    expect(screen.getByText("subtitle")).toBeTruthy();
    expect(screen.getByTestId("audio-file-uploader")).toBeTruthy();
    expect(screen.getByText("Start Transcription")).toBeTruthy();
  });

  it("shows file details after selection", () => {
    useTranscriberMock.mockReturnValue({
      state: {
        file: { name: "sample.mp4", size: 1024 },
        model: "base",
        device: "cuda",
        isUploading: false,
        activeTaskId: null,
        result: null,
        activeTask: null,
      },
      actions: {
        onFileSelect: vi.fn(),
        onFileDrop: vi.fn(),
        setModel: vi.fn(),
        setDevice: vi.fn(),
        startTranscription: vi.fn(),
        sendToEditor: vi.fn(),
        sendToTranslator: vi.fn(),
      },
    });

    render(<TranscriberPage />);

    expect(screen.getByText("sample.mp4 (1024)")).toBeTruthy();
    expect(screen.getByText("Start Transcription").closest("button")?.hasAttribute("disabled")).toBe(false);
  });

  it("disables transcription while request submission is in flight", () => {
    useTranscriberMock.mockReturnValue({
      state: {
        file: { name: "sample.mp4", size: 1024 },
        model: "base",
        device: "cpu",
        isUploading: true,
        activeTaskId: null,
        result: null,
        activeTask: null,
      },
      actions: {
        onFileSelect: vi.fn(),
        onFileDrop: vi.fn(),
        setModel: vi.fn(),
        setDevice: vi.fn(),
        startTranscription: vi.fn(),
        sendToEditor: vi.fn(),
        sendToTranslator: vi.fn(),
      },
    });

    render(<TranscriberPage />);

    expect(screen.getAllByText("Start Transcription")[0].closest("button")?.hasAttribute("disabled")).toBe(true);
  });
});
