import type { TFunction } from "i18next";
import type { useSettingsController } from "./useSettingsController";

export type SettingsController = ReturnType<typeof useSettingsController>;
export type SettingsT = TFunction<"settings">;
export type CommonT = TFunction<"common">;
