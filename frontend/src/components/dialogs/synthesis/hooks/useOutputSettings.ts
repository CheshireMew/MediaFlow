// ── Output Settings State + Persistence ──
import { useState, useEffect, useRef } from "react";
import { fileService } from "../../../../services/fileService";
import {
  updateStoredSynthesisExecutionPreferences,
  type SynthesisExecutionPreferences,
} from "../../../../services/persistence/synthesisExecutionPreferences";
import { buildSuffixedOutputPath } from "../../../../services/ui/generatedOutputPath";

export type SynthesisTargetResolution = "original" | "720p" | "1080p" | "sr_2x" | "sr_4x";

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
): OutputSettingsState {
  const [quality, setQualityState] = useState<"high" | "balanced" | "small">(
    () => persistedPreferences.quality,
  );
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [outputFilename, setOutputFilename] = useState("");
  const [outputDir, setOutputDirState] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [useGpu, setUseGpuState] = useState(() => persistedPreferences.useGpu);
  const [targetResolution, setTargetResolutionState] = useState<SynthesisTargetResolution>(
    "original",
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
      setTargetResolutionState("original");
      isInitialized.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences]);

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
  };

  const setOutputDir = (value: string | null) => {
    setOutputDirState(value);
    persistOutputPreferences({ lastOutputDir: value });
  };

  // --- Initialize output path from video path ---
  useEffect(() => {
    if (!isOpen || !videoPath) return;

    // Filename: default to current filename + _synthesized.mp4
    const name = videoPath.split(/[\\/]/).pop() || "video.mp4";

    // Directory: last used or current video directory
    const currentDir = videoPath.substring(
      0,
      Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/")),
    );
    const nextDir = persistedPreferences.lastOutputDir || currentDir;
    const sep = nextDir.includes("\\") ? "\\" : "/";
    const cleanDir = nextDir.endsWith(sep) ? nextDir.slice(0, -1) : nextDir;
    const defaultPath = buildSuffixedOutputPath(
      `${cleanDir}${sep}${name}`,
      "_synthesized",
      ".mp4",
    );
    const defaultName = defaultPath.split(/[\\/]/).pop() || "video_synthesized.mp4";
    const timer = setTimeout(() => {
      setOutputFilename(defaultName);
      setOutputDirState(nextDir);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, persistedPreferences.lastOutputDir, videoPath]);

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
