import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlaylistDialog } from "../components/downloader/PlaylistDialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      key === "playlist.containsVideos"
        ? `contains ${options?.count ?? 0} videos`
        : key,
  }),
}));

describe("PlaylistDialog", () => {
  const playlistInfo = {
    type: "playlist" as const,
    title: "Sample Playlist",
    url: "https://example.com/playlist",
    count: 2,
    items: [
      { index: 1, title: "First", url: "https://example.com/1" },
      { index: 2, title: "Second", url: "https://example.com/2" },
    ],
  };

  it("disables current-download button when current item cannot be determined", () => {
    render(
      <PlaylistDialog
        playlistInfo={playlistInfo}
        selectedItems={[]}
        canDownloadCurrent={false}
        onClose={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onDownloadSelected={vi.fn()}
        onToggleItem={vi.fn()}
      />,
    );

    expect(screen.getByText("playlist.downloadThisOnly")).toBeDisabled();
  });

  it("calls download current when the button is enabled", () => {
    const onDownloadCurrent = vi.fn();

    render(
      <PlaylistDialog
        playlistInfo={playlistInfo}
        selectedItems={[0]}
        canDownloadCurrent
        onClose={vi.fn()}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onDownloadCurrent={onDownloadCurrent}
        onDownloadSelected={vi.fn()}
        onToggleItem={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("playlist.downloadThisOnly"));
    expect(onDownloadCurrent).toHaveBeenCalledTimes(1);
  });

  it("exposes modal and playlist selection semantics", () => {
    const onToggleItem = vi.fn();
    const onClose = vi.fn();
    render(
      <PlaylistDialog
        playlistInfo={playlistInfo}
        selectedItems={[0]}
        canDownloadCurrent
        onClose={onClose}
        onSelectAll={vi.fn()}
        onClearSelection={vi.fn()}
        onDownloadCurrent={vi.fn()}
        onDownloadSelected={vi.fn()}
        onToggleItem={onToggleItem}
      />,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    const firstItem = screen.getByRole("checkbox", { name: /First/ });
    expect(firstItem).toHaveAttribute("aria-checked", "true");
    fireEvent.click(firstItem);
    expect(onToggleItem).toHaveBeenCalledWith(0);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
