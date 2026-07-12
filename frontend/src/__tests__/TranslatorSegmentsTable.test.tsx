import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SegmentsTable } from "../components/translator/SegmentsTable";
import { installElectronMock } from "./testUtils/electronMock";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const tableStrings: Record<string, string> = {
        "table.noSourceSegment": "智能分割生成的新增目标段",
        "table.generatedSegment": "新增段",
        "table.targetLabel": "目标",
        "contextMenu.openSubtitleFolder": "打开字幕所在文件夹",
        "contextMenu.openSourceSubtitleFolder": "打开源语言字幕所在文件夹",
        "contextMenu.openTargetSubtitleFolder": "打开译文字幕所在文件夹",
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

  test("opens the source subtitle folder from the source column context menu", () => {
    const electronMock = installElectronMock();

    render(
      <SegmentsTable
        sourceSegments={[{ id: "1", start: 0, end: 1, text: "A" }]}
        targetSegments={[]}
        onUpdateTarget={() => {}}
        onFileSelect={() => {}}
        sourceSubtitlePath="E:/subs/demo.srt"
        targetSubtitlePath="E:/subs/demo_ZH-CN.srt"
      />,
    );

    fireEvent.contextMenu(screen.getByText("A"));
    fireEvent.click(screen.getByRole("menuitem", { name: "打开源语言字幕所在文件夹" }));

    expect(electronMock.showInExplorer).toHaveBeenCalledWith("E:/subs/demo.srt");
  });

  test("opens the translated subtitle folder from the target column context menu", () => {
    const electronMock = installElectronMock();

    render(
      <SegmentsTable
        sourceSegments={[{ id: "1", start: 0, end: 1, text: "A" }]}
        targetSegments={[{ id: "1", start: 0, end: 1, text: "甲" }]}
        onUpdateTarget={() => {}}
        onFileSelect={() => {}}
        sourceSubtitlePath="E:/subs/demo.srt"
        targetSubtitlePath="E:/subs/demo_ZH-CN.srt"
      />,
    );

    fireEvent.contextMenu(screen.getByDisplayValue("甲"));
    fireEvent.click(screen.getByRole("menuitem", { name: "打开译文字幕所在文件夹" }));

    expect(electronMock.showInExplorer).toHaveBeenCalledWith("E:/subs/demo_ZH-CN.srt");
  });
});
