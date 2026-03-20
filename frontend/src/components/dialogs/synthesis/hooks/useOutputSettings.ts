// ── Output Settings State + Persistence ──
import { useState, useEffect } from "react";

const readStoredQuality = (): "high" | "balanced" | "small" => {
  const saved = localStorage.getItem("synthesis_quality");
  return saved === "high" || saved === "balanced" || saved === "small"
    ? saved
    : "balanced";
};

const readStoredGpuPreference = (): boolean => {
  const saved = localStorage.getItem("synthesis_use_gpu");
  return saved === null ? true : saved === "true";
};

const readStoredTargetResolution = (): string => {
  return localStorage.getItem("synthesis_target_resolution") ?? "original";
};

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
): OutputSettingsState {
  const [quality, setQuality] = useState<"high" | "balanced" | "small">(
    readStoredQuality,
  );
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [outputFilename, setOutputFilename] = useState("");
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [useGpu, setUseGpu] = useState(readStoredGpuPreference);
  const [targetResolution, setTargetResolution] = useState(readStoredTargetResolution);

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
    localStorage.setItem("synthesis_quality", quality);
  }, [quality, isInitialized]);

  // --- Persist GPU preference ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("synthesis_use_gpu", String(useGpu));
  }, [useGpu, isInitialized]);

  // --- Persist Resolution preference ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("synthesis_target_resolution", targetResolution);
  }, [targetResolution, isInitialized]);

  // --- Initialize output path from video path ---
  useEffect(() => {
    if (!isOpen || !videoPath) return;

    // Filename: default to current filename + _synthesized
    const name = videoPath.split(/[\\/]/).pop() || "video.mp4";
    const baseName = name.substring(0, name.lastIndexOf(".")) || name;
    const ext = name.substring(name.lastIndexOf("."));
    const defaultName = `${baseName}_synthesized${ext}`;

    // Directory: last used or current video directory
    const lastDir = localStorage.getItem("last_synthesis_dir");
    const currentDir = videoPath.substring(
      0,
      Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/")),
    );
    const nextDir = lastDir || currentDir;
    const timer = setTimeout(() => {
      setOutputFilename(defaultName);
      setOutputDir(nextDir);
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, videoPath]);

  // --- Select output folder ---
  const handleSelectOutputFolder = async () => {
    if (window.electronAPI?.selectDirectory) {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setOutputDir(path);
        localStorage.setItem("last_synthesis_dir", path);
      }
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
