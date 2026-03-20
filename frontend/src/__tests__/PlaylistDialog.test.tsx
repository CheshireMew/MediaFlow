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
});
