export function formatMediaPlaybackTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

export function formatOptionalMediaPlaybackTime(seconds: number) {
  return Number.isFinite(seconds) && seconds > 0
    ? formatMediaPlaybackTime(seconds)
    : "--:--";
}
