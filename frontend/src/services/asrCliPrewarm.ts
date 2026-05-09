import { restoreStoredAsrExecutionPreferences } from "./persistence/asrExecutionPreferences";

const inFlightProfiles = new Set<string>();

export function prewarmFasterWhisperCliFromStoredPreferences() {
  const preferences = restoreStoredAsrExecutionPreferences();
  if (preferences.engine !== "cli") {
    return;
  }

  const profileKey = `${preferences.model}:${preferences.device}`;
  if (inFlightProfiles.has(profileKey)) {
    return;
  }

  inFlightProfiles.add(profileKey);
  void import("../api/client")
    .then(({ apiClient }) =>
      apiClient.prewarmFasterWhisperCli({
        model: preferences.model,
        device: preferences.device,
      }),
    )
    .catch((error) => {
      console.warn("[ASR] Failed to prewarm Faster-Whisper CLI.", error);
    })
    .finally(() => {
      inFlightProfiles.delete(profileKey);
    });
}

export function resetFasterWhisperCliPrewarmForTests() {
  inFlightProfiles.clear();
}
