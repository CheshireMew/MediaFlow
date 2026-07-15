import type { ContextMenuItem } from "../../components/ui/ContextMenu";

export interface EditorContextMenuState {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  targetId?: string;
}
