import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  editorService,
  isAiTranslationSetupRequiredError,
} from "../../services/domain";
import { restoreStoredAsrExecutionPreferences } from "../../services/persistence/asrExecutionPreferences";
import { restoreStoredTranslationPreferences } from "../../services/persistence/translationPreferences";
import { createOpenSubtitleFolderMenuItem } from "../../components/ui/subtitleFileContextMenuItems";
import type { MediaReference } from "../../services/ui/mediaReference";
import { formatSRTTime } from "../../utils/subtitleParser";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import type { SubtitleSegment } from "../../types/task";
import type { TranscribeSegmentResponse } from "../../types/api";
import { toast } from "../../utils/toast";

type ContextMenuEvent = MouseEvent | React.MouseEvent;

type SegmentTranscriptionPayload = {
  segments?: Array<Pick<SubtitleSegment, "start" | "end" | "text">>;
  text?: string;
};

interface ContextMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  targetId?: string;
}

interface UseContextMenuBuilderArgs {
  regions: SubtitleSegment[];
  selectedIds: string[];
  video: MediaReference | null;
  subtitle: MediaReference | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  selectSegment: (id: string, multi?: boolean, range?: boolean) => void;
  addSegment: (seg: SubtitleSegment) => void;
  addSegments: (segs: SubtitleSegment[]) => void;
  updateSegments: (
    updates: Array<Pick<SubtitleSegment, "id"> & Partial<SubtitleSegment>>,
  ) => void;
  mergeSegments: (ids: string[]) => void;
  splitSegment: (time: number, id?: string) => void;
  deleteSegments: (ids: string[]) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

// ─── Hook ───────────────────────────────────────────────────────
export function useContextMenuBuilder({
  regions,
  selectedIds,
  video,
  subtitle,
  videoRef,
  selectSegment,
  addSegment,
  addSegments,
  updateSegments,
  mergeSegments,
  splitSegment,
  deleteSegments,
  setContextMenu,
}: UseContextMenuBuilderArgs) {
  const { t } = useTranslation("editor");
  // Use ref to avoid re-creating callbacks when regions change
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const videoReferenceRef = useRef(video);
  videoReferenceRef.current = video;
  const subtitleReferenceRef = useRef(subtitle);
  subtitleReferenceRef.current = subtitle;

  const buildSegmentsFromTranscription = useCallback(
    (
      payload: SegmentTranscriptionPayload,
      fallbackRegion: { start: number; end: number },
    ): SubtitleSegment[] => {
      if (payload.segments && payload.segments.length > 0) {
        return payload.segments.map((seg, idx) => ({
          id: String(Date.now() + idx),
          start: seg.start,
          end: seg.end,
          text: String(seg.text || "").trim(),
        }));
      }

      return [
        {
          id: String(Date.now()),
          start: fallbackRegion.start,
          end: fallbackRegion.end,
          text: (payload.text || "").trim() || t("contextMenu.noSpeechFallback"),
        },
      ];
    },
    [t],
  );

  const translateSegmentsWithSharedTargetLanguage = useCallback(
    async (segments: SubtitleSegment[]) => {
      const { targetLanguage, mode } = restoreStoredTranslationPreferences();

      try {
        const res = await editorService.translateSegments({
          segments,
          target_language: targetLanguage,
          mode,
        });
        return {
          segments: res.segments as SubtitleSegment[],
          targetLanguage,
        };
      } catch (err) {
        console.error(err);
        if (isAiTranslationSetupRequiredError(err)) {
          return {
            segments: null,
            targetLanguage,
            aborted: true,
          };
        }
        throw err;
      }
    },
    [],
  );

  const transcribeRegion = useCallback(
    async (region: { start: number; end: number }, translateAfterTranscribe: boolean) => {
      const currentMediaRef = videoReferenceRef.current;

      if (!currentMediaRef) {
        toast.warning(t("contextMenu.mediaRequired"));
        return;
      }

      toast.info(
        translateAfterTranscribe
          ? t("contextMenu.transcribeTranslateStarting")
          : t("contextMenu.transcribeStarting"),
        2000,
      );

      try {
        const asrPreferences = restoreStoredAsrExecutionPreferences();
        const res = (await editorService.transcribeSegment({
          audio_ref: currentMediaRef,
          start: region.start,
          end: region.end,
          engine: asrPreferences.engine,
          model: asrPreferences.model,
          device: asrPreferences.device,
        })) as TranscribeSegmentResponse;

        if (res.status !== "completed" || !res.data) {
          throw new Error(t("contextMenu.noSyncTranscription"));
        }

        const recognizedSegments = buildSegmentsFromTranscription(res.data, region);
        let finalSegments = recognizedSegments;

        if (translateAfterTranscribe) {
          const translated = await translateSegmentsWithSharedTargetLanguage(
            recognizedSegments,
          );
          if (translated.segments) {
            finalSegments = translated.segments;
            addSegments(finalSegments);
            toast.success(t("contextMenu.transcribeTranslateComplete", {
              language: translated.targetLanguage,
            }));
            return;
          }

          if (translated.aborted) {
            return;
          }

          addSegments(finalSegments);
          toast.success(t("contextMenu.translateQueued"));
          return;
        }

        addSegments(finalSegments);
        toast.success(
          finalSegments.length > 1
            ? t("contextMenu.transcribeMultipleSuccess", { count: finalSegments.length })
            : t("contextMenu.transcribeSuccess"),
        );
      } catch (err) {
        console.error(err);
        toast.error(t("contextMenu.transcribeFailed", {
          detail: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [addSegments, buildSegmentsFromTranscription, t, translateSegmentsWithSharedTargetLanguage],
  );

  const handleContextMenu = useCallback(
    (e: ContextMenuEvent, id: string, regionData?: { start: number; end: number }) => {
      const currentSelectedIds = selectedIdsRef.current;
      const existing = regionsRef.current.find((r) => String(r.id) === id);

      // ── Temporary region (drawn on waveform but not yet a segment) ──
      if (!existing && regionData) {
        setContextMenu({
          position: { x: e.clientX, y: e.clientY },
          targetId: id,
          items: [
            {
              label: t("contextMenu.insertBlank"),
              onClick: () => {
                const newId = String(Date.now());
                addSegment({
                  id: newId,
                  start: regionData.start,
                  end: regionData.end,
                  text: "",
                });
                setTimeout(() => selectSegment(newId, false, false), 50);
              },
            },
            {
              label: t("contextMenu.transcribeSelection"),
              onClick: async () => transcribeRegion(regionData, false),
            },
            {
              label: t("contextMenu.transcribeTranslateSelection"),
              onClick: async () => transcribeRegion(regionData, true),
            },
            { separator: true, label: "", onClick: () => {} },
            { label: t("contextMenu.cancel"), onClick: () => {} },
          ],
        });
        return;
      }

      // ── Existing segment context menu ───────────────────────────
      if (!currentSelectedIds.includes(id)) {
        selectSegment(id, false, false);
      }

      const targetSelectedIds = currentSelectedIds.includes(id) ? currentSelectedIds : [id];

      // Check continuity for merge
      const indices = targetSelectedIds
        .map((sid) => regionsRef.current.findIndex((r) => r.id === sid))
        .sort((a, b) => a - b);
      let isContinuous = targetSelectedIds.length >= 2;
      for (let i = 0; i < indices.length - 1; i++) {
        if (indices[i + 1] !== indices[i] + 1) isContinuous = false;
      }

      const subtitlePath = subtitleReferenceRef.current?.path;

      const menu: ContextMenuItem[] = [
        {
          label: t("contextMenu.playSegment"),
          onClick: () => {
            const seg = regionsRef.current.find((r) => r.id === id);
            if (seg && videoRef.current) {
              videoRef.current.currentTime = seg.start;
              videoRef.current.play();
            }
          },
        },
        {
          label: t("contextMenu.translateSelection"),
          onClick: async () => {
            const selected = regionsRef.current.filter((r) =>
              targetSelectedIds.includes(String(r.id)),
            );
            if (selected.length === 0) return;

            toast.info(t("contextMenu.translating"), 2000);

            try {
              const translated = await translateSegmentsWithSharedTargetLanguage(selected);
              if (translated.segments) {
                updateSegments(translated.segments);
                toast.success(t("contextMenu.translationComplete"));
              }
            } catch (error) {
              toast.error(t("contextMenu.translationFailed", {
                detail: error instanceof Error ? error.message : String(error),
              }));
            }
          },
        },
        { separator: true, label: "", onClick: () => {} },
        {
          label: t("contextMenu.copySelection"),
          onClick: async () => {
            const selected = regionsRef.current.filter((r) =>
              targetSelectedIds.includes(String(r.id)),
            );
            if (selected.length === 0) return;
            const srtBlock = selected
              .map(
                (seg, idx) =>
                  `${idx + 1}\n${formatSRTTime(seg.start)} --> ${formatSRTTime(seg.end)}\n${seg.text}`,
              )
              .join("\n\n");

            try {
              await navigator.clipboard.writeText(srtBlock);
              toast.success(t("contextMenu.copied", { count: selected.length }));
            } catch (error) {
              console.error("Copy failed", error);
              toast.error(t("contextMenu.copyFailed"));
            }
          },
        },
        {
          label: t("contextMenu.pasteReplace"),
          onClick: async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (!text.trim()) {
                toast.error(t("contextMenu.clipboardEmpty"));
                return;
              }

              const { parseSRT } = await import("../../utils/subtitleParser");
              const parsed = parseSRT(text);

              let newTexts: string[];
              if (parsed.length > 0) {
                newTexts = parsed.map((p) => p.text);
              } else {
                newTexts = text
                  .split("\n")
                  .map((l) => l.trim())
                  .filter((l) => l);
              }

              const ids = targetSelectedIds.map(String);
              const count = Math.min(newTexts.length, ids.length);
              if (count === 0) {
                toast.error(t("contextMenu.clipboardInvalid"));
                return;
              }

              const updates = Array.from({ length: count }, (_, i) => ({
                id: ids[i],
                text: newTexts[i],
              }));
              updateSegments(updates);
              toast.success(t("contextMenu.replaced", { count }));
            } catch (err) {
              console.error("Paste failed", err);
              toast.error(t("contextMenu.clipboardReadFailed", {
                detail: err instanceof Error ? err.message : String(err),
              }));
            }
          },
        },
        createOpenSubtitleFolderMenuItem({
          label: t("contextMenu.openSubtitleFolder"),
          subtitlePath,
          onError: async (err) => {
            console.error("Failed to show subtitle in explorer", err);
            toast.error(t("contextMenu.openSubtitleFolderFailed", {
              detail: err instanceof Error ? err.message : String(err),
            }));
          },
        }),
        { separator: true, label: "", onClick: () => {} },
      ];

      if (isContinuous) {
        menu.push({
          label: t("contextMenu.mergeSegments", { count: targetSelectedIds.length }),
          onClick: () => mergeSegments(targetSelectedIds),
        });
      }

      menu.push({
        label: t("contextMenu.split"),
        onClick: () => {
          if (videoRef.current) splitSegment(videoRef.current.currentTime, id);
        },
      });

      menu.push({ separator: true, label: "", onClick: () => {} });

      menu.push({
        label: t("contextMenu.delete"),
        danger: true,
        onClick: () => {
          deleteSegments(targetSelectedIds);
        },
      });

      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetId: id,
        items: menu,
      });
    },
    [
      selectSegment,
      mergeSegments,
      splitSegment,
      deleteSegments,
      addSegment,
      updateSegments,
      setContextMenu,
      t,
      transcribeRegion,
      translateSegmentsWithSharedTargetLanguage,
      videoRef,
    ],
  );

  return { handleContextMenu };
}
