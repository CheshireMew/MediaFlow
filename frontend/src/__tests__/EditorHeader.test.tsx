/* @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditorHeader } from "../components/editor/EditorHeader";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function renderHeader(canExport: boolean, onExport = vi.fn()) {
  render(
    <EditorHeader
      mode="subtitles"
      onModeChange={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenSubtitle={vi.fn()}
      onSave={vi.fn()}
      onSaveAs={vi.fn()}
      onExport={onExport}
      onTranslate={vi.fn()}
      onDetectHighlights={vi.fn()}
      canExport={canExport}
    />,
  );
  return onExport;
}

describe("EditorHeader export entry", () => {
  it("does not open an empty export panel without a video", () => {
    const onExport = renderHeader(false);
    const exportButton = screen.getByText("header.exportButton").closest("button");

    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAttribute("title", "header.exportRequiresVideoTooltip");
    if (exportButton) fireEvent.click(exportButton);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("enables video export when a source is loaded", () => {
    const onExport = renderHeader(true);
    const exportButton = screen.getByText("header.exportButton").closest("button");

    expect(exportButton).toBeEnabled();
    if (exportButton) fireEvent.click(exportButton);
    expect(onExport).toHaveBeenCalledOnce();
  });
});
