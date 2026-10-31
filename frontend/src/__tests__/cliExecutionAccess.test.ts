import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "../api/client";
import { ensureCliTranscriptionConfigured } from "../services/domain/executionAccess";
import { NavigationService } from "../services/ui/navigation";
import { toast } from "../utils/toast";

vi.spyOn(apiClient, "getSettings");
vi.spyOn(NavigationService, "navigate").mockImplementation(() => undefined);
vi.spyOn(toast, "warning").mockImplementation(() => undefined);

describe("CLI executable preflight", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts an existing executable returned by the backend", async () => {
    vi.mocked(apiClient.getSettings).mockResolvedValue({
      faster_whisper_cli_path: "E:/MediaFlow/faster-whisper-xxl.exe",
      faster_whisper_cli_available: true,
    });
    await expect(ensureCliTranscriptionConfigured("cli")).resolves.toBeUndefined();
    expect(NavigationService.navigate).not.toHaveBeenCalled();
  });

  it("rechecks the backend before every attempt", async () => {
    const path = "E:/MediaFlow/faster-whisper-xxl.exe";
    vi.mocked(apiClient.getSettings)
      .mockResolvedValueOnce({ faster_whisper_cli_path: path, faster_whisper_cli_available: true })
      .mockResolvedValueOnce({ faster_whisper_cli_path: path, faster_whisper_cli_available: false });
    await ensureCliTranscriptionConfigured("cli");
    await expect(ensureCliTranscriptionConfigured("cli")).rejects.toThrow(path);
    expect(NavigationService.navigate).toHaveBeenCalledWith("settings", { settings_tab: "general" });
    expect(toast.warning).toHaveBeenCalled();
  });

  it("does not require the external executable for builtin transcription", async () => {
    await ensureCliTranscriptionConfigured("builtin");
    expect(apiClient.getSettings).not.toHaveBeenCalled();
  });
});
