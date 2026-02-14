// ── Output Settings State + Persistence ──
import { useState, useEffect } from "react";

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
}

export function useOutputSettings(
  isOpen: boolean,
  videoPath: string | null,
  isInitialized: React.MutableRefObject<boolean>,
): OutputSettingsState {
  const [quality, setQuality] = useState<"high" | "balanced" | "small">(
    "balanced",
  );
  const [isQualityMenuOpen, setIsQualityMenuOpen] = useState(false);
  const [outputFilename, setOutputFilename] = useState("");
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [useGpu, setUseGpu] = useState(true);

  // --- Restore quality ---
  useEffect(() => {
    if (!isOpen) return;
    const savedQuality = localStorage.getItem("synthesis_quality");
    if (savedQuality) {
      setQuality(savedQuality as "high" | "balanced" | "small");
    }
  }, [isOpen]);

  // Reset trim when video changes or dialog opens
  useEffect(() => {
    if (isOpen) {
      setTrimStart(0);
      setTrimEnd(0);
    }
  }, [isOpen, videoPath]);

  // --- Persist quality ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("synthesis_quality", quality);
  }, [quality]);

  // --- Restore GPU preference ---
  useEffect(() => {
    if (!isOpen) return;
    const saved = localStorage.getItem("synthesis_use_gpu");
    if (saved !== null) setUseGpu(saved === "true");
  }, [isOpen]);

  // --- Persist GPU preference ---
  useEffect(() => {
    if (!isInitialized.current) return;
    localStorage.setItem("synthesis_use_gpu", String(useGpu));
  }, [useGpu]);

  // --- Initialize output path from video path ---
  useEffect(() => {
    if (!isOpen || !videoPath) return;

    // Filename: default to current filename + _synthesized
    const name = videoPath.split(/[\\/]/).pop() || "video.mp4";
    const baseName = name.substring(0, name.lastIndexOf(".")) || name;
    const ext = name.substring(name.lastIndexOf("."));
    const defaultName = `${baseName}_synthesized${ext}`;
    setOutputFilename(defaultName);

    // Directory: last used or current video directory
    const lastDir = localStorage.getItem("last_synthesis_dir");
    const currentDir = videoPath.substring(
      0,
      Math.max(videoPath.lastIndexOf("\\"), videoPath.lastIndexOf("/")),
    );

    if (lastDir) {
      setOutputDir(lastDir);
    } else {
      setOutputDir(currentDir);
    }
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
  };
}
