import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { FindReplaceDialog } from "../components/dialogs/FindReplaceDialog";
import { SubtitleList } from "../components/editor/SubtitleList";
import type { SubtitleSegment } from "../types/task";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock("lucide-react", () => {
  const makeIcon = (name: string) =>
    ({ ...props }: Record<string, unknown>) => (
      <div data-testid={`icon-${name.toLowerCase()}`} {...props}>
        {name}
      </div>
    );

  return {
    Search: makeIcon("Search"),
    ArrowUp: makeIcon("ArrowUp"),
    ArrowDown: makeIcon("ArrowDown"),
    X: makeIcon("X"),
    Replace: makeIcon("Replace"),
    Trash2: makeIcon("Trash2"),
    Wand2: makeIcon("Wand2"),
  };
});

beforeAll(() => {
  class ResizeObserverMock {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe(target: Element) {
      this.callback(
        [
          {
            target,
            contentRect: {
              width: 320,
              height: 240,
              top: 0,
              left: 0,
              right: 320,
              bottom: 240,
              x: 0,
              y: 0,
              toJSON: () => ({}),
            },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }

    unobserve() {}

    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

const segments: SubtitleSegment[] = [
  { id: "1", start: 0, end: 1, text: "Hello world" },
];

function FindReplaceHarness() {
  const [isOpen, setIsOpen] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState("Hello");
  const [matchCase, setMatchCase] = React.useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setSearchTerm("");
    setMatchCase(false);
  };

  return (
    <div>
      <button onClick={() => setIsOpen(true)}>Reopen</button>
      <SubtitleList
        segments={segments}
        activeSegmentId={null}
        autoScroll={false}
        selectedIds={[]}
        onSegmentClick={() => {}}
        onSegmentDelete={() => {}}
        onSegmentMerge={() => {}}
        onSegmentDoubleClick={() => {}}
        onContextMenu={() => {}}
        searchTerm={searchTerm}
        matchCase={matchCase}
      />
      <FindReplaceDialog
        isOpen={isOpen}
        initialMode="replace"
        onClose={handleClose}
        regions={segments}
        onSelectSegment={() => {}}
        onUpdateSegment={() => {}}
        onUpdateSegments={() => {}}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        matchCase={matchCase}
        setMatchCase={setMatchCase}
      />
    </div>
  );
}

describe("FindReplaceDialog", () => {
  test("closing clears highlight and resets search session state", async () => {
    const { container } = render(<FindReplaceHarness />);

    await waitFor(() => {
      expect(container.querySelectorAll("mark")).toHaveLength(1);
    });

    const replaceInput = screen.getByPlaceholderText("findReplace.replacePlaceholder");
    fireEvent.change(replaceInput, { target: { value: "Changed" } });
    expect(screen.getByDisplayValue("Changed")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close"));

    await waitFor(() => {
      expect(container.querySelectorAll("mark")).toHaveLength(0);
    });

    expect(screen.queryByPlaceholderText("findReplace.findPlaceholder")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Reopen"));

    expect(screen.getByPlaceholderText("findReplace.findPlaceholder")).toHaveValue("");
    expect(screen.getByPlaceholderText("findReplace.replacePlaceholder")).toHaveValue("");
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});
