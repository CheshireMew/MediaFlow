import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
  it("persists quality changes from the preview toolbar immediately", async () => {
    const { result } = renderHook(() =>
      useOutputSettings(
        true,
        "D:/media/source.mp4",
        DEFAULT_SYNTHESIS_EXECUTION_PREFERENCES,
      ),
    );

    await waitForHookTimers();

    act(() => {
      result.current.setQuality("high");
      result.current.setTargetResolution("1080p");
    });

    const preferences = restoreStoredSynthesisExecutionPreferences();

    expect(preferences.quality).toBe("high");
    expect("targetResolution" in preferences).toBe(false);
    expect(result.current.targetResolution).toBe("1080p");
  });
});
