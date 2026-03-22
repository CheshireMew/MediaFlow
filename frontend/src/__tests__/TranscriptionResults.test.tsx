import { render, screen } from "@testing-library/react";
import i18next from "i18next";
import { I18nextProvider } from "react-i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptionResults } from "../components/transcriber/TranscriptionResults";
import zhTranscriber from "../i18n/locales/zh/transcriber.json";
import enTranscriber from "../i18n/locales/en/transcriber.json";

async function createI18n(language: "zh" | "en") {
  const instance = i18next.createInstance();
  await instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: "en",
    defaultNS: "transcriber",
    interpolation: { escapeValue: false },
    resources: {
      zh: { transcriber: zhTranscriber },
      en: { transcriber: enTranscriber },
    },
  });
  return instance;
}

describe("TranscriptionResults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders translated empty state in Chinese", async () => {
    const i18n = await createI18n("zh");

    render(
      <I18nextProvider i18n={i18n}>
        <TranscriptionResults
          result={null}
          isSmartSplitting={false}
          onSmartSplit={vi.fn()}
          onSendToEditor={vi.fn()}
          onSendToTranslator={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(await screen.findByText("结果预览")).toBeInTheDocument();
    expect(screen.getByText("暂无转录结果")).toBeInTheDocument();
  });

  it("renders translated action labels in English", async () => {
    const i18n = await createI18n("en");

    render(
      <I18nextProvider i18n={i18n}>
        <TranscriptionResults
          result={{
            text: "hello world",
            language: "en",
            srt_path: "E:/sample.srt",
            video_ref: {
              path: "E:/sample.mp4",
              name: "sample.mp4",
            },
            subtitle_ref: {
              path: "E:/sample.srt",
              name: "sample.srt",
            },
            segments: [
              { id: "1", start: 0, end: 1, text: "hello" },
            ],
          }}
          isSmartSplitting={false}
          onSmartSplit={vi.fn()}
          onSendToEditor={vi.fn()}
          onSendToTranslator={vi.fn()}
        />
      </I18nextProvider>,
    );

    expect(await screen.findByText("Result Preview")).toBeInTheDocument();
    expect(screen.getByText("1 segments")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /translate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open editor/i })).toBeInTheDocument();
  });
});
