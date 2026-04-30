import { CheckCircle2, Cpu, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { settingsService } from "../../../services/domain";
import type { CudaReadinessResponse, RuntimeDependencyCheck } from "../../../types/api";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";

type CudaReadinessSettingProps = {
  controller: SettingsController;
  t: SettingsT;
};

const STATUS_STYLES: Record<string, string> = {
  ready: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
  not_on_path: "text-amber-300 bg-amber-400/10 border-amber-400/20",
  missing: "text-rose-300 bg-rose-400/10 border-rose-400/20",
  unknown: "text-slate-300 bg-white/5 border-white/10",
};

function dependencyStatusLabel(t: SettingsT, item: RuntimeDependencyCheck) {
  if (item.status === "ready") return t("general.cudaStatusReady");
  if (item.status === "not_on_path") return t("general.cudaStatusNotOnPath");
  if (item.status === "missing") return t("general.cudaStatusMissing");
  return t("general.cudaStatusUnknown");
}

export function CudaReadinessSetting({ controller, t }: CudaReadinessSettingProps) {
  const [readiness, setReadiness] = useState<CudaReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadReadiness = async () => {
    setIsLoading(true);
    try {
      setReadiness(await settingsService.getCudaReadiness());
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.cudaLoadFailed");
      controller.showNotification(message, "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadReadiness();
  }, []);

  const summaryTone = useMemo(() => {
    if (!readiness) return "text-slate-400";
    return readiness.status === "ready" ? "text-emerald-300" : "text-amber-300";
  }, [readiness]);

  return (
    <SettingCard
      icon={<Cpu size={18} className="text-cyan-300" />}
      title={t("general.cudaTitle")}
      description={t("general.cudaDesc")}
      contentClassName="flex-1"
      actions={
        <button
          onClick={loadReadiness}
          disabled={isLoading}
          className="px-3 py-2 rounded-lg text-sm font-medium bg-white/5 text-slate-200 hover:bg-white/10 border border-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          {t("general.cudaRefresh")}
        </button>
      }
    >
      <div className="mt-4 space-y-4">
        <div className={`text-sm ${summaryTone}`}>
          {readiness?.summary || t("general.cudaLoading")}
        </div>

        {readiness && (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {readiness.dependencies.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium text-slate-200">
                      {item.label}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
                        STATUS_STYLES[item.status] || STATUS_STYLES.unknown
                      }`}
                    >
                      {dependencyStatusLabel(t, item)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-start gap-2 text-xs text-slate-400">
                    {item.status === "ready" ? (
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                    ) : (
                      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-amber-300" />
                    )}
                    <span className="min-w-0">{item.detail}</span>
                  </div>
                  {item.path && (
                    <div className="mt-2 break-all font-mono text-[11px] text-slate-500">
                      {item.path}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(readiness.gpu_name || readiness.driver_cuda_capability) && (
              <div className="text-xs text-slate-500">
                {readiness.gpu_name && <span>{readiness.gpu_name}</span>}
                {readiness.driver_version && <span> | Driver {readiness.driver_version}</span>}
                {readiness.driver_cuda_capability && (
                  <span> | CUDA {readiness.driver_cuda_capability}</span>
                )}
              </div>
            )}

            <div className="space-y-2">
              {readiness.install_guidance.map((item) => (
                <div key={item} className="text-xs text-slate-400">
                  {item}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </SettingCard>
  );
}
