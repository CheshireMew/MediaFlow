import {
  parseVersionedSnapshot,
  serializeVersionedSnapshot,
} from "../../services/persistence/versionedSnapshot";
import { TASK_LIFECYCLE } from "../../contracts/runtimeContracts";
import {
  readWorkspaceStateValue,
  writeWorkspaceStateValue,
} from "../../services/persistence/workspaceState";
import type { MediaReference } from "../../services/ui/mediaReference";

const EDITOR_PLAYBACK_RATE_VERSION = 1;
const EDITOR_PLAYBACK_RATE_LIFECYCLE = {
  playbackRate: TASK_LIFECYCLE.history_only,
} as const;

type EditorPlaybackRateSnapshot = {
  playbackRate: number;
};

type EditorPlaybackHistory = Record<
  string,
  { currentTime: number; updatedAt: number }
>;

const EDITOR_PLAYBACK_HISTORY_KEY = "editor-playback-history";
const MAX_PLAYBACK_HISTORY = 50;

function getEditorPlaybackRateKey() {
  return "editor_playback_rate";
}

export function restoreEditorPlaybackTime(video: MediaReference) {
  const history =
    readWorkspaceStateValue<EditorPlaybackHistory>(EDITOR_PLAYBACK_HISTORY_KEY) ?? {};
  return history[video.path]?.currentTime ?? 0;
}

export function restoreEditorPlaybackRate() {
  const snapshot = parseVersionedSnapshot<EditorPlaybackRateSnapshot>(
    readWorkspaceStateValue<string>(getEditorPlaybackRateKey()),
    EDITOR_PLAYBACK_RATE_VERSION,
  );
  return snapshot?.playbackRate ?? 1;
}

export function persistEditorPlaybackTime(
  video: MediaReference,
  currentTime: number,
) {
  if (!Number.isFinite(currentTime) || currentTime <= 0) {
    return;
  }

  const history = {
    ...(readWorkspaceStateValue<EditorPlaybackHistory>(EDITOR_PLAYBACK_HISTORY_KEY) ?? {}),
    [video.path]: { currentTime, updatedAt: Date.now() },
  };
  const boundedHistory = Object.fromEntries(
    Object.entries(history)
      .sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_PLAYBACK_HISTORY),
  );
  writeWorkspaceStateValue(EDITOR_PLAYBACK_HISTORY_KEY, boundedHistory);
}

export function persistEditorPlaybackRate(playbackRate: number) {
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return;
  }

  writeWorkspaceStateValue(
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
