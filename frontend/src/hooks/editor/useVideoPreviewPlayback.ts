import { useCallback, useEffect, useState } from "react";
import type React from "react";

export function useVideoPreviewPlayback({
  mediaUrl,
  videoRef,
  panelRef,
  onLoadedMetadata,
}: {
  mediaUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onLoadedMetadata?: () => void;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mediaSize, setMediaSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const syncPlaybackRate = () => setPlaybackRate(video.playbackRate);
    const syncPlaybackState = () => setIsPlaying(!video.paused);
    const syncVolumeState = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    syncPlaybackRate();
    syncPlaybackState();
    syncVolumeState();
    video.addEventListener("ratechange", syncPlaybackRate);
    video.addEventListener("play", syncPlaybackState);
    video.addEventListener("pause", syncPlaybackState);
    video.addEventListener("volumechange", syncVolumeState);
    return () => {
      video.removeEventListener("ratechange", syncPlaybackRate);
      video.removeEventListener("play", syncPlaybackState);
      video.removeEventListener("pause", syncPlaybackState);
      video.removeEventListener("volumechange", syncVolumeState);
    };
  }, [mediaUrl, videoRef]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === panelRef.current);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, [panelRef]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    setDuration(video.duration || 0);
  }, [videoRef]);

  const handleLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    setMediaSize({ width: video.videoWidth || 0, height: video.videoHeight || 0 });
    setDuration(video.duration || 0);
    setPlaybackRate(video.playbackRate);
    onLoadedMetadata?.();
  }, [onLoadedMetadata]);

  const playPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, [videoRef]);

  const seek = useCallback((nextTime: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextTime)) return;
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [videoRef]);

  const setRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
    setPlaybackRate(rate);
  }, [videoRef]);

  const setPlaybackVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(nextVolume)) return;
    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVolume(nextVolume);
    setIsMuted(video.muted);
  }, [videoRef]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, [videoRef]);

  const toggleFullscreen = useCallback(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (document.fullscreenElement === panel) {
      void document.exitFullscreen();
      setIsFullscreen(false);
    } else {
      void panel.requestFullscreen();
      setIsFullscreen(true);
    }
  }, [panelRef]);

  return {
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    isPlaying,
    isFullscreen,
    mediaSize,
    handleTimeUpdate,
    handleLoadedMetadata,
    playPause,
    seek,
    setRate,
    setPlaybackVolume,
    toggleMute,
    toggleFullscreen,
  };
}
