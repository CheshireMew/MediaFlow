import { describe, expect, it } from "vitest";

import {
  applyWorkspaceJournal,
  parseWorkspaceWrite,
} from "../../electron/ipc/workspace-state-handlers";

function journalRecord(revision: number, value: unknown) {
  return JSON.stringify({
    format: "mediaflow-workspace-patch-v1",
    sessionId: "renderer-session",
    revision,
    operations: [{ op: "set", path: ["editor", "value"], value }],
  });
}

describe("workspace state main-process persistence policy", () => {
  it("rejects unsafe patch paths before they reach object mutation", () => {
    expect(() =>
      parseWorkspaceWrite(JSON.stringify({
        format: "mediaflow-workspace-patch-v1",
        operations: [{ op: "set", path: ["__proto__", "polluted"], value: true }],
      })),
    ).toThrow("unsafe path");
  });

  it("recovers a complete journal prefix when only the final record is truncated", () => {
    const state = applyWorkspaceJournal(
      {},
      `${journalRecord(1, "saved")}\n{"format":"mediaflow-workspace-patch-v1"`,
    );

    expect(state).toEqual({ editor: { value: "saved" } });
  });

  it("rejects corruption before the final journal record", () => {
    expect(() =>
      applyWorkspaceJournal(
        {},
        `${journalRecord(1, "saved")}\n{broken}\n${journalRecord(2, "newer")}\n`,
      ),
    ).toThrow("corrupt at record 2");
  });

  it("rejects repeated or regressing revisions in one session", () => {
    expect(() =>
      applyWorkspaceJournal(
        {},
        `${journalRecord(2, "saved")}\n${journalRecord(2, "duplicate")}\n`,
      ),
    ).toThrow("invalid revision");
  });
});
