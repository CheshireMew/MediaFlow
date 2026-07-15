import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutoTrimSilenceSetting } from "../pages/settings/general/AutoTrimSilenceSetting";
import type { SettingsController, SettingsT } from "../pages/settings/settingsTypes";
import { createMockUserSettings } from "./testUtils/mockUserSettings";

describe("AutoTrimSilenceSetting", () => {
  it("is disabled by default and persists an enabled preference when clicked", async () => {
    const updatePreferences = vi.fn().mockResolvedValue(null);
    const controller = {
      settings: createMockUserSettings({ auto_trim_silence: false }),
      updatePreferences,
    } as unknown as SettingsController;
    const t = ((key: string) => key) as SettingsT;

    render(<AutoTrimSilenceSetting controller={controller} t={t} />);

    const toggle = screen.getByRole("switch", {
      name: "general.autoTrimSilence",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(updatePreferences).toHaveBeenCalledWith(
        { auto_trim_silence: true },
        "general.autoTrimSilenceEnabled",
      );
    });
  });
});
