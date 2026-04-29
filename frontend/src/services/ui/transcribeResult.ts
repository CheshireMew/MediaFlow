import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import type { MediaReference } from "./mediaReference";
import { normalizeTranscribeResultMediaReferences } from "../tasks/resultMediaReferences";

type TranscribeSourceFile = {
  path: string;
  name?: string;
  size?: number;
  type?: string;
  media_id?: MediaReference["media_id"];
  media_kind?: MediaReference["media_kind"];
  role?: MediaReference["role"];
  origin?: MediaReference["origin"];
};

export function normalizeTranscribeResult(
  result: TranscribeResult | null,
  file?: TranscribeSourceFile | ElectronFile | null,
): TranscribeResult | null {
  return normalizeTranscribeResultMediaReferences(result, file);
}
