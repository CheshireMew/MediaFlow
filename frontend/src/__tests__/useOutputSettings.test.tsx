import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useOutputSettings } from "../components/dialogs/synthesis/hooks/useOutputSettings";
import {
  DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
  restoreStoredSynthesisExecutionPreferences,
} from "../services/persistence/synthesisExecutionPreferences";

async function waitForHookTimers() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useOutputSettings", () => {
  beforeEach(() => localStorage.clear());

  it("persists quality changes from the preview toolbar immediately", async () => {
    const { result } = renderHook(() =>
      useOutputSettings(
        true,
        "D:/media/source.mp4",
        DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
        "full-video",
      ),
    );

    await waitForHookTimers();

    act(() => {
      result.current.setQuality("high");
      result.current.setTargetResolution("1080p");
    });

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences.quality).toBe("high");
    expect(preferences.targetResolution).toBe("1080p");
    expect(result.current.targetResolution).toBe("1080p");
  });

});
