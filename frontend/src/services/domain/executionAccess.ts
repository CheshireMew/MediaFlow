import type { TranscriptionEngine } from "../../types/api";
import { toast } from "../../utils/toast";
import { NavigationService } from "../ui/navigation";
import { settingsService } from "./settingsService";

const AI_TRANSLATION_SETUP_REQUIRED = "AI_TRANSLATION_SETUP_REQUIRED";
const CLI_TRANSCRIPTION_SETUP_REQUIRED = "CLI_TRANSCRIPTION_SETUP_REQUIRED";

export class AiTranslationSetupRequiredError extends Error {
  code = AI_TRANSLATION_SETUP_REQUIRED;

  constructor() {
    super("请先在设置中填写并启用 AI 密钥");
    this.name = "AiTranslationSetupRequiredError";
  }
}

export class CliTranscriptionSetupRequiredError extends Error {
  code = CLI_TRANSCRIPTION_SETUP_REQUIRED;

  constructor() {
    super("请先在设置中填写 faster-whisper CLI 路径");
    this.name = "CliTranscriptionSetupRequiredError";
  }
}

export function isAiTranslationSetupRequiredError(
  error: unknown,
): error is AiTranslationSetupRequiredError {
  return (
    error instanceof AiTranslationSetupRequiredError ||
    (error instanceof Error &&
      "code" in error &&
      error.code === AI_TRANSLATION_SETUP_REQUIRED)
  );
}

export function isCliTranscriptionSetupRequiredError(
  error: unknown,
): error is CliTranscriptionSetupRequiredError {
  return (
    error instanceof CliTranscriptionSetupRequiredError ||
    (error instanceof Error &&
      "code" in error &&
      error.code === CLI_TRANSCRIPTION_SETUP_REQUIRED)
  );
}

export async function ensureAiTranslationConfigured(): Promise<void> {
  const settings = await settingsService.getSettings();
  const activeProvider = settings.llm_providers.find((provider) => provider.is_active);
  const apiKey = activeProvider?.api_key?.trim();

  if (apiKey) {
    return;
  }

  toast.warning("请先在设置中填写并启用 AI 密钥", 3500);
  NavigationService.navigate("settings", { settings_tab: "llm" });
  throw new AiTranslationSetupRequiredError();
}

export async function ensureCliTranscriptionConfigured(
  engine?: TranscriptionEngine,
): Promise<void> {
  if (engine !== "cli") {
    return;
  }

  const settings = await settingsService.getSettings();
  const cliPath = settings.faster_whisper_cli_path?.trim();

  if (cliPath) {
    return;
  }

  toast.warning("请先在设置中填写 faster-whisper CLI 路径", 3500);
  NavigationService.navigate("settings", { settings_tab: "general" });
  throw new CliTranscriptionSetupRequiredError();
}
