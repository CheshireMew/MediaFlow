import type { AnalyzeResult } from "../../api/client";
import type { DownloadExtraInfo, DownloadQueueItem } from "../../services/domain";

export function downloadExtraInfoFromAnalysis(analysis: AnalyzeResult): DownloadExtraInfo {
  const extraInfo: DownloadExtraInfo = { ...(analysis.extra_info ?? {}) };
  if (analysis.direct_src) extraInfo.direct_src = analysis.direct_src;
  if (analysis.title) extraInfo.title = analysis.title;
  if (analysis.media_kind) extraInfo.media_kind = analysis.media_kind;
  if (analysis.suggested_filename) extraInfo.suggested_filename = analysis.suggested_filename;
  return extraInfo;
}

export function looksLikeXiaoyuzhouEpisode(url: string): boolean {
  return /^https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/episode\/[0-9a-f]{24}\/?(?:[?#].*)?$/i.test(
    url.trim(),
  );
}

function toQueueItem(item: NonNullable<AnalyzeResult["items"]>[number]): DownloadQueueItem {
  return { url: item.url, title: item.title, index: item.index };
}

export function resolvePlaylistItems(
  playlist: AnalyzeResult,
  mode: "current" | "all" | "selected",
  selectedIndexes: readonly number[],
  sourceUrl: string,
): DownloadQueueItem[] | null {
  const items = playlist.items;
  if (!items) return [];
  if (mode === "all") return items.map(toQueueItem);
  if (mode === "selected") {
    return selectedIndexes
      .map((index) => items[index])
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(toQueueItem);
  }

  if (selectedIndexes.length === 1) {
    const selected = items[selectedIndexes[0]];
    return selected ? [toQueueItem(selected)] : null;
  }
  const matched = items.find(
    (item) => item.url === sourceUrl || sourceUrl.includes(item.url) || item.url.includes(sourceUrl),
  );
  return matched ? [toQueueItem(matched)] : null;
}

export function canResolveCurrentPlaylistItem(
  playlist: AnalyzeResult | null,
  selectedIndexes: readonly number[],
  sourceUrl: string,
) {
  if (selectedIndexes.length === 1) return Boolean(playlist?.items?.[selectedIndexes[0]]);
  return Boolean(playlist?.items?.some(
    (item) => item.url === sourceUrl || sourceUrl.includes(item.url) || item.url.includes(sourceUrl),
  ));
}
