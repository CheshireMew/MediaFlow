/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ConfirmationProvider } from "../components/ui/ConfirmationProvider";
import { ContextMenu } from "../components/ui/ContextMenu";
import { Dialog } from "../components/ui/Dialog";
import { DropZone } from "../components/ui/DropZone";
import { Select } from "../components/ui/Select";
import { ToastContainer } from "../components/ui/ToastContainer";
import { useConfirmation } from "../components/ui/confirmationContext";
import { toast } from "../utils/toast";
import {
  PERSISTENCE_FAILURE_ALERT_DELAY_MS,
  reportPersistenceFailure,
  resetPersistenceHealthForTests,
} from "../services/persistence/persistenceHealth";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
  resetPersistenceHealthForTests();
  vi.useRealTimers();
});

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <Dialog open={open} onClose={() => setOpen(false)} ariaLabel="Example dialog">
        <button type="button" data-dialog-initial-focus>First</button>
        <button type="button">Last</button>
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("traps focus, closes on Escape, and restores the opener", async () => {
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Example dialog" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    await waitFor(() => expect(first).toHaveFocus());

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });
});

describe("Select", () => {
  it("supports listbox keyboard navigation and selection", () => {
    const onChange = vi.fn();
    render(
      <Select
        ariaLabel="Language"
        value="en"
        onChange={onChange}
        options={[
          { value: "en", label: "English" },
          { value: "zh", label: "Chinese" },
        ]}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "Language" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("zh");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("ContextMenu", () => {
  it("focuses enabled items and supports arrow-key activation", async () => {
    const onClose = vi.fn();
    const onSecond = vi.fn();
    render(
      <ContextMenu
        items={[
          { label: "Unavailable", disabled: true, onClick: vi.fn() },
          { label: "Open", onClick: onSecond },
        ]}
        position={{ x: 10, y: 10 }}
        onClose={onClose}
      />,
    );

    const openItem = screen.getByRole("menuitem", { name: "Open" });
    await waitFor(() => expect(openItem).toHaveFocus());
    expect(screen.getByRole("menu")).toHaveAccessibleName("contextMenu");
    fireEvent.keyDown(openItem, { key: "Home" });
    expect(openItem).toHaveFocus();
    fireEvent.click(openItem);
    expect(onSecond).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("DropZone", () => {
  it("activates from Enter and Space and exposes disabled state", () => {
    const onActivate = vi.fn();
    const onDrop = vi.fn();
    const { rerender } = render(
      <DropZone ariaLabel="Choose media" onActivate={onActivate} onDrop={onDrop}>
        Choose
      </DropZone>,
    );

    const dropZone = screen.getByRole("button", { name: "Choose media" });
    fireEvent.keyDown(dropZone, { key: "Enter" });
    fireEvent.keyDown(dropZone, { key: " " });
    fireEvent.drop(dropZone, { dataTransfer: { files: [] } });
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onDrop).toHaveBeenCalledOnce();

    rerender(
      <DropZone disabled ariaLabel="Choose media" onActivate={onActivate} onDrop={onDrop}>
        Choose
      </DropZone>,
    );
    expect(dropZone).toHaveAttribute("aria-disabled", "true");
    expect(dropZone).toHaveAttribute("tabindex", "-1");
  });
});

function ConfirmationRequester() {
  const confirm = useConfirmation();
  const [result, setResult] = useState("pending");
  return (
    <>
      <button
        type="button"
        onClick={() => void confirm({ title: "Delete task", message: "Delete it?", tone: "danger" })
          .then((confirmed) => setResult(String(confirmed)))}
      >
        Ask
      </button>
      <output>{result}</output>
    </>
  );
}

describe("ConfirmationProvider", () => {
  it("offers one async confirmation entry point for hooks", async () => {
    render(
      <ConfirmationProvider>
        <ConfirmationRequester />
      </ConfirmationProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(screen.getByRole("dialog", { name: "Delete task" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    await waitFor(() => expect(screen.getByText("true")).toBeInTheDocument());
  });
});

describe("ToastContainer", () => {
  it("announces messages and gives icon-only close buttons a name", () => {
    render(<ToastContainer />);
    act(() => toast.info("Saved", 10_000));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("surfaces persistence failures instead of leaving them in console output", () => {
    vi.useFakeTimers();
    render(<ToastContainer />);

    act(() => reportPersistenceFailure("workspace-write", new Error("disk full")));
    act(() => vi.advanceTimersByTime(PERSISTENCE_FAILURE_ALERT_DELAY_MS));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "persistence.workspaceWriteFailed",
    );
    vi.useRealTimers();
  });
});
