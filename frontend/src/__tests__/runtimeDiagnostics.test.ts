import { describe, expect, it } from "vitest";
import { BACKEND_TASK_CONTRACT_FIELDS } from "./testFixtures";

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
        capabilities: ["getDesktopRuntimeInfo"],
        backend: {
          status: "external",
          host: "127.0.0.1",
          port: 8800,
          api_base_url: "http://127.0.0.1:8800/api/v1",
          ws_base_url: "ws://127.0.0.1:8800/api/v1",
          health_url: "http://127.0.0.1:8800/health",
        },
      }),
    ).toEqual({
      contract_version: 1,
      bridge_version: "1.2.3",
      capabilities: ["getDesktopRuntimeInfo"],
      backend: {
        status: "external",
        host: "127.0.0.1",
        port: 8800,
        api_base_url: "http://127.0.0.1:8800/api/v1",
        ws_base_url: "ws://127.0.0.1:8800/api/v1",
        health_url: "http://127.0.0.1:8800/health",
      },
    });
  });

  it("creates a task diagnostic snapshot", () => {
    expect(
      createTaskDiagnostic(
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-1",
          type: "translate",
          primary_operation: "translate",
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
              language: "SimplifiedChinese",
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
          artifacts: [
            {
              kind: "subtitle",
              role: "context",
              ref: {
                path: "E:/canonical/demo.srt",
                name: "demo.srt",
              },
            },
            {
              kind: "subtitle",
              role: "output",
              ref: {
                path: "E:/canonical/demo.zh.srt",
                name: "demo.zh.srt",
              },
            },
          ],
          created_at: 1,
        },
        {
          taskSubmission: 1,
        },
      ),
    ).toEqual({
      task_source: "backend",
      primary_operation: "translate",
      lifecycle: "resumable",
      task_contract_version: 1,
      persistence_scope: "runtime",
      queue_state: "running",
      queue_position: null,
      type: "translate",
      status: "running",
      params_keys: ["context_path", "mode", "context_ref", "subtitle_ref"],
      result_meta: {
        language: "SimplifiedChinese",
        subtitle_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
        output_ref: {
          path: "E:/canonical/demo.zh.srt",
          name: "demo.zh.srt",
        },
      },
      artifacts: [
        {
          kind: "subtitle",
          role: "context",
          ref: {
            path: "E:/canonical/demo.srt",
            name: "demo.srt",
          },
        },
        {
          kind: "subtitle",
          role: "output",
          ref: {
            path: "E:/canonical/demo.zh.srt",
            name: "demo.zh.srt",
          },
        },
      ],
      runtime_execution_summary: {
        taskSubmission: 1,
      },
    });
  });

  it("keeps stale result mirrors only in raw result_meta", () => {
    expect(
      createTaskDiagnostic(
        {
          ...BACKEND_TASK_CONTRACT_FIELDS,
          id: "task-raw-meta-srt",
          type: "translate",
          status: "completed",
          progress: 100,
          task_contract_version: 2,
          request_params: {},
          result: {
            meta: {
              srt_path: "E:/stale/output.srt",
            },
          },
          created_at: 1,
        },
        {
          taskSubmission: 1,
        },
      ),
    ).toMatchObject({
      result_meta: {
        srt_path: "E:/stale/output.srt",
      },
    });
  });
});
