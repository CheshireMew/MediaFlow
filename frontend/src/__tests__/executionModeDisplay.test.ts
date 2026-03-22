import { describe, expect, it } from "vitest";

import { getExecutionModeDisplay } from "../services/ui/executionModeDisplay";

describe("executionModeDisplay", () => {
  it("returns a consistent display model for task submissions", () => {
    expect(getExecutionModeDisplay("task_submission")).toEqual({
      label: "task_submission",
      className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    });
  });

  it("returns a consistent display model for direct results", () => {
    expect(getExecutionModeDisplay("direct_result")).toEqual({
      label: "direct_result",
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    });
  });
});
