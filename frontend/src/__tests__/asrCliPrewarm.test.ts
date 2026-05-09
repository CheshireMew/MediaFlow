import { beforeEach, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";

import {
  prewarmFasterWhisperCliFromStoredPreferences,
  resetFasterWhisperCliPrewarmForTests,
} from "../services/asrCliPrewarm";
import { persistStoredAsrExecutionPreferences } from "../services/persistence/asrExecutionPreferences";
import { resetUiStateSettingsForTests } from "../services/persistence/uiStateSettings";

const { prewarmFasterWhisperCliMock } = vi.hoisted(() => ({
  prewarmFasterWhisperCliMock: vi.fn(),
}));

vi.mock("../api/client", () => ({
  apiClient: {
    prewarmFasterWhisperCli: prewarmFasterWhisperCliMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetUiStateSettingsForTests();
  resetFasterWhisperCliPrewarmForTests();
  prewarmFasterWhisperCliMock.mockResolvedValue({
    status: "started",
    message: "started",
  });
});

it("does not prewarm the CLI when the stored ASR engine is builtin", async () => {
  persistStoredAsrExecutionPreferences({
    engine: "builtin",
    model: "large-v2",
    device: "cuda",
  });

  prewarmFasterWhisperCliFromStoredPreferences();
  await Promise.resolve();
  await Promise.resolve();

  expect(prewarmFasterWhisperCliMock).not.toHaveBeenCalled();
});

it("prewarms the CLI for the stored CLI profile", async () => {
  persistStoredAsrExecutionPreferences({
    engine: "cli",
    model: "large-v2",
    device: "cuda",
  });

  prewarmFasterWhisperCliFromStoredPreferences();

  await waitFor(() => {
    expect(prewarmFasterWhisperCliMock).toHaveBeenCalledWith({
      model: "large-v2",
      device: "cuda",
    });
  });
});
