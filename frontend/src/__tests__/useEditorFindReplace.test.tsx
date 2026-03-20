/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  getSelectedTextForFindReplace,
  useEditorFindReplace,
} from "../hooks/editor/useEditorFindReplace";

describe("useEditorFindReplace", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  it("prefills search text from the current input selection when opening", () => {
    const input = document.createElement("input");
    input.type = "text";
    input.value = "find this text";
    document.body.appendChild(input);
    input.focus();
    input.setSelectionRange(5, 9);

    const { result } = renderHook(() => useEditorFindReplace());

    act(() => {
      result.current.handleToggleFindReplace("replace");
    });

    expect(result.current.showFindReplace).toEqual({
      isOpen: true,
      mode: "replace",
    });
    expect(result.current.searchTerm).toBe("this");
  });

  it("resets search state when closing", () => {
    const { result } = renderHook(() => useEditorFindReplace());

    act(() => {
      result.current.setSearchTerm("keyword");
      result.current.setMatchCase(true);
      result.current.handleToggleFindReplace("find");
    });

    act(() => {
      result.current.handleCloseFindReplace();
    });

    expect(result.current.showFindReplace.isOpen).toBe(false);
    expect(result.current.searchTerm).toBe("");
    expect(result.current.matchCase).toBe(false);
  });
});

describe("getSelectedTextForFindReplace", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
  });

  it("returns selected text from standard DOM selection", () => {
    const container = document.createElement("div");
    container.textContent = "editor selected text";
    document.body.appendChild(container);

    const range = document.createRange();
    range.setStart(container.firstChild!, 7);
    range.setEnd(container.firstChild!, 15);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    expect(getSelectedTextForFindReplace()).toBe("selected");
  });
});
