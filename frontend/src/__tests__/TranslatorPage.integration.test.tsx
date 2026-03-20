import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranslatorPage } from "../pages/TranslatorPage";

const proofreadSubtitleMock = vi.fn();
const startTranslationMock = vi.fn();
const setModeMock = vi.fn();
const setTargetLangMock = vi.fn();
const updateTargetSegmentMock = vi.fn();
const handleFileUploadMock = vi.fn();
const refreshGlossaryMock = vi.fn();
const exportSRTMock = vi.fn();
const handleOpenInEditorMock = vi.fn();

let translatorState = {
  sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
  targetSegments: [] as Array<{ id: string; start: number; end: number; text: string }>,
  glossary: [],
  sourceFilePath: "E:/subs/demo.srt",
  targetLang: "Chinese",
  mode: "intelligent" as const,
  activeMode: null as "standard" | "intelligent" | "proofread" | null,
  resultMode: null as "standard" | "intelligent" | "proofread" | null,
  taskId: null as string | null,
  taskStatus: "",
  progress: 0,
  isTranslating: false,
};

vi.mock("../hooks/useTranslator", () => ({
  useTranslator: () => ({
    ...translatorState,
    setSourceSegments: vi.fn(),
    updateTargetSegment: updateTargetSegmentMock,
    setTargetLang: setTargetLangMock,
    setMode: setModeMock,
    handleFileUpload: handleFileUploadMock,
    refreshGlossary: refreshGlossaryMock,
    startTranslation: startTranslationMock,
    proofreadSubtitle: proofreadSubtitleMock,
    exportSRT: exportSRTMock,
    handleOpenInEditor: handleOpenInEditorMock,
  }),
}));

vi.mock("../services/translator/translatorService", () => ({
  translatorService: {
    addTerm: vi.fn(),
    deleteTerm: vi.fn(),
  },
}));

vi.mock("../components/translator/SegmentsTable", () => ({
  SegmentsTable: () => <div data-testid="segments-table" />,
}));

vi.mock("../components/translator/Sidebar", () => ({
  Sidebar: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        title: "AI 翻译",
        subtitle: "上下文感知",
        "buttons.import.label": "导入",
        "buttons.proofread.label": "校对",
        "buttons.translate.label": "翻译",
        "buttons.export.label": "导出",
        "buttons.editor.label": "编辑器",
        "table.sourceHeader": "源文本",
        "table.targetLangLabel": "目标语言",
        "table.modeLabel": "模式",
        "languages.Chinese": "中文",
        "languages.English": "英语",
        "languages.Japanese": "日语",
        "languages.Spanish": "西班牙语",
        "languages.French": "法语",
        "modes.standard": "标准",
        "modes.intelligent": "智能分割",
        "modes.proofread": "校对",
        "loading.message": "翻译中...",
        "result.proofreadBadge": "校对结果",
        "result.proofreadHint": "当前右侧内容是原语言校对稿，不是目标语言译文。",
      };
      return map[key] || key;
    },
  }),
}));

describe("TranslatorPage integration", () => {
  beforeEach(() => {
    proofreadSubtitleMock.mockReset();
    startTranslationMock.mockReset();
    setModeMock.mockReset();
    setTargetLangMock.mockReset();
    translatorState = {
      sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      targetSegments: [],
      glossary: [],
      sourceFilePath: "E:/subs/demo.srt",
      targetLang: "Chinese",
      mode: "intelligent",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
      isTranslating: false,
    };
  });

  it("keeps the selected mode unchanged while proofread runs", async () => {
    const { rerender } = render(<TranslatorPage />);

    const selects = screen.getAllByRole("combobox");
    const modeSelect = selects[1] as HTMLSelectElement;
    expect(modeSelect.value).toBe("intelligent");

    proofreadSubtitleMock.mockImplementation(() => {
      translatorState = {
        ...translatorState,
        activeMode: "proofread",
        resultMode: "proofread",
        taskStatus: "pending",
        isTranslating: true,
      };
      return Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /校对/i }));
    });

    rerender(<TranslatorPage />);

    expect(modeSelect.value).toBe("intelligent");
    expect(proofreadSubtitleMock).toHaveBeenCalledTimes(1);
    expect(setModeMock).not.toHaveBeenCalled();
    expect(screen.getByText("翻译中...")).not.toBeNull();
    expect(document.querySelector(".lucide-loader-circle")).not.toBeNull();
  });
});
