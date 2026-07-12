import { useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { isDesktopRuntime } from "../../services/desktop";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";
import { createOpenSubtitleFolderMenuItem } from "./subtitleFileContextMenuItems";

interface SubtitleFileContextMenuProps {
  children: ReactNode;
  className?: string;
  openFolderLabel: string;
  subtitlePath?: string | null;
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
