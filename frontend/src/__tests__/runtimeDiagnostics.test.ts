import { describe, expect, it } from "vitest";

import {
  createDesktopRuntimeDiagnostic,
  createTaskDiagnostic,
} from "../services/debug/runtimeDiagnostics";

describe("runtimeDiagnostics", () => {
  it("creates a desktop runtime diagnostic snapshot", () => {
    expect(
      createDesktopRuntimeDiagnostic({
        status: "pong",
        contract_version: 1,
        bridge_version: "1.2.3",
        task_owner_mode: "desktop",
        capabilities: ["getDesktopRuntimeInfo", "listDesktopTasks"],
        worker: {
          protocol_version: 1,
          app_version: "0.1.0",
        },
      }),
    ).toEqual({
      contract_version: 1,
      bridge_version: "1.2.3",
      task_owner_mode: "desktop",
      worker_protocol_version: 1,
      capabilities: ["getDesktopRuntimeInfo", "listDesktopTasks"],
    });
  });

  it("creates a task diagnostic snapshot", () => {
    expect(
      createTaskDiagnostic(
        {
          id: "task-1",
          type: "translate",
          status: "running",
          progress: 42,
          task_source: "backend",
          task_contract_version: 1,
          persistence_scope: "runtime",
          lifecycle: "resumable",
          queue_state: "running",
          queue_position: null,
          request_params: {
            context_path: "E:/demo.srt",
            mode: "standard",
            context_ref: {
              path: "E:/canonical/demo.srt",
              name: "demo.srt",
            },
            subtitle_ref: {
              path: "E:/canonical/demo.srt",
              name: "demo.srt",
            },
          },
          result: {
            files: [{ type: "subtitle", path: "E:/demo.zh.srt" }],
            meta: {
              language: "Chinese",
              subtitle_ref: {
                path: "E:/canonical/demo.zh.srt",
                name: "demo.zh.srt",
              },
              output_ref: {
                path: "E:/canonical/demo.zh.srt",
                name: "demo.zh.srt",
              },
            },
          },
          created_at: 1,
        },
        {
          taskSubmission: 1,
          directResult: 0,
        },
      ),
    ).toEqual({
      task_source: "backend",
      lifecycle: "resumable",
      task_contract_version: 1,
      task_contract_normalized_from_legacy: false,
      persistence_scope: "runtime",
      queue_state: "running",
      queue_position: null,
      type: "translate",
      status: "running",
      params_keys: ["context_path", "mode", "context_ref", "subtitle_ref"],
      request_media_refs: {
        video_ref: null,
        subtitle_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
        context_ref: {
          path: "E:/canonical/demo.srt",
          name: "demo.srt",
        },
      },
      result_files: [{ type: "subtitle", path: "E:/demo.zh.srt" }],
      result_meta: {
        language: "Chinese",
        subtitle_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
        output_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
      },
      result_media_refs: {
        video_ref: null,
        subtitle_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
        context_ref: null,
        output_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
      },
      runtime_execution_summary: {
        taskSubmission: 1,
        directResult: 0,
      },
    });
  });

  it("keeps legacy result mirrors only in raw result_meta, not in compat path fields", () => {
    expect(
      createTaskDiagnostic(
        {
          id: "task-raw-meta-srt",
          type: "translate",
          status: "completed",
          progress: 100,
          task_contract_normalized_from_legacy: true,
          task_contract_version: 2,
          request_params: {},
          result: {
            meta: {
              srt_path: "E:/legacy/output.srt",
            },
          },
          created_at: 1,
        },
        {
          taskSubmission: 1,
          directResult: 0,
        },
      ),
    ).toMatchObject({
      result_meta: {
        srt_path: "E:/legacy/output.srt",
      },
    });
  });
});
