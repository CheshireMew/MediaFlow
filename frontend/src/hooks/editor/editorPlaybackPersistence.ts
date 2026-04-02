import {
  parseVersionedSnapshot,
  serializeVersionedSnapshot,
} from "../../services/persistence/versionedSnapshot";
import { TASK_LIFECYCLE } from "../../contracts/runtimeContracts";

const EDITOR_PLAYBACK_SNAPSHOT_VERSION = 1;
const EDITOR_PLAYBACK_SNAPSHOT_LIFECYCLE = {
  currentTime: TASK_LIFECYCLE.history_only,
} as const;
const EDITOR_PLAYBACK_RATE_VERSION = 1;
const EDITOR_PLAYBACK_RATE_LIFECYCLE = {
  playbackRate: TASK_LIFECYCLE.history_only,
} as const;

type EditorPlaybackSnapshot = {
  currentTime: number;
};

type EditorPlaybackRateSnapshot = {
  playbackRate: number;
};

function getEditorPlaybackSnapshotKey(currentFilePath: string) {
  return `editor_playback_snapshot_${currentFilePath}`;
}

function getEditorPlaybackRateKey() {
  return "editor_playback_rate";
}

export function restoreEditorPlaybackTime(currentFilePath: string) {
  const snapshot = parseVersionedSnapshot<EditorPlaybackSnapshot>(
    localStorage.getItem(getEditorPlaybackSnapshotKey(currentFilePath)),
    EDITOR_PLAYBACK_SNAPSHOT_VERSION,
  );
  return snapshot?.currentTime ?? 0;
}

export function restoreEditorPlaybackRate() {
  const snapshot = parseVersionedSnapshot<EditorPlaybackRateSnapshot>(
    localStorage.getItem(getEditorPlaybackRateKey()),
    EDITOR_PLAYBACK_RATE_VERSION,
  );
  return snapshot?.playbackRate ?? 1;
}

export function persistEditorPlaybackTime(
  currentFilePath: string,
  currentTime: number,
) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    return;
  }

  localStorage.setItem(
    getEditorPlaybackSnapshotKey(currentFilePath),
    serializeVersionedSnapshot(
      EDITOR_PLAYBACK_SNAPSHOT_VERSION,
      {
        currentTime,
      },
      EDITOR_PLAYBACK_SNAPSHOT_LIFECYCLE,
    ),
  );
}

export function persistEditorPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return;
  }

  localStorage.setItem(
    getEditorPlaybackRateKey(),
    serializeVersionedSnapshot(
      EDITOR_PLAYBACK_RATE_VERSION,
      {
        playbackRate,
      },
      EDITOR_PLAYBACK_RATE_LIFECYCLE,
    ),
  );
}
