import type { TranslateResponse } from "../../types/api";
import type { MediaReference } from "./mediaReference";
import { normalizeDirectTranslateResult } from "../tasks/directResultMediaResolver";

export function normalizeTranslateResult(
  result: TranslateResponse | null,
  contextRef?: MediaReference | null,
): TranslateResponse | null {
  return normalizeDirectTranslateResult(result, contextRef);
}
