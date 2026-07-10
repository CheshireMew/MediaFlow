export function stopVideoAtClipEnd(
  video: HTMLVideoElement,
  clipEnd: number,
  toleranceSeconds = 0.01,
): boolean {
  if (!Number.isFinite(clipEnd) || video.currentTime + toleranceSeconds < clipEnd) {
    return false;
  }

  video.pause();
  const mediaEnd = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(clipEnd, video.duration)
    : clipEnd;
  video.currentTime = mediaEnd;
  return true;
}
