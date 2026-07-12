import { describe, expect, it } from "vitest";

import { getExecutionModeDisplay } from "../services/ui/executionModeDisplay";

describe("executionModeDisplay", () => {
  it("returns a consistent display model for task submissions", () => {
    expect(getExecutionModeDisplay("task_submission")).toEqual({
      labelKey: "executionMode.taskSubmission",
      className: "border-indigo-500/20 bg-indigo-500/10 text-indigo-300",
    });
  });
});
