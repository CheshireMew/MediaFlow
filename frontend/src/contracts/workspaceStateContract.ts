export const WORKSPACE_PATCH_FORMAT = "mediaflow-workspace-patch-v1" as const;

export type WorkspaceState = Record<string, unknown>;

export type WorkspacePatchOperation =
  | { op: "set"; path: Array<string | number>; value: unknown }
  | { op: "delete"; path: Array<string | number> };

export type WorkspacePatchEnvelope = {
  format: typeof WORKSPACE_PATCH_FORMAT;
  operations: WorkspacePatchOperation[];
};
