import { useCallback, useRef } from "react";
import { API_BASE, apiClient } from "../../api/client";
import { formatSRTTime } from "../../utils/subtitleParser";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";

// ─── Types ──────────────────────────────────────────────────────
type Segment = { id: string; start: number; end: number; text: string };

interface ContextMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  targetId?: string;
}

interface UseContextMenuBuilderArgs {
  regions: Segment[];
  selectedIds: string[];
  currentFilePath: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  selectSegment: (id: string, multi: boolean, range: boolean) => void;
  addSegment: (seg: Segment) => void;
  addSegments: (segs: Segment[]) => void;
  updateSegments: (updates: any[]) => void;
  mergeSegments: (ids: string[]) => void;
  splitSegment: (time: number, id: string) => void;
  deleteSegments: (ids: string[]) => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
}

// ─── Hook ───────────────────────────────────────────────────────
export function useContextMenuBuilder({
  regions,
  selectedIds,
  currentFilePath,
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
  const transcribePollersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const handleContextMenu = useCallback(
    (e: any, id: string, regionData?: { start: number; end: number }) => {
      const existing = regionsRef.current.find((r) => r.id === id);

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
                if (!currentFilePath) {
                  alert("请先保存或打开一个文件");
                  return;
                }
                const { toast } = await import("../../utils/toast");
                toast.info("正在识别片段...", 2000);

                try {
                  const applyTranscriptionResult = (
                    payload: { segments?: any[]; text?: string },
                    fallbackRegion: { start: number; end: number },
                  ) => {
                    const { segments, text } = payload;

                    if (segments && segments.length > 0) {
                      const newSegments = segments.map((seg: any, idx: number) => ({
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

                  const res = await apiClient.transcribeSegment({
                    video_path: "",
                    audio_path: currentFilePath,
                    srt_path: "",
                    watermark_path: null,
                    start: regionData.start,
                    end: regionData.end,
                    options: {},
                  });

                  if (res.status === "completed" && res.data) {
                    applyTranscriptionResult(res.data, regionData);
                  } else {
                    const taskId = res.task_id;
                    if (!taskId) {
                      throw new Error("后台任务已创建，但未返回 task_id");
                    }

                    toast.info(`片段较长，后台处理中... (Task: ${taskId})`, 5000);

                    if (transcribePollersRef.current[taskId]) {
                      clearInterval(transcribePollersRef.current[taskId]);
                    }

                    transcribePollersRef.current[taskId] = setInterval(async () => {
                      try {
                        const statusRes = await fetch(
                          `${API_BASE}/tasks/${taskId}`,
                        ).then((r) => {
                          if (!r.ok) throw new Error("Failed to get task status");
                          return r.json();
                        });

                        if (statusRes.status === "completed") {
                          clearInterval(transcribePollersRef.current[taskId]);
                          delete transcribePollersRef.current[taskId];

                          applyTranscriptionResult(
                            statusRes.result?.meta || statusRes.result || {},
                            regionData,
                          );
                        } else if (statusRes.status === "failed") {
                          clearInterval(transcribePollersRef.current[taskId]);
                          delete transcribePollersRef.current[taskId];
                          toast.error(
                            "长片段识别失败: " +
                              String(statusRes.error || "unknown error"),
                          );
                        }
                      } catch (pollErr) {
                        console.error("ASR task polling failed:", pollErr);
                      }
                    }, 1000);
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
      if (!selectedIds.includes(id)) {
        selectSegment(id, false, false);
      }

      const targetSelectedIds = selectedIds.includes(id) ? selectedIds : [id];

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
              const res = await apiClient.translateSegments({
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
          if (confirm(`确定删除这 ${targetSelectedIds.length} 项吗?`)) {
            deleteSegments(targetSelectedIds);
          }
        },
      });

      setContextMenu({
        position: { x: e.clientX, y: e.clientY },
        targetId: id,
        items: menu,
      });
    },
    [
      selectedIds,
      selectSegment,
      mergeSegments,
      splitSegment,
      deleteSegments,
      addSegment,
      addSegments,
      updateSegments,
      currentFilePath,
      setContextMenu,
      videoRef,
    ],
  );

  return { handleContextMenu };
}
