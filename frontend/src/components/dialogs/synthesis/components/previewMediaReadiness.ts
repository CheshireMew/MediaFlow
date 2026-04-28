import type { PreviewMediaState } from "../hooks/usePreviewMediaState";

export function isCurrentMediaMetadataReady(
  mediaUrl: string | null,
  mediaState: PreviewMediaState,
) {
  return (
    mediaUrl !== null &&
    mediaState.url === mediaUrl &&
    mediaState.hasMetadata &&
    !mediaState.hasError
  );
}

export function isCurrentMediaFrameReady(
  mediaUrl: string | null,
  mediaState: PreviewMediaState,
) {
  return (
    mediaUrl !== null &&
    mediaState.url === mediaUrl &&
    mediaState.hasFrame &&
    !mediaState.hasError
  );
}
