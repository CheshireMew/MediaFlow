/* @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../components/ui/ContextMenu";
import { Dialog } from "../components/ui/Dialog";
import { DropZone } from "../components/ui/DropZone";
import { Select } from "../components/ui/Select";
import { ToastContainer } from "../components/ui/ToastContainer";
import { toast } from "../utils/toast";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe("shared interaction a11y smoke", () => {
  it("exposes names, states, and landmark semantics for shared controls", () => {
    render(
      <>
        <Dialog open onClose={vi.fn()} ariaLabel="Export settings">
          <Select
            ariaLabel="Output quality"
            value="high"
            onChange={vi.fn()}
            options={[
              { value: "high", label: "High" },
              { value: "small", label: "Small" },
            ]}
          />
          <DropZone ariaLabel="Choose media" onActivate={vi.fn()} onDrop={vi.fn()}>
            Choose media
          </DropZone>
          <button type="button">Submit</button>
        </Dialog>
        <ContextMenu
          items={[{ label: "Open folder", onClick: vi.fn() }]}
          position={{ x: 8, y: 8 }}
          onClose={vi.fn()}
          ariaLabel="File actions"
        />
        <ToastContainer />
      </>,
    );

    expect(screen.getByRole("dialog", { name: "Export settings" })).toHaveAttribute("aria-modal", "true");
    const select = screen.getByRole("combobox", { name: "Output quality" });
    expect(select).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(select);
    expect(select).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose media" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("menu", { name: "File actions" })).toBeInTheDocument();

    act(() => toast.success("Saved", 10_000));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAccessibleName();
    }
  });
});
