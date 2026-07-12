// ── Output Settings State + Persistence ──
import { useState, useEffect, useRef } from "react";
import { fileService } from "../../../../services/fileService";
import {
  updateStoredSynthesisExecutionPreferences,
  type SynthesisTargetResolution,
  type SynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";
import { buildSuffixedOutputPath } from "../../../../services/ui/generatedOutputPath";
import { resolveVideoExportOutputDir } from "../../../../services/domain";

export type { SynthesisTargetResolution } from "../../../../services/persistence/synthesisExecutionPreferences";

export interface OutputSettingsState {
  quality: "high" | "balanced" | "small";
  setQuality: (v: "high" | "balanced" | "small") => void;
  isQualityMenuOpen: boolean;
  setIsQualityMenuOpen: (v: boolean) => void;
  useGpu: boolean;
  setUseGpu: (v: boolean) => void;
  outputFilename: string;
  setOutputFilename: (v: string) => void;
  outputDir: string | null;
  setOutputDir: (v: string | null) => void;
  handleSelectOutputFolder: () => Promise<void>;
  trimStart: number;
  setTrimStart: (v: number) => void;
  trimEnd: number;
  setTrimEnd: (v: number) => void;
  targetResolution: SynthesisTargetResolution;
  setTargetResolution: (v: SynthesisTargetResolution) => void;
}

export function useOutputSettings(
  isOpen: boolean,
  videoPath: string | null,
  persistedPreferences: SynthesisExecutionPreferences,
  exportKind: "full-video" | "clips",
): OutputSettingsState {
  const [quality, setQualityState] = useState<"high" | "balanced" | "small">(
    () => persistedPreferences.quality,
  );
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const initialOutput = resolveInitialOutput(
    videoPath,
    persistedPreferences.lastOutputDir,
    exportKind,
  );
  const [outputFilename, setOutputFilename] = useState(initialOutput.filename);
  const [outputDir, setOutputDirState] = useState<string | null>(initialOutput.dir);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [useGpu, setUseGpuState] = useState(() => persistedPreferences.useGpu);
  const [targetResolution, setTargetResolutionState] = useState<SynthesisTargetResolution>(
    () => persistedPreferences.targetResolution,
  );
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      isInitialized.current = false;
      return;
    }

    isInitialized.current = false;
    const timer = setTimeout(() => {
      setQualityState(persistedPreferences.quality);
      setUseGpuState(persistedPreferences.useGpu);
      setTargetResolutionState(persistedPreferences.targetResolution);
      isInitialized.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [exportKind, isOpen, persistedPreferences]);

  // Reset trim when video changes or dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setTrimStart(0);
      setTrimEnd(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, videoPath]);

  const persistOutputPreferences = (
    updates: Partial<Pick<SynthesisExecutionPreferences, "quality" | "useGpu" | "lastOutputDir">>,
  ) => {
    if (!isOpen || !isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences(updates);
  };

  const setQuality = (value: "high" | "balanced" | "small") => {
    setQualityState(value);
    persistOutputPreferences({ quality: value });
  };

  const setUseGpu = (value: boolean) => {
    setUseGpuState(value);
    persistOutputPreferences({ useGpu: value });
  };

  const setTargetResolution = (value: SynthesisTargetResolution) => {
    setTargetResolutionState(value);
    if (!isOpen || !isInitialized.current) return;
    updateStoredSynthesisExecutionPreferences({ targetResolution: value });
  };

  const setOutputDir = (value: string | null) => {
    setOutputDirState(value);
    persistOutputPreferences({ lastOutputDir: value });
  };

  // --- Initialize output path from video path ---
  useEffect(() => {
    if (!isOpen || !videoPath) return;

    const nextOutput = resolveInitialOutput(
      videoPath,
      persistedPreferences.lastOutputDir,
      exportKind,
    );
    const timer = setTimeout(() => {
      setOutputFilename(nextOutput.filename);
      setOutputDirState(nextOutput.dir);
    }, 0);
    return () => clearTimeout(timer);
  }, [exportKind, isOpen, persistedPreferences.lastOutputDir, videoPath]);

  // --- Select output folder ---
  const handleSelectOutputFolder = async () => {
    try {
      const path = await fileService.selectDirectory({ access: "write" });
      if (path) {
        setOutputDir(path);
      }
    } catch {
      // Browser mode: no-op
    }
  };

  return {
    quality,
    setQuality,
    isQualityMenuOpen,
    setIsQualityMenuOpen,
    useGpu,
    setUseGpu,
    outputFilename,
    setOutputFilename,
    outputDir,
    setOutputDir,
    handleSelectOutputFolder,
    trimStart,
    setTrimStart,
    trimEnd,
    setTrimEnd,
    targetResolution,
    setTargetResolution,
  };
}

function resolveInitialOutput(
  videoPath: string | null,
  lastOutputDir: string | null,
  exportKind: "full-video" | "clips",
): { dir: string | null; filename: string } {
  if (!videoPath) {
    return { dir: null, filename: "" };
  }

  const name = videoPath.split(/[\\/]/).pop() || "video.mp4";
  const dir = resolveVideoExportOutputDir(videoPath, lastOutputDir, exportKind);
  const outputSep = dir.includes("\\") ? "\\" : "/";
  const cleanDir = dir.endsWith(outputSep) ? dir.slice(0, -1) : dir;
  const defaultPath = buildSuffixedOutputPath(
    `${cleanDir}${outputSep}${name}`,
    "_synthesized",
    ".mp4",
  );
  return {
    dir,
    filename: defaultPath.split(/[\\/]/).pop() || "video_synthesized.mp4",
  };
}
