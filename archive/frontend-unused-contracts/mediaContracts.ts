export type MediaKind = "video" | "audio" | "subtitle" | "image" | "document" | "unknown";

export type MediaOriginKind =
  | "task"
  | "navigation"
  | "file-selection"
  | "snapshot"
  | "derived"
  | "unknown";

export type MediaRole =
  | "source"
  | "context"
  | "subtitle"
  | "output"
  | "artifact"
  | "unknown";
