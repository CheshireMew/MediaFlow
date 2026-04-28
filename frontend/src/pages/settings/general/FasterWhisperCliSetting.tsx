import { Cpu, Download } from "lucide-react";
import { fileService } from "../../../services/fileService";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type FasterWhisperCliSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

export function FasterWhisperCliSetting({ controller, t }: FasterWhisperCliSettingProps) {
  const {
    fasterWhisperCliInstallProgress,
    handleInstallFasterWhisperCli,
    isInstallingFasterWhisperCli,
    setSettings,
    settings,
    updateSettingsField,
  } = controller;

  return (
    <SettingCard
      icon={<Cpu size={18} className="text-indigo-400" />}
      title={t("general.cliPath")}
      description={t("general.cliPathDesc")}
      contentClassName="flex-1"
      actions={
        <>
          <button
            onClick={handleInstallFasterWhisperCli}
            disabled={isInstallingFasterWhisperCli}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 border border-indigo-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            <Download size={14} />
            {isInstallingFasterWhisperCli && fasterWhisperCliInstallProgress
              ? `${Math.round(fasterWhisperCliInstallProgress.progress)}%`
              : t("general.cliInstall")}
          </button>
          <button
            onClick={async () => {
              if (!settings) return;
              const selected = await fileService.openFile({ profile: "executable" });
              if (!selected?.path) return;
              const nextSettings = { ...settings, faster_whisper_cli_path: selected.path };
              setSettings(nextSettings);
              await updateSettingsField(nextSettings);
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
          >
            {t("general.chooseFile")}
          </button>
          <button
            onClick={async () => {
              if (!settings) return;
              await updateSettingsField({
                ...settings,
                faster_whisper_cli_path: settings.faster_whisper_cli_path?.trim() || null,
              });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors"
          >
            {t("general.savePath")}
          </button>
          <button
            onClick={async () => {
              if (!settings) return;
              await updateSettingsField({ ...settings, faster_whisper_cli_path: null });
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {t("general.clearFolder")}
          </button>
        </>
      }
    >
      <input
        value={settings?.faster_whisper_cli_path || ""}
        onChange={(event) => {
          if (!settings) return;
          setSettings({ ...settings, faster_whisper_cli_path: event.target.value });
        }}
        placeholder={t("general.cliPathPlaceholder")}
        className="mt-3 w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all"
      />
      {fasterWhisperCliInstallProgress && (
        <div className="mt-3 space-y-2">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-indigo-400 transition-all"
              style={{
                width: `${Math.max(0, Math.min(100, fasterWhisperCliInstallProgress.progress))}%`,
              }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {Math.round(fasterWhisperCliInstallProgress.progress)}% - {fasterWhisperCliInstallProgress.message}
          </p>
        </div>
      )}
    </SettingCard>
  );
}
