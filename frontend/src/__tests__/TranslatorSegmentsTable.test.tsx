import React from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SegmentsTable } from "../components/translator/SegmentsTable";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const tableStrings: Record<string, string> = {
        "table.noSourceSegment": "智能分割生成的新增目标段",
        "table.generatedSegment": "新增段",
        "table.targetLabel": "目标",
      };
      return tableStrings[key] ?? fallback ?? key;
    },
  }),
}));

vi.mock("../components/translator/FileUploader", () => ({
  FileUploader: ({ onFileSelect }: { onFileSelect: (path: string) => void }) => (
    <button onClick={() => onFileSelect("demo.srt")}>upload</button>
  ),
}));

describe("Translator SegmentsTable", () => {
  test("renders intelligent-mode extra target segments even when source has fewer rows", () => {
    render(
      <SegmentsTable
        sourceSegments={[
          { id: "1", start: 0, end: 1, text: "A" },
        ]}
        targetSegments={[
          { id: "1", start: 0, end: 0.5, text: "甲" },
          { id: "2", start: 0.5, end: 1, text: "乙" },
        ]}
        onUpdateTarget={() => {}}
        onFileSelect={() => {}}
      />,
    );

    expect(screen.getByDisplayValue("甲")).toBeInTheDocument();
    expect(screen.getByDisplayValue("乙")).toBeInTheDocument();
    expect(screen.getByText("智能分割生成的新增目标段")).toBeInTheDocument();
  });
});
