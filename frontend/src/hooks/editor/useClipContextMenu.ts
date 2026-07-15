import { useCallback } from "react";
import type { Dispatch } from "react";
import { useTranslation } from "react-i18next";

import type { EditorContextMenuState } from "./editorClipTypes";
import type { ClipCandidate } from "../../types/task";
import type { EditorClipWorkspaceAction } from "./editorClipWorkspace";

export function useClipContextMenu({
  candidates,
  dispatch,
  setContextMenu,
  addManualClip,
  toggleSelected,
  configureExport,
  deleteClip,
  playClip,
}: {
  candidates: ClipCandidate[];
  dispatch: Dispatch<EditorClipWorkspaceAction>;
  setContextMenu: (menu: EditorContextMenuState | null) => void;
  addManualClip: (start: number, end: number, id?: string) => void;
  toggleSelected: (id: string) => void;
  configureExport: () => void;
  deleteClip: (id: string) => void;
  playClip: (start: number, end: number) => void;
}) {
  const { t } = useTranslation("editor");
  return useCallback((
    event: MouseEvent,
    id: string,
    regionData?: { start: number; end: number },
  ) => {
    event.preventDefault();
    dispatch({ type: "set-active", id });
    const clip = candidates.find((candidate) => candidate.id === id);
    if (!clip) {
      if (!regionData || regionData.end <= regionData.start) return;
      setContextMenu({
        position: { x: event.clientX, y: event.clientY },
        targetId: id,
        items: [
          {
            label: t("clips.contextCreateFromSelection"),
            onClick: () => addManualClip(regionData.start, regionData.end, id),
          },
          { separator: true, label: "", onClick: () => {} },
          { label: t("clips.contextCancel"), onClick: () => {} },
        ],
      });
      return;
    }
    setContextMenu({
      position: { x: event.clientX, y: event.clientY },
      targetId: id,
      items: [
        { label: t("clips.contextPlay"), onClick: () => playClip(clip.start, clip.end) },
        {
          label: clip.selected ? t("clips.contextExclude") : t("clips.contextInclude"),
          onClick: () => toggleSelected(id),
        },
        { label: t("clips.contextExportSelected"), onClick: configureExport },
        { separator: true, label: "", onClick: () => {} },
        {
          label: t("clips.contextDelete"),
          danger: true,
          onClick: () => deleteClip(id),
        },
      ],
    });
  }, [addManualClip, candidates, configureExport, deleteClip, dispatch, playClip, setContextMenu, t, toggleSelected]);
}
