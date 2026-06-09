import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { isDesktopRuntime } from "../../services/desktop";
import { fileService } from "../../services/fileService";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

interface SubtitleFileContextMenuProps {
  children: ReactNode;
  className?: string;
  openFolderLabel: string;
  subtitlePath?: string | null;
}

interface OpenSubtitleFolderMenuItemParams {
  label: string;
  onError?: (error: unknown) => void | Promise<void>;
  subtitlePath?: string | null;
}

export async function openSubtitleFolder(subtitlePath: string) {
  await fileService.showInExplorer(subtitlePath);
}

export function createOpenSubtitleFolderMenuItem({
  label,
  onError,
  subtitlePath,
}: OpenSubtitleFolderMenuItemParams): ContextMenuItem {
  return {
    label,
    disabled: !subtitlePath,
    onClick: async () => {
      if (!subtitlePath) {
        return;
      }

      try {
        await openSubtitleFolder(subtitlePath);
      } catch (error) {
        await onError?.(error);
      }
    },
  };
}

export function SubtitleFileContextMenu({
  children,
  className,
  openFolderLabel,
  subtitlePath,
}: SubtitleFileContextMenuProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const canOpenSubtitleFolder = Boolean(subtitlePath) && isDesktopRuntime();

  const items = useMemo<ContextMenuItem[]>(
    () => [
      createOpenSubtitleFolderMenuItem({
        label: openFolderLabel,
        subtitlePath,
      }),
    ],
    [openFolderLabel, subtitlePath],
  );

  const handleContextMenu = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!canOpenSubtitleFolder) {
        return;
      }

      event.preventDefault();
      setPosition({ x: event.clientX, y: event.clientY });
    },
    [canOpenSubtitleFolder],
  );

  return (
    <div className={className} onContextMenu={handleContextMenu}>
      {children}
      <ContextMenu
        items={items}
        position={position}
        onClose={() => setPosition(null)}
      />
    </div>
  );
}
