import type { TranscriptionEngine } from "../../types/api";
import { toast } from "../../utils/toast";
import { NavigationService } from "../ui/navigation";
import { settingsService } from "./settingsService";
import i18n from "../../i18n";

const AI_TRANSLATION_SETUP_REQUIRED = "AI_TRANSLATION_SETUP_REQUIRED";
const CLI_TRANSCRIPTION_SETUP_REQUIRED = "CLI_TRANSCRIPTION_SETUP_REQUIRED";

export class AiTranslationSetupRequiredError extends Error {
  code = AI_TRANSLATION_SETUP_REQUIRED;

  constructor() {
    super(i18n.t("setup.aiRequired", { ns: "common" }));
    this.name = "AiTranslationSetupRequiredError";
  }
}

export class CliTranscriptionSetupRequiredError extends Error {
  code = CLI_TRANSCRIPTION_SETUP_REQUIRED;

  constructor(message = i18n.t("setup.cliRequired", { ns: "common" })) {
    super(message);
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

  toast.warning(i18n.t("setup.aiRequired", { ns: "common" }), 3500);
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

  if (cliPath && settings.faster_whisper_cli_available) {
    return;
  }

  const message = i18n.t(cliPath ? "setup.cliInvalid" : "setup.cliRequired", {
    ns: "common",
    path: cliPath,
  });
  toast.warning(message, 5000);
  NavigationService.navigate("settings", { settings_tab: "general" });
  throw new CliTranscriptionSetupRequiredError(message);
}
