import { describe, expectTypeOf, it } from "vitest";

import type {
  TaskMetaLegacyPathMirrors,
  TaskRequestLegacyPathMirrors,
} from "../types/task";

describe("task legacy path mirror types", () => {
  it("keeps task-level compatibility path mirrors explicit", () => {
    expectTypeOf<TaskRequestLegacyPathMirrors>().toMatchTypeOf<{
      context_path?: string;
      output_path?: string;
    }>();
    expectTypeOf<TaskMetaLegacyPathMirrors>().toMatchTypeOf<{
      srt_path?: string | null;
    }>();
  });
});
