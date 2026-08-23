import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "../api/client";
import { TASK_CONTRACT_VERSION } from "../contracts/runtimeContracts";
import { TranslatorPage } from "../pages/TranslatorPage";
import { useTranslatorStore } from "../stores/translatorStore";
import type { Task, TaskArtifact } from "../types/task";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";
import { installElectronMock } from "./testUtils/electronMock";
import { createMockUserSettings } from "./testUtils/mockUserSettings";

const taskContextMock = vi.hoisted(() => ({
  tasks: [] as Task[],
  connected: true,
  remoteTasksReady: true,
  tasksSettled: true,
  addTask: vi.fn(),
}));

vi.mock("../context/taskContext", () => ({
  useTaskContext: () => taskContextMock,
  useTaskActions: () => taskContextMock,
}));

vi.mock("../components/translator/SegmentsTable", () => ({
  SegmentsTable: ({
    sourceSegments,
    targetSegments,
  }: {
    sourceSegments: Array<{ text: string }>;
    targetSegments: Array<{ text: string }>;
  }) => (
    <div>
      <div data-testid="workflow-source">
        {sourceSegments.map((segment) => segment.text).join("|")}
      </div>
      <div data-testid="workflow-target">
        {targetSegments.map((segment) => segment.text).join("|")}
      </div>
    </div>
  ),
}));

vi.mock("../components/translator/Sidebar", () => ({
  Sidebar: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "buttons.translate.label": "翻译",
        "buttons.proofread.label": "校对",
        "buttons.import.label": "导入",
        "buttons.export.label": "导出",
        "buttons.editor.label": "编辑器",
      };
      return labels[key] ?? key;
    },
  }),
}));

function artifact(
  role: "input" | "output" | "context",
  path: string,
  name: string,
): TaskArtifact {
  return { kind: "subtitle", role, ref: { path, name } };
}

describe("TranslatorPage translation workflow", () => {
  beforeEach(() => {
    installElectronMock();
    taskContextMock.tasks = [];
    taskContextMock.addTask.mockReset();
    taskContextMock.addTask.mockImplementation((task: Task) => {
      taskContextMock.tasks = [...taskContextMock.tasks, task];
    });
    vi.spyOn(apiClient, "getSettings").mockResolvedValue(createMockUserSettings());
    vi.spyOn(apiClient, "runPipeline").mockResolvedValue({
      task_id: "translation-task-1",
      status: "pending",
      task_source: "backend",
      task_contract_version: TASK_CONTRACT_VERSION,
      revision: 0,
      persistence_scope: "runtime",
      lifecycle: "resumable",
      queue_state: "queued",
      queue_position: null,
      primary_operation: "translate",
      message_code: "queued",
      message_params: {},
    });
    useTranslatorStore.setState({
      sourceSegments: [{ id: "1", start: 0, end: 1, text: "hello" }],
      targetSegments: [],
      glossary: [],
      sourceFileRef: { path: "E:/subs/demo.srt", name: "demo.srt" },
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

  it("submits translation and renders the typed backend result", async () => {
    const { rerender } = render(<TranslatorPage />);

    expect(screen.getByTestId("workflow-source").textContent).toBe("hello");
    expect(screen.getByTestId("workflow-target").textContent).toBe("");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /翻译/i }));
    });

    await waitFor(() => {
      expect(apiClient.runPipeline).toHaveBeenCalledWith(
        expect.objectContaining({
          pipeline_id: "translator_tool",
          steps: [
            expect.objectContaining({
              step_name: "translate",
              params: expect.objectContaining({
                segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
                target_language: "SimplifiedChinese",
                mode: "standard",
              }),
            }),
          ],
        }),
      );
      expect(useTranslatorStore.getState().taskId).toBe("translation-task-1");
    });

    taskContextMock.tasks = [
      {
        ...BACKEND_TASK_CONTRACT_FIELDS,
        id: "translation-task-1",
        type: "pipeline",
        primary_operation: "translate",
        status: "completed",
        progress: 100,
        created_at: 1,
        request_params: {
          pipeline_id: "translator_tool",
          steps: [
            {
              step_name: "translate",
              params: {
                segments: [{ id: "1", start: 0, end: 1, text: "hello" }],
                context_ref: { path: "E:/subs/demo.srt", name: "demo.srt" },
                target_language: "SimplifiedChinese",
                mode: "standard",
              },
            },
          ],
        },
        result: {
          success: true,
          artifacts: [
            artifact("output", "E:/subs/demo_zh.srt", "demo_zh.srt"),
          ],
          outputs: {
            translation: {
              segments: [{ id: "1", start: 0, end: 1, text: "你好" }],
              language: "SimplifiedChinese",
              mode: "standard",
            },
          },
        },
        artifacts: [
          artifact("context", "E:/subs/demo.srt", "demo.srt"),
          artifact("output", "E:/subs/demo_zh.srt", "demo_zh.srt"),
        ],
      } as Task,
    ];

    rerender(<TranslatorPage />);

    await waitFor(() => {
      expect(screen.getByTestId("workflow-target").textContent).toBe("你好");
      expect(useTranslatorStore.getState().taskStatus).toBe("finalizing");
    });
  });
});
