import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  createTaskFromExecutionOutcome,
  getExecutionSubmission,
  type VideoExportScope,
  type VideoExportSubmission,
} from "../../services/domain";
import { executionService } from "../../services/domain/executionService";
import type { EditorDocument } from "../../stores/editorDocument";
import type { SubtitleSegment } from "../../types/task";
import { toast } from "../../utils/toast";
import { resolveSubtitleReferenceForSavedPath } from "./useEditorActions";
import type { SaveSubtitleFile } from "./useClipExport";

const FULL_VIDEO_EXPORT_SCOPE = {
  kind: "full-video",
} as const satisfies VideoExportScope;

export function useEditorVideoExport({
  clipExportScope,
  video,
  subtitle,
  regions,
  saveSubtitleFile,
  addTask,
  submitClipExport,
  closeClipExport,
}: {
  clipExportScope: VideoExportScope | null;
  video: EditorDocument["video"];
  subtitle: EditorDocument["subtitle"];
  regions: SubtitleSegment[];
  saveSubtitleFile: SaveSubtitleFile;
  addTask: (task: ReturnType<typeof createTaskFromExecutionOutcome>) => void;
  submitClipExport: (
    segments: Extract<VideoExportScope, { kind: "clips" }>["segments"],
    submission: VideoExportSubmission,
  ) => Promise<boolean>;
  closeClipExport: () => void;
}) {
  const { t } = useTranslation("editor");
  const [fullVideoExportOpen, setFullVideoExportOpen] = useState(false);
  const exportScope = clipExportScope ??
    (fullVideoExportOpen ? FULL_VIDEO_EXPORT_SCOPE : null);

  const submitVideoExport = async (
    submission: VideoExportSubmission,
  ): Promise<boolean> => {
    if (!exportScope) return false;
    if (exportScope.kind === "clips") {
      return await submitClipExport(exportScope.segments, submission);
    }
    if (!video) {
      toast.error(t("synthesis.missingFilesError"));
      return false;
    }

    let exportSubtitle: ReturnType<typeof resolveSubtitleReferenceForSavedPath> | null = null;
    if (submission.subtitleEnabled) {
      let savedPath: string | false = false;
      try {
        savedPath = await saveSubtitleFile(regions);
      } catch (error) {
        console.error("[EditorPage] Failed to save subtitles before export", error);
      }
      if (!savedPath) {
        toast.error(t("clips.exportSubtitleError"));
        return false;
      }
      exportSubtitle = resolveSubtitleReferenceForSavedPath({
        video,
        subtitle,
        savedPath,
      });
    }

    try {
      const outcome = await executionService.synthesize({
        video_ref: video,
        srt_ref: exportSubtitle,
        watermark_ref: submission.watermarkRef,
        output_ref: submission.outputRef,
        options: submission.options,
      });
      getExecutionSubmission(outcome);
      addTask(
        createTaskFromExecutionOutcome({
          outcome,
          type: "pipeline",
          name: video.name ? `Export ${video.name}` : "Export video",
          request_params: {
            pipeline_id: "synthesis_tool",
            steps: [{
              step_name: "synthesize",
              params: {
                video_ref: video,
                srt_ref: exportSubtitle,
                watermark_ref: submission.watermarkRef,
                output_ref: submission.outputRef ?? undefined,
                options: submission.options,
              },
            }],
          },
        }),
      );
      return true;
    } catch (error) {
      console.error("[EditorPage] Failed to submit video export", error);
      toast.error(t("synthesis.exportError"));
      return false;
    }
  };

  const closeVideoExport = () => {
    setFullVideoExportOpen(false);
    closeClipExport();
  };

  return {
    exportScope,
    openFullVideoExport: () => setFullVideoExportOpen(true),
    submitVideoExport,
    closeVideoExport,
  };
}
