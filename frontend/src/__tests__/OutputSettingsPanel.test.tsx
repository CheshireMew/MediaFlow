/* @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OutputSettingsPanel } from "../components/dialogs/synthesis/components/OutputSettingsPanel";
import type { OutputSettingsState } from "../components/dialogs/synthesis/hooks/useOutputSettings";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

function outputState(): OutputSettingsState {
  return {
    quality: "balanced",
    setQuality: vi.fn(),
    isQualityMenuOpen: false,
    setIsQualityMenuOpen: vi.fn(),
    useGpu: true,
    setUseGpu: vi.fn(),
    outputFilename: "demo_synthesized.mp4",
    setOutputFilename: vi.fn(),
    outputDir: "D:/media/demo_clips",
    setOutputDir: vi.fn(),
    handleSelectOutputFolder: vi.fn(),
    trimStart: 0,
    setTrimStart: vi.fn(),
    trimEnd: 0,
    setTrimEnd: vi.fn(),
    targetResolution: "original",
    setTargetResolution: vi.fn(),
  };
}

describe("OutputSettingsPanel batch mode", () => {
  it("replaces the single filename field with the real batch naming summary", () => {
    render(<OutputSettingsPanel output={outputState()} batchMode batchCount={3} />);

    expect(screen.getByText("output.batchFiles:3")).toBeInTheDocument();
    expect(screen.getByText("output.batchNaming")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("demo_synthesized.mp4")).toBeNull();
    expect(screen.queryByText("output.sr2x")).toBeNull();
  });
});
