import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionResults } from "../components/transcriber/TranscriptionResults";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number }) => {
      if (key === "results.title") return "Result Preview";
      if (key === "results.empty") return "No transcription results yet";
      if (key === "results.missingSubtitleAlert") return "No usable SRT path was found in the result.";
      if (key === "actions.translate") return "Translate";
      if (key === "actions.openEditor") return "Open Editor";
      if (key === "results.segmentsCount") return `${params?.count ?? 0} segments`;
      return key;
    },
  }),
}));

describe("TranscriptionResults actions", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    window.electronAPI = {
      getPathForFile: vi.fn(),
      openFile: vi.fn(),
      openSubtitleFile: vi.fn(),
      readFile: vi.fn(),
      showSaveDialog: vi.fn(),
      selectDirectory: vi.fn(),
      showInExplorer: vi.fn(),
      fetchCookies: vi.fn(),
      extractDouyinData: vi.fn(),
      writeFile: vi.fn(),
      readBinaryFile: vi.fn(),
      writeBinaryFile: vi.fn(),
      getFileSize: vi.fn(),
      saveFile: vi.fn(),
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
      sendMessage: vi.fn(),
    };
  });

  it("passes resolved paths to translator action", () => {
    const onSendToTranslator = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          srt_path: "E:/sample.srt",
          video_path: "E:/sample.mp4",
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={vi.fn()}
        onSendToTranslator={onSendToTranslator}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Translate" }));

    expect(onSendToTranslator).toHaveBeenCalledWith({
      video_path: "E:/sample.mp4",
      subtitle_path: "E:/sample.srt",
    });
  });

  it("invokes editor action when open editor is clicked", () => {
    const onSendToEditor = vi.fn();

    render(
      <TranscriptionResults
        result={{
          text: "hello world",
          language: "en",
          srt_path: "E:/sample.srt",
          video_path: "E:/sample.mp4",
          segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
        }}
        isSmartSplitting={false}
        onSmartSplit={vi.fn()}
        onSendToEditor={onSendToEditor}
        onSendToTranslator={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Editor" }));

    expect(onSendToEditor).toHaveBeenCalledTimes(1);
  });
});
