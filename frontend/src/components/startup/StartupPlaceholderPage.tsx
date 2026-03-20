import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Download,
  FileAudio,
  Globe,
  Pencil,
  Settings,
  Wand2,
} from "lucide-react";

type StartupVariant =
  | "dashboard"
  | "editor"
  | "downloader"
  | "transcriber"
  | "translator"
  | "preprocessing"
  | "settings";

interface StartupPlaceholderPageProps {
  variant: StartupVariant;
  message: string;
}

interface VariantConfig {
  titleKey: string;
  subtitleKey: string;
  icon: ReactNode;
  accent: string;
}

const VARIANT_CONFIG: Record<StartupVariant, VariantConfig> = {
  dashboard: {
    titleKey: "startup.pages.dashboard.title",
    subtitleKey: "startup.pages.dashboard.subtitle",
    icon: <Activity className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-cyan-500/20",
  },
  editor: {
    titleKey: "startup.pages.editor.title",
    subtitleKey: "startup.pages.editor.subtitle",
    icon: <Pencil className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-purple-500/20",
  },
  downloader: {
    titleKey: "startup.pages.downloader.title",
    subtitleKey: "startup.pages.downloader.subtitle",
    icon: <Download className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-purple-500/20",
  },
  transcriber: {
    titleKey: "startup.pages.transcriber.title",
    subtitleKey: "startup.pages.transcriber.subtitle",
    icon: <FileAudio className="w-6 h-6 text-purple-400" />,
    accent: "from-purple-500/20 to-pink-500/20",
  },
  translator: {
    titleKey: "startup.pages.translator.title",
    subtitleKey: "startup.pages.translator.subtitle",
    icon: <Globe className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-blue-500/20",
  },
  preprocessing: {
    titleKey: "startup.pages.preprocessing.title",
    subtitleKey: "startup.pages.preprocessing.subtitle",
    icon: <Wand2 className="w-6 h-6 text-indigo-400" />,
    accent: "from-indigo-500/20 to-teal-500/20",
  },
  settings: {
    titleKey: "startup.pages.settings.title",
    subtitleKey: "startup.pages.settings.subtitle",
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
        <div className="h-14 rounded-2xl bg-[#1a1a1a] border border-white/5 mb-4 px-5 flex items-center gap-3">
          <SkeletonBar width="w-24" />
          <SkeletonBar width="w-16" />
          <SkeletonBar width="w-20" />
        </div>
        <div className="flex-1 min-h-0 flex gap-4">
          <div className="w-[34%] min-w-[320px] rounded-2xl bg-[#1a1a1a] border border-white/5 p-4 flex flex-col gap-3">
            <SkeletonBar width="w-32" />
            <SkeletonBar width="w-full" height="h-16" />
            <SkeletonBar width="w-[92%]" height="h-16" />
            <SkeletonBar width="w-[88%]" height="h-16" />
            <div className="mt-auto rounded-xl bg-black/20 border border-white/5 p-3">
              <SkeletonBar width="w-20" />
              <SkeletonBar width="w-full" height="h-10" />
            </div>
          </div>
          <div className="flex-1 rounded-2xl bg-[#1a1a1a] border border-white/5 p-4">
            <div className="h-full rounded-xl bg-[#0a0a0a] border border-white/5 flex items-center justify-center">
              <div className="w-[70%] aspect-video rounded-xl border border-dashed border-white/10 bg-white/[0.02]" />
            </div>
          </div>
        </div>
        <div className="h-36 mt-4 rounded-2xl bg-[#1a1a1a] border border-white/5 p-4">
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
              className="rounded-2xl bg-[#1a1a1a] border border-white/5 p-4"
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
        <div className="flex-1 rounded-2xl bg-[#1a1a1a] border border-white/5 p-4">
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
        <div className="w-full lg:w-[480px] rounded-2xl bg-[#1a1a1a] border border-white/5 p-5 space-y-4">
          <SkeletonBar width="w-32" />
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-40 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-48 rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 rounded-2xl bg-[#1a1a1a] border border-white/5 p-5">
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
        <div className="w-full lg:w-[420px] rounded-2xl bg-[#1a1a1a] border border-white/5 p-5 space-y-5">
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-56 rounded-xl bg-white/[0.03] border border-white/5" />
          <div className="h-28 rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 rounded-2xl bg-[#1a1a1a] border border-white/5 p-5">
          <SkeletonBar width="w-44" />
          <div className="mt-4 h-[70%] rounded-xl bg-white/[0.03] border border-white/5" />
        </div>
      </div>
    );
  }

  if (variant === "translator") {
    return (
      <div className="flex-1 min-h-0 rounded-2xl bg-[#1a1a1a] border border-white/5 p-5 flex flex-col">
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

  if (variant === "preprocessing") {
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="h-14 rounded-t-2xl bg-[#1a1a1a] border border-white/5 px-5 flex items-center justify-between">
          <SkeletonBar width="w-32" />
          <div className="w-28 h-9 rounded-lg bg-white/[0.03] border border-white/5" />
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className="w-72 border-x border-b border-white/5 bg-[#141414] p-4 space-y-3">
            <SkeletonBar width="w-24" />
            <SkeletonBar width="w-full" height="h-14" />
            <SkeletonBar width="w-[88%]" height="h-14" />
          </div>
          <div className="flex-1 border-r border-b border-white/5 bg-[#0a0a0a] p-6">
            <div className="h-full rounded-2xl bg-[#1a1a1a] border border-white/5 flex items-center justify-center">
              <div className="w-[72%] aspect-video rounded-xl border border-dashed border-white/10 bg-white/[0.02]" />
            </div>
          </div>
          <div className="w-80 border-r border-b border-white/5 bg-[#141414] p-4 space-y-3">
            <SkeletonBar width="w-28" />
            <SkeletonBar width="w-full" height="h-20" />
            <SkeletonBar width="w-full" height="h-20" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 rounded-2xl bg-[#1a1a1a] border border-white/5 p-5 grid grid-cols-1 xl:grid-cols-[320px,1fr] gap-5">
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
}: StartupPlaceholderPageProps) {
  const { t } = useTranslation("common");
  const config = VARIANT_CONFIG[variant];

  return (
    <div className="w-full h-full px-6 pb-6 pt-5 flex flex-col overflow-hidden">
      <header className="flex-none mb-6 flex items-center gap-4">
        <div
          className={`p-2 rounded-2xl border border-white/5 shadow-lg shadow-black/20 bg-gradient-to-br ${config.accent}`}
        >
          {config.icon}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            {t(config.titleKey)}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">{t(config.subtitleKey)}</p>
        </div>
      </header>

      <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 text-sm text-slate-300">
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
        <span>{message}</span>
      </div>

      <StartupBody variant={variant} />
    </div>
  );
}
