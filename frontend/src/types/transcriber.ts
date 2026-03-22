import type { MediaReference } from "../services/ui/mediaReference";

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
  video_ref?: MediaReference | null;
  subtitle_ref?: MediaReference | null;
  output_ref?: MediaReference | null;
}
