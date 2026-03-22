// ── Output Settings State + Persistence ──
import { useState, useEffect } from "react";
import { fileService } from "../../../../services/fileService";
import {
  updateSynthesisSettingsSnapshot,
  type SynthesisSettingsSnapshot,
} from "../synthesisPersistence";

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
  targetResolution: string;
  setTargetResolution: (v: string) => void;
}

export function useOutputSettings(
  isOpen: boolean,
  videoPath: string | null,
  isInitialized: React.MutableRefObject<boolean>,
  persistedSettings: SynthesisSettingsSnapshot,
): OutputSettingsState {
  const [quality, setQuality] = useState<"high" | "balanced" | "small">(
    () => persistedSettings.quality,
  );
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [outputFilename, setOutputFilename] = useState("");
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [useGpu, setUseGpu] = useState(() => persistedSettings.useGpu);
  const [targetResolution, setTargetResolution] = useState(() => persistedSettings.targetResolution);

  // Reset trim when video changes or dialog opens
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setTrimStart(0);
      setTrimEnd(0);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, videoPath]);

  // --- Persist quality ---
  useEffect(() => {
    if (!isInitialized.current) return;
    updateSynthesisSettingsSnapshot({
      quality,
      useGpu,
      targetResolution,
      lastOutputDir: outputDir,
    });
  }, [isInitialized, outputDir, quality, targetResolution, useGpu]);

  // --- Initialize output path from video path ---
  useEffect(() => {
    if (!isOpen || !videoPath) return;

    // Filename: default to current filename + _synthesized
    const name = videoPath.split(/[\\/]/).pop() || "video.mp4";
    const baseName = name.substring(0, name.lastIndexOf(".")) || name;
    const ext = name.substring(name.lastIndexOf("."));
    const defaultName = `${baseName}_synthesized${ext}`;

    // Directory: last used or current video directory
    const currentDir = videoPath.substring(
      0,
      Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/")),
    );
    const nextDir = persistedSettings.lastOutputDir || currentDir;
    const timer = setTimeout(() => {
      setOutputFilename(defaultName);
      setOutputDir(nextDir);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, persistedSettings.lastOutputDir, videoPath]);

  // --- Select output folder ---
  const handleSelectOutputFolder = async () => {
    try {
      const path = await fileService.selectDirectory();
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
