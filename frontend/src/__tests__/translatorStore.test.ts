import { beforeEach, describe, expect, it } from "vitest";
import { useTranslatorStore } from "../stores/translatorStore";
import { readUiStateValue } from "../services/persistence/uiStateSettings";

describe("translatorStore persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useTranslatorStore.setState({
      sourceSegments: [],
      targetSegments: [],
      glossary: [],
      sourceFilePath: null,
      sourceFileRef: null,
      targetSubtitleRef: null,
      targetLang: "SimplifiedChinese",
      mode: "standard",
      activeMode: null,
      resultMode: null,
      taskId: null,
      taskStatus: "",
      progress: 0,
      taskError: null,
      executionMode: null,
    });
  });

  it("does not persist runtime-only translation task state", () => {
    useTranslatorStore.setState({
      sourceFilePath: "E:/subs/demo.srt",
      sourceFileRef: { path: "E:/subs/demo.srt", name: "demo.srt" },
      targetSegments: [{ id: "1", start: 0, end: 1, text: "nihao" }],
      resultMode: "standard",
      taskId: "task-runtime",
      taskStatus: "running",
      progress: 42,
      taskError: "boom",
      executionMode: "task_submission",
      activeMode: "intelligent",
    });

    const persisted = readUiStateValue<Record<string, unknown>>("translator-storage");
    expect(persisted).toBeTruthy();

    expect(persisted).toMatchObject({
      sourceFilePath: "E:/subs/demo.srt",
      sourceFileRef: { path: "E:/subs/demo.srt", name: "demo.srt" },
      targetSegments: [{ id: "1", start: 0, end: 1, text: "nihao" }],
      resultMode: "standard",
    });
    expect(persisted?.targetLang).toBeUndefined();
    expect(persisted?.taskId).toBeUndefined();
    expect(persisted?.taskStatus).toBeUndefined();
    expect(persisted?.progress).toBeUndefined();
    expect(persisted?.taskError).toBeUndefined();
    expect(persisted?.executionMode).toBeUndefined();
    expect(persisted?.activeMode).toBeUndefined();
  });

  it("persists target language through the shared translation preferences", () => {
    useTranslatorStore.getState().setTargetLang("Japanese");

    expect(useTranslatorStore.getState().targetLang).toBe("Japanese");
    expect(readUiStateValue<string>("translation_preferences")).toContain(
      "\"targetLanguage\":\"Japanese\"",
    );
  });

  it("persists translation mode through the shared translation preferences", () => {
    useTranslatorStore.getState().setMode("intelligent");

    expect(useTranslatorStore.getState().mode).toBe("intelligent");
    expect(readUiStateValue<string>("translation_preferences")).toContain(
      "\"mode\":\"intelligent\"",
    );
  });
});
