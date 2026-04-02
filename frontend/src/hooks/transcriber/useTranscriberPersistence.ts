import { useEffect } from "react";

import { parseVersionedSnapshot, serializeVersionedSnapshot } from "../../services/persistence/versionedSnapshot";
import type { ElectronFile } from "../../types/electron";
import type { TranscribeResult } from "../../types/transcriber";
import { TASK_LIFECYCLE } from "../../contracts/runtimeContracts";
import {
  mediaReferenceFromElectronFile,
  toElectronFile,
} from "../../services/ui/mediaReference";
import { normalizeTranscribeResult } from "../../services/ui/transcribeResult";
import { attachElectronFileSource } from "../../services/ui/electronFileSource";

const TRANSCRIBER_SNAPSHOT_KEY = "transcriber_snapshot";
const TRANSCRIBER_SNAPSHOT_VERSION = 2;
const LEGACY_TRANSCRIBER_SNAPSHOT_VERSION = 1;

type TranscriberSnapshotPayload = {
  result: TranscribeResult | null;
  file: ReturnType<typeof mediaReferenceFromElectronFile>;
};

const TRANSCRIBER_SNAPSHOT_LIFECYCLE = {
  file: TASK_LIFECYCLE.history_only,
  result: TASK_LIFECYCLE.history_only,
} as const;

type LegacyTranscriberSnapshotPayload = {
  result?: TranscribeResult | null;
  file?: ReturnType<typeof mediaReferenceFromElectronFile>;
};

function normalizeTranscriberSnapshotPayload(
  snapshot: LegacyTranscriberSnapshotPayload | null,
): TranscriberSnapshotPayload | null {
  if (!snapshot) {
    return null;
  }

  return {
    result: snapshot.result ?? null,
    file: snapshot.file ?? null,
  };
}

export function restoreStoredTranscriberSnapshot(): TranscriberSnapshotPayload | null {
  const snapshot = normalizeTranscriberSnapshotPayload(
    parseVersionedSnapshot<TranscriberSnapshotPayload>(
      localStorage.getItem(TRANSCRIBER_SNAPSHOT_KEY),
      TRANSCRIBER_SNAPSHOT_VERSION,
    ),
  );
  if (snapshot) {
    return snapshot;
  }

  const legacySnapshot = normalizeTranscriberSnapshotPayload(
    parseVersionedSnapshot<LegacyTranscriberSnapshotPayload>(
      localStorage.getItem(TRANSCRIBER_SNAPSHOT_KEY),
      LEGACY_TRANSCRIBER_SNAPSHOT_VERSION,
    ),
  );
  if (legacySnapshot) {
    localStorage.setItem(
      TRANSCRIBER_SNAPSHOT_KEY,
      serializeVersionedSnapshot(
        TRANSCRIBER_SNAPSHOT_VERSION,
        legacySnapshot,
        TRANSCRIBER_SNAPSHOT_LIFECYCLE,
      ),
    );
  }

  return legacySnapshot;
}

export function restoreStoredTranscriberFile(): ElectronFile | null {
  const snapshot = restoreStoredTranscriberSnapshot();
  const reference = snapshot?.file;
  return reference
    ? attachElectronFileSource(toElectronFile(reference), "transcriber_snapshot")
    : null;
}

export function restoreStoredTranscriberResult(): TranscribeResult | null {
  const snapshot = restoreStoredTranscriberSnapshot();
  return normalizeTranscribeResult(snapshot?.result ?? null, snapshot?.file ?? null);
}

export function useTranscriberPersistence(params: {
  result: TranscribeResult | null;
  file: ElectronFile | null;
}) {
  const { result, file } = params;

  useEffect(() => {
    const fileReference = mediaReferenceFromElectronFile(file);
    localStorage.setItem(
      TRANSCRIBER_SNAPSHOT_KEY,
      serializeVersionedSnapshot(
        TRANSCRIBER_SNAPSHOT_VERSION,
        {
          result,
          file: fileReference,
        } satisfies TranscriberSnapshotPayload,
        TRANSCRIBER_SNAPSHOT_LIFECYCLE,
      ),
    );
  }, [file, result]);
}
