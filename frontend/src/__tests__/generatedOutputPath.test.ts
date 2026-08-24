import { describe, expect, it } from "vitest";

import outputPathContract from "../../../contracts/generated-output-path-contract.json";
import { buildSuffixedOutputPath } from "../services/ui/generatedOutputPath";

describe("generated output path contract", () => {
  it("matches every shared backend and renderer case", () => {
    expect(outputPathContract.hash_algorithm).toBe("sha1-utf8");
    for (const testCase of outputPathContract.cases) {
      expect(
        buildSuffixedOutputPath(
          testCase.source_path,
          testCase.suffix,
          testCase.extension,
        ).replaceAll("\\", "/"),
        testCase.id,
      ).toBe(testCase.expected_path);
    }
  });
});
