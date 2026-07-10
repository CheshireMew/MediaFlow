/* @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ClipCandidateList } from "../components/editor/ClipCandidateList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

const candidate = {
  id: "clip-1",
  start: 1,
  end: 4,
  title: "Opening",
  reason: "Strong hook",
  score: 90,
  selected: true,
};

function renderList(overrides: Partial<React.ComponentProps<typeof ClipCandidateList>> = {}) {
  const props: React.ComponentProps<typeof ClipCandidateList> = {
    candidates: [candidate],
    activeClipId: candidate.id,
    isDetecting: false,
    isExporting: false,
    canDetect: true,
    canCreate: true,
    onDetect: vi.fn(),
    onCreateClip: vi.fn(),
    onConfigureExport: vi.fn(),
    onQuickExport: vi.fn(),
    onClipClick: vi.fn(),
    onToggleSelected: vi.fn(),
    onDeleteClip: vi.fn(),
    ...overrides,
  };
  return { ...render(<ClipCandidateList {...props} />), props };
}

describe("ClipCandidateList export UX", () => {
  it("exposes manual clip creation as a visible toolbar action", () => {
    const { props } = renderList();

    fireEvent.click(screen.getByText("clips.createButton"));

    expect(props.onCreateClip).toHaveBeenCalledOnce();
  });

  it("exposes separate, labelled configure and quick export actions", () => {
    const { props } = renderList();

    fireEvent.click(screen.getByText("clips.configureExportButton:1"));
    fireEvent.click(screen.getByText("clips.quickExportButton"));

    expect(props.onConfigureExport).toHaveBeenCalledOnce();
    expect(props.onQuickExport).toHaveBeenCalledOnce();
  });

  it("disables both export paths when no clip is selected", () => {
    renderList({ candidates: [{ ...candidate, selected: false }] });

    expect(screen.getByText("clips.configureExportButton:0").closest("button")).toBeDisabled();
    expect(screen.getByText("clips.quickExportButton").closest("button")).toBeDisabled();
  });

  it("shows completed output count and opens the actual output folder", () => {
    const onOpenOutput = vi.fn();
    renderList({
      exportTask: {
        status: "completed",
        progress: 100,
        outputCount: 3,
        onOpenOutput,
      },
    });

    expect(screen.getByText("clips.exportCompleted:3")).toBeInTheDocument();
    fireEvent.click(screen.getByText("clips.openOutputFolder"));
    expect(onOpenOutput).toHaveBeenCalledOnce();
  });

  it("treats paused and cancelled tasks as non-spinning states", () => {
    const { container, rerender, props } = renderList({
      exportTask: { status: "paused", progress: 45 },
    });
    expect(screen.getByText("clips.exportPaused")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();

    rerender(
      <ClipCandidateList
        {...props}
        exportTask={{ status: "cancelled", progress: 45 }}
      />,
    );
    expect(screen.getByText("clips.exportCancelled")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });
});
