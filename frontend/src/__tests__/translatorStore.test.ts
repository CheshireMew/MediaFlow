import { beforeEach, describe, expect, it } from "vitest";
import { useTranslatorStore } from "../stores/translatorStore";

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
      targetLang: "Chinese",
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

    const persistedRaw = localStorage.getItem("translator-storage");
    expect(persistedRaw).toBeTruthy();
    const persisted = JSON.parse(persistedRaw as string) as {
      state: Record<string, unknown>;
    };

    expect(persisted.state).toMatchObject({
      sourceFilePath: "E:/subs/demo.srt",
      sourceFileRef: { path: "E:/subs/demo.srt", name: "demo.srt" },
      targetSegments: [{ id: "1", start: 0, end: 1, text: "nihao" }],
      resultMode: "standard",
    });
    expect(persisted.state.targetLang).toBeUndefined();
    expect(persisted.state.taskId).toBeUndefined();
    expect(persisted.state.taskStatus).toBeUndefined();
    expect(persisted.state.progress).toBeUndefined();
    expect(persisted.state.taskError).toBeUndefined();
    expect(persisted.state.executionMode).toBeUndefined();
    expect(persisted.state.activeMode).toBeUndefined();
  });

  it("persists target language through the shared translation preferences", () => {
    useTranslatorStore.getState().setTargetLang("Japanese");

    expect(useTranslatorStore.getState().targetLang).toBe("Japanese");
    expect(localStorage.getItem("translation_preferences")).toContain(
      "\"targetLanguage\":\"Japanese\"",
    );
  });

  it("persists translation mode through the shared translation preferences", () => {
    useTranslatorStore.getState().setMode("intelligent");

    expect(useTranslatorStore.getState().mode).toBe("intelligent");
    expect(localStorage.getItem("translation_preferences")).toContain(
      "\"mode\":\"intelligent\"",
    );
  });
});
