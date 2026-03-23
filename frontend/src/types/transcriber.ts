import type { MediaReference } from "../services/ui/mediaReference";
import type { TranscriptionEngine } from "./api";

export interface TranscribeSegment {
  id: string | number;
  start: number;
  end: number;
  text: string;
}

export interface TranscribeResult {
  segments: TranscribeSegment[];
  text: string;
  language: string;
  srt_path?: string | null;
  video_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
  output_ref?: MediaReference | null;
}

export type { TranscriptionEngine };
