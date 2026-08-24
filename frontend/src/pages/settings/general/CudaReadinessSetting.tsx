import { CheckCircle2, Cpu, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { settingsService } from "../../../services/domain";
import type { CudaReadinessResponse, RuntimeDependencyCheck } from "../../../types/api";
import type { SettingsController, SettingsT } from "../settingsTypes";
import { SettingCard } from "./SettingCard";
import { SettingsActionButton } from "./SettingsActionButton";

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

const DEPENDENCY_LABEL_KEYS: Record<string, string> = {
  nvidia_driver: "general.cudaDependencies.nvidiaDriver",
  cuda_runtime: "general.cudaDependencies.cudaRuntime",
  cublas: "general.cudaDependencies.cublas",
  cudnn: "general.cudaDependencies.cudnn",
};

function dependencyLabel(t: SettingsT, item: RuntimeDependencyCheck) {
  const key = DEPENDENCY_LABEL_KEYS[item.key];
  return key ? t(key) : item.key;
}

function dependencyDetail(
  t: SettingsT,
  item: RuntimeDependencyCheck,
  readiness: CudaReadinessResponse,
) {
  if (item.key === "nvidia_driver" && item.status === "ready") {
    return t("general.cudaDependencyDetails.gpuReady", {
      gpu: readiness.gpu_name || t("general.cudaDependencies.nvidiaGpu"),
    });
  }
  const statusKey = item.status === "ready"
    ? "ready"
    : item.status === "not_on_path"
      ? "notOnPath"
      : item.status === "missing"
        ? "missing"
        : "unknown";
  return t(`general.cudaDependencyDetails.${statusKey}`, {
    name: dependencyLabel(t, item),
  });
}

export function CudaReadinessSetting({ controller, t }: CudaReadinessSettingProps) {
  const [readiness, setReadiness] = useState<CudaReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadReadiness = useCallback(async () => {
    setIsLoading(true);
    try {
      setReadiness(await settingsService.getCudaReadiness());
    } catch (error) {
      const message = error instanceof Error ? error.message : t("general.cudaLoadFailed");
      controller.showNotification(message, "error");
    } finally {
      setIsLoading(false);
    }
  }, [controller, t]);

  useEffect(() => {
    void loadReadiness();
  }, [loadReadiness]);

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
        <SettingsActionButton
          onClick={loadReadiness}
          disabled={isLoading}
          className="inline-flex items-center gap-2"
        >
          <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          {t("general.cudaRefresh")}
        </SettingsActionButton>
      }
    >
      <div className="mt-4 space-y-4">
        <div className={`text-sm ${summaryTone}`}>
          {readiness
            ? t(readiness.status === "ready" ? "general.cudaSummaryReady" : "general.cudaSummaryNotReady")
            : t("general.cudaLoading")}
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
                      {dependencyLabel(t, item)}
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
                    <span className="min-w-0">{dependencyDetail(t, item, readiness)}</span>
                  </div>
                  {item.path && (
                    <div className="mt-2 break-all font-mono text-xs text-slate-400">
                      {item.path}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {(readiness.gpu_name || readiness.driver_cuda_capability) && (
              <div className="text-xs text-slate-400">
                {readiness.gpu_name && <span>{readiness.gpu_name}</span>}
                {readiness.driver_version && (
                  <span> | {t("general.cudaDriverVersion", { version: readiness.driver_version })}</span>
                )}
                {readiness.driver_cuda_capability && (
                  <span> | CUDA {readiness.driver_cuda_capability}</span>
                )}
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-400">
              {readiness.status === "ready" ? (
                <div>{t("general.cudaGuidanceReady")}</div>
              ) : (
                <>
                  {readiness.dependencies.some((item) => item.key === "nvidia_driver" && item.status !== "ready") && (
                    <div>{t("general.cudaGuidanceDriver")}</div>
                  )}
                  {readiness.dependencies.some((item) => item.key !== "nvidia_driver" && item.status !== "ready") && (
                    <div>{t("general.cudaGuidanceRuntime")}</div>
                  )}
                </>
              )}
            </div>

            <details className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400">
              <summary className="cursor-pointer text-slate-300 hover:text-white">
                {t("general.cudaRawDetails")}
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">
                {JSON.stringify(readiness, null, 2)}
              </pre>
            </details>
          </>
        )}
      </div>
    </SettingCard>
  );
}
