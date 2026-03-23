import type { ElectronFile } from "../../types/electron";
import type { MediaReference } from "./mediaReference";

export type ElectronFileSource =
  | "file-selection"
  | "file-drop"
  | "pending_file"
  | "transcriber_snapshot"
  | "task_navigation"
  | "unknown";

export function attachElectronFileSource<T extends ElectronFile>(
  file: T,
  source: ElectronFileSource,
): T {
  return {
    ...file,
    __mediaflow_source: source,
  };
}

export function getElectronFileSource(file: ElectronFile | null | undefined): ElectronFileSource {
  return file?.__mediaflow_source ?? "unknown";
}

export function toNavigationFileSource(reference?: MediaReference | null): ElectronFileSource {
  if (reference?.origin === "task") {
    return "task_navigation";
  }
  return "pending_file";
}
