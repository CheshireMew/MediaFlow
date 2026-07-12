import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Download,
  FileAudio,
  Globe,
  Pencil,
  RefreshCw,
  Settings,
} from "lucide-react";
import { resolvePagePresentation } from "../../services/ui/pagePresentation";
import { PageContent, PageHeader, PageShell } from "../ui/PageChrome";

type StartupVariant =
  | "dashboard"
  | "editor"
  | "downloader"
  | "transcriber"
  | "translator"
  | "settings";

export type StartupPresentationStatus =
  | "loading"
  | "retryable-error"
  | "fatal-error";

interface StartupPlaceholderPageProps {
  variant: StartupVariant;
  message: string;
  status?: StartupPresentationStatus;
  onRetry?: () => void;
}

interface VariantConfig {
  icon: ReactNode;
  accent: string;
}

const VARIANT_CONFIG: Record<StartupVariant, VariantConfig> = {
  dashboard: {
    icon: <Activity className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-cyan-500/20",
  },
  editor: {
    icon: <Pencil className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-purple-500/20",
  },
  downloader: {
    icon: <Download className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-purple-500/20",
  },
  transcriber: {
    icon: <FileAudio className="w-6 h-6 text-purple-400" />,
    accent: "from-purple-500/20 to-pink-500/20",
  },
  translator: {
    icon: <Globe className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-blue-500/20",
  },
  settings: {
    icon: <Settings className="w-6 h-6 text-amber-400" />,
    accent: "from-amber-500/20 to-orange-500/20",
  },
};

function SkeletonBar({
  width,
  height = "h-3",
}: {
  width: string;
  height?: string;
}) {
  return (
    <div
      className={`${height} ${width} rounded-full bg-white/8 animate-pulse`}
    />
  );
}

function StartupBody({ variant }: { variant: StartupVariant }) {
  if (variant === "editor") {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-14 rounded-lg bg-[#1a1a1a] border border-white/5 mb-4 px-5 flex items-center gap-3">
          <SkeletonBar width="w-24" />
          <SkeletonBar width="w-16" />
          <SkeletonBar width="w-20" />
        </div>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-[34%] min-w-[320px] rounded-lg bg-[#1a1a1a] border border-white/5 p-4 flex flex-col gap-3">
            <SkeletonBar width="w-32" />
            <SkeletonBar width="w-full" height="h-16" />
            <SkeletonBar width="w-[92%]" height="h-16" />
            <SkeletonBar width="w-[88%]" height="h-16" />
            <div className="mt-auto rounded-xl bg-black/20 border border-white/5 p-3">
              <SkeletonBar width="w-20" />
              <SkeletonBar width="w-full" height="h-10" />
            </div>
          </div>
          <div className="flex-1 rounded-lg bg-[#1a1a1a] border border-white/5 p-4">
            <div className="h-full rounded-xl bg-[#0a0a0a] border border-white/5 flex items-center justify-center">
              <div className="w-[70%] aspect-video rounded-xl border border-dashed border-white/10 bg-white/[0.02]" />
            </div>
          </div>
        </div>
        <div className="h-36 mt-4 rounded-lg bg-[#1a1a1a] border border-white/5 p-4">
          <SkeletonBar width="w-28" />
          <div className="mt-4 h-16 rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
      </div>
    );
  }

  if (variant === "dashboard") {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-lg bg-[#1a1a1a] border border-white/5 p-4"
            >
              <SkeletonBar width="w-28" />
              <div className="mt-4 space-y-3">
                <SkeletonBar width="w-full" />
                <SkeletonBar width="w-[85%]" />
                <SkeletonBar width="w-[55%]" />
              </div>
            </div>
          ))}
        </div>
        <div className="flex-1 rounded-lg bg-[#1a1a1a] border border-white/5 p-4">
          <SkeletonBar width="w-40" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2, 3].map((item) => (
              <div
                key={item}
                className="rounded-xl bg-white/[0.03] border border-white/5 p-4"
              >
                <SkeletonBar width="w-24" />
                <SkeletonBar width="w-[80%]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "downloader") {
    return (
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[480px] rounded-lg bg-[#1a1a1a] border border-white/5 p-5 space-y-4">
          <SkeletonBar width="w-32" />
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-40 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-48 rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 rounded-lg bg-[#1a1a1a] border border-white/5 p-5">
          <SkeletonBar width="w-40" />
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 rounded-xl bg-white/[0.03] border border-white/5"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (variant === "transcriber") {
    return (
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-[420px] rounded-lg bg-[#1a1a1a] border border-white/5 p-5 space-y-5">
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-56 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 rounded-lg bg-[#1a1a1a] border border-white/5 p-5">
          <SkeletonBar width="w-44" />
          <div className="mt-4 h-[70%] rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
      </div>
    );
  }

  if (variant === "translator") {
    return (
      <div className="flex-1 min-h-0 rounded-lg bg-[#1a1a1a] border border-white/5 p-5 flex flex-col">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="space-y-2">
            <SkeletonBar width="w-40" />
            <SkeletonBar width="w-56" />
          </div>
          <div className="flex gap-2">
            <div className="w-28 h-10 rounded-xl bg-white/[0.03] border border-white/5" />
            <div className="w-28 h-10 rounded-xl bg-white/[0.03] border border-white/5" />
            <div className="w-28 h-10 rounded-xl bg-white/[0.03] border border-white/5" />
          </div>
        </div>
        <div className="py-4 border-b border-white/5 flex gap-4">
          <div className="w-36 h-9 rounded-lg bg-white/[0.03] border border-white/5" />
          <div className="w-36 h-9 rounded-lg bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 mt-4 rounded-xl bg-white/[0.03] border border-white/5" />
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 rounded-lg bg-[#1a1a1a] border border-white/5 p-5 grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-5">
      <div className="space-y-4">
        <div className="h-32 rounded-xl bg-white/[0.03] border border-white/5" />
        <div className="h-56 rounded-xl bg-white/[0.03] border border-white/5" />
      </div>
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-white/[0.03] border border-white/5" />
        <div className="h-24 rounded-xl bg-white/[0.03] border border-white/5" />
        <div className="h-24 rounded-xl bg-white/[0.03] border border-white/5" />
      </div>
    </div>
  );
}

export function StartupPlaceholderPage({
  variant,
  message,
  status = "loading",
  onRetry,
}: StartupPlaceholderPageProps) {
  const config = VARIANT_CONFIG[variant];
  const presentation = resolvePagePresentation(variant);
  const { t } = useTranslation(presentation.namespace);
  const { t: tCommon } = useTranslation("common");
  const isFatal = status === "fatal-error";
  const isRetryable = status === "retryable-error";

  return (
    <PageShell padded={false} className="flex flex-col">
      <PageHeader
        iconNode={config.icon}
        title={t(presentation.titleKey)}
        subtitle={t(presentation.subtitleKey)}
      />

      <PageContent className="flex flex-col">
        <div
          role={isFatal ? "alert" : "status"}
          className={`mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            isFatal
              ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
              : isRetryable
                ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                : "border-indigo-500/20 bg-indigo-500/8 text-slate-300"
          }`}
        >
          <div
            className={`h-2 w-2 shrink-0 rounded-full ${
              isFatal
                ? "bg-rose-400"
                : isRetryable
                  ? "bg-amber-400"
                  : "bg-indigo-400 animate-pulse"
            }`}
          />
          <span className="min-w-0 flex-1">{message}</span>
          {isRetryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 font-semibold text-amber-100 transition-colors hover:bg-amber-400/20 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
            >
              <RefreshCw size={15} />
              {tCommon("startup.action.retry")}
            </button>
          )}
        </div>

        {isFatal ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-xl rounded-xl border border-rose-500/20 bg-[#161111] p-8 text-center shadow-2xl">
              <h2 className="text-xl font-semibold text-white">
                {tCommon("startup.fatal.title")}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {tCommon("startup.fatal.help")}
              </p>
            </div>
          </div>
        ) : (
          <StartupBody variant={variant} />
        )}
      </PageContent>
    </PageShell>
  );
}
