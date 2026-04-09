/* @vitest-environment jsdom */
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextMenu } from "../components/ui/ContextMenu";

describe("ContextMenu", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not close on Escape while IME composition is active in an input", () => {
    const onClose = vi.fn();
    render(
      <div>
        <input aria-label="search" />
        <ContextMenu
          items={[{ label: "Delete", onClick: vi.fn() }]}
          position={{ x: 10, y: 10 }}
          onClose={onClose}
        />
      </div>,
    );

    const input = document.querySelector("input");
    expect(input).not.toBeNull();
    input?.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    });
    Object.defineProperty(event, "isComposing", {
      value: true,
      configurable: true,
    });

    document.dispatchEvent(event);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on Escape when the keyboard target is not editable", () => {
    const onClose = vi.fn();
    render(
      <ContextMenu
        items={[{ label: "Delete", onClick: vi.fn() }]}
        position={{ x: 10, y: 10 }}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
