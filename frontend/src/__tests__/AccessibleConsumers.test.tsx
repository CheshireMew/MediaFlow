/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../components/layout/Sidebar";
import { AudioFileUploader } from "../components/transcriber/AudioFileUploader";
import { Sidebar as GlossarySidebar } from "../components/translator/Sidebar";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => cleanup());

describe("Sidebar", () => {
  it("uses native navigation buttons and marks the current page", () => {
    render(
      <MemoryRouter initialEntries={["/downloader"]}>
        <Sidebar />
      </MemoryRouter>,
    );

    const download = screen.getByRole("button", { name: "download" });
    expect(download).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "editor" }));
    expect(screen.getByRole("button", { name: "editor" })).toHaveAttribute("aria-current", "page");
  });
});

describe("AudioFileUploader", () => {
  it("opens the picker from the keyboard and preserves drop handling", () => {
    const onFileSelect = vi.fn();
    const onFileDrop = vi.fn();
    render(
      <AudioFileUploader
        file={null}
        onFileSelect={onFileSelect}
        onFileDrop={onFileDrop}
      />,
    );

    const uploader = screen.getByRole("button", { name: "uploader.dragText" });
    fireEvent.keyDown(uploader, { key: "Enter" });
    fireEvent.drop(uploader, { dataTransfer: { files: [] } });
    expect(onFileSelect).toHaveBeenCalledOnce();
    expect(onFileDrop).toHaveBeenCalledOnce();
  });
});

describe("GlossarySidebar", () => {
  it("names the complementary panel and keeps row actions keyboard-visible", () => {
    const onDeleteTerm = vi.fn().mockResolvedValue(undefined);
    render(
      <GlossarySidebar
        isOpen
        onClose={vi.fn()}
        glossary={[{ id: "one", source: "source", target: "target" }]}
        onAddTerm={vi.fn().mockResolvedValue(undefined)}
        onDeleteTerm={onDeleteTerm}
      />,
    );

    expect(screen.getByRole("complementary", { name: /glossary\.panelTitle/ })).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: "glossary.deleteTerm" });
    fireEvent.click(deleteButton);
    expect(onDeleteTerm).toHaveBeenCalledWith("one");
  });
});
