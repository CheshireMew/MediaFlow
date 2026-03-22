import { useCallback, useRef } from "react";
import { editorService } from "../../services/domain";
import type { MediaReference } from "../../services/ui/mediaReference";
import { formatSRTTime } from "../../utils/subtitleParser";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import type { SubtitleSegment } from "../../types/task";
import type { TranscribeSegmentResponse } from "../../types/api";

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
  currentFilePath: string | null;
  currentFileRef: MediaReference | null;
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
  currentFilePath,
  currentFileRef,
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
  // Use ref to avoid re-creating callbacks when regions change
  const regionsRef = useRef(regions);
  regionsRef.current = regions;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const currentFilePathRef = useRef(currentFilePath);
  currentFilePathRef.current = currentFilePath;
  const currentFileRefRef = useRef(currentFileRef);
  currentFileRefRef.current = currentFileRef;

  const handleContextMenu = useCallback(
    (e: ContextMenuEvent, id: string, regionData?: { start: number; end: number }) => {
      const currentSelectedIds = selectedIdsRef.current;
      const currentPath = currentFilePathRef.current;
      const currentFile = currentFileRefRef.current;
      const existing = regionsRef.current.find((r) => String(r.id) === id);

      // ── Temporary region (drawn on waveform but not yet a segment) ──
      if (!existing && regionData) {
        setContextMenu({
          position: { x: e.clientX, y: e.clientY },
          targetId: id,
          items: [
            {
              label: "在此处插入空白字幕",
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
              label: "🎙️ 识别选中区域 (ASR)",
              onClick: async () => {
                if (!currentPath && !currentFile?.path) {
                  alert("请先保存或打开一个文件");
                  return;
                }
                const { toast } = await import("../../utils/toast");
                toast.info("正在识别片段...", 2000);

                try {
                  const applyTranscriptionResult = (
                    payload: SegmentTranscriptionPayload,
                    fallbackRegion: { start: number; end: number },
                  ) => {
                    const { segments, text } = payload;

                    if (segments && segments.length > 0) {
                      const newSegments: SubtitleSegment[] = segments.map((seg, idx) => ({
                        id: String(Date.now() + idx),
                        start: seg.start,
                        end: seg.end,
                        text: String(seg.text || "").trim(),
                      }));
                      addSegments(newSegments);
                      toast.success(`成功识别 ${newSegments.length} 个片段`);
                      return;
                    }

                    const newId = String(Date.now());
                    addSegment({
                      id: newId,
                      start: fallbackRegion.start,
                      end: fallbackRegion.end,
                      text: (text || "").trim() || "[无语音]",
                    });
                    setTimeout(() => selectSegment(newId, false, false), 50);
                    toast.success("识别成功");
                  };

                  const res = await editorService.transcribeSegment({
                    audio_path: currentFile ? null : currentPath,
                    audio_ref: currentFile,
                    start: regionData.start,
                    end: regionData.end,
                  }) as TranscribeSegmentResponse;

                  if (res.status === "completed" && res.data) {
                    applyTranscriptionResult(res.data, regionData);
                  } else {
                    throw new Error("片段识别未返回同步结果");
                  }
                } catch (err) {
                  console.error(err);
                  const { toast } = await import("../../utils/toast");
                  toast.error("识别失败: " + String(err));
                }
              },
            },
            { separator: true, label: "", onClick: () => {} },
            { label: "取消", onClick: () => {} },
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

      const menu: ContextMenuItem[] = [
        {
          label: "播放此片段",
          onClick: () => {
            const seg = regionsRef.current.find((r) => r.id === id);
            if (seg && videoRef.current) {
              videoRef.current.currentTime = seg.start;
              videoRef.current.play();
            }
          },
        },
        {
          label: "🌐 翻译选中区域 (LLM)",
          onClick: async () => {
            const selected = regionsRef.current.filter((r) =>
              targetSelectedIds.includes(String(r.id)),
            );
            if (selected.length === 0) return;

            const { toast } = await import("../../utils/toast");
            toast.info("正在翻译...", 2000);

            try {
              const res = await editorService.translateSegments({
                segments: selected,
                target_language: "Chinese",
              });
              if (res.status === "completed" && res.segments) {
                updateSegments(res.segments);
                toast.success("翻译完成");
              } else {
                toast.info(`任务处理中 (Task: ${res.task_id})`, 3000);
              }
            } catch (err) {
              console.error(err);
              const { toast: t } = await import("../../utils/toast");
              t.error("翻译失败 " + String(err));
            }
          },
        },
        { separator: true, label: "", onClick: () => {} },
        {
          label: "📋 复制选中字幕 (SRT)",
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
              const { toast } = await import("../../utils/toast");
              toast.success(`已复制 ${selected.length} 条字幕到剪贴板`);
            } catch {
              alert("复制失败，请检查浏览器权限");
            }
          },
        },
        {
          label: "✂️ 粘贴并替换 (Replace)",
          onClick: async () => {
            const { toast } = await import("../../utils/toast");
            try {
              const text = await navigator.clipboard.readText();
              if (!text.trim()) {
                toast.error("剪贴板为空");
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
                toast.error("无法解析剪贴板内容 或 未选中字幕");
                return;
              }

              const updates = Array.from({ length: count }, (_, i) => ({
                id: ids[i],
                text: newTexts[i],
              }));
              updateSegments(updates);
              toast.success(`已替换 ${count} 条字幕内容`);
            } catch (err) {
              console.error("Paste failed", err);
              toast.error("读取剪贴板失败: " + String(err));
            }
          },
        },
        { separator: true, label: "", onClick: () => {} },
      ];

      if (isContinuous) {
        menu.push({
          label: `合并 ${targetSelectedIds.length} 个片段`,
          onClick: () => mergeSegments(targetSelectedIds),
        });
      }

      menu.push({
        label: "分割",
        onClick: () => {
          if (videoRef.current) splitSegment(videoRef.current.currentTime, id);
        },
      });

      menu.push({ separator: true, label: "", onClick: () => {} });

      menu.push({
        label: "删除",
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
      addSegments,
      updateSegments,
      setContextMenu,
      videoRef,
    ],
  );

  return { handleContextMenu };
}
