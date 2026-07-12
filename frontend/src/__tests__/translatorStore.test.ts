import { beforeEach, describe, expect, it } from "vitest";
import { useTranslatorStore } from "../stores/translatorStore";
import { readUiStateValue } from "../services/persistence/uiStateSettings";
import {
  readWorkspaceStateValue,
  resetWorkspaceStateForTests,
} from "../services/persistence/workspaceState";

describe("translatorStore persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    resetWorkspaceStateForTests();
    useTranslatorStore.setState({
      sourceSegments: [],
      targetSegments: [],
      glossary: [],
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

    const persisted = readWorkspaceStateValue<Record<string, unknown>>(
      "translator-storage",
    );
    expect(persisted).toBeTruthy();

    expect(persisted).toMatchObject({
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
    expect(persisted?.sourceFilePath).toBeUndefined();
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
