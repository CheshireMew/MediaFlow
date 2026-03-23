import { describe, expect, it } from "vitest";

import { resolvePathFromDirectoryEntries } from "../services/filesystem/pathRepair";

describe("pathRepair", () => {
  it("resolves an existing canonical file when only a mojibake path is available", () => {
    expect(
      resolvePathFromDirectoryEntries(
        "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
        [
          "Patient Investor - “AI Won’t Replace Software!.mp4",
          "other.mp4",
        ],
      ),
    ).toBe("E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4");
  });

  it("prefers the explicit fallback filename when it exists", () => {
    expect(
      resolvePathFromDirectoryEntries(
        "E:/workspace/Patient Investor - 鈥淎I Won鈥檛 Replace Software!.mp4",
        [
          "Patient Investor - “AI Won’t Replace Software!.mp4",
        ],
        "Patient Investor - “AI Won’t Replace Software!.mp4",
      ),
    ).toBe("E:/workspace/Patient Investor - “AI Won’t Replace Software!.mp4");
  });
});
