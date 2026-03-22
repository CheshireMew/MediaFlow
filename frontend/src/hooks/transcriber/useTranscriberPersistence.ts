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

const TRANSCRIBER_SNAPSHOT_KEY = "transcriber_snapshot";
const TRANSCRIBER_SNAPSHOT_VERSION = 1;

type TranscriberSnapshotPayload = {
  model: string;
  device: string;
  result: TranscribeResult | null;
  file: ReturnType<typeof mediaReferenceFromElectronFile>;
};

const TRANSCRIBER_SNAPSHOT_LIFECYCLE = {
  model: TASK_LIFECYCLE.history_only,
  device: TASK_LIFECYCLE.history_only,
  file: TASK_LIFECYCLE.history_only,
  result: TASK_LIFECYCLE.history_only,
} as const;

export function restoreStoredTranscriberSnapshot(): TranscriberSnapshotPayload | null {
  const snapshot = parseVersionedSnapshot<TranscriberSnapshotPayload>(
    localStorage.getItem(TRANSCRIBER_SNAPSHOT_KEY),
    TRANSCRIBER_SNAPSHOT_VERSION,
  );
  return snapshot
    ? {
        model: snapshot.model,
        device: snapshot.device,
        result: snapshot.result,
        file: snapshot.file,
      }
    : null;
}

export function restoreStoredTranscriberFile(): ElectronFile | null {
  const snapshot = restoreStoredTranscriberSnapshot();
  const reference = snapshot?.file;
  return reference ? toElectronFile(reference) : null;
}

export function restoreStoredTranscriberResult(): TranscribeResult | null {
  const snapshot = restoreStoredTranscriberSnapshot();
  return normalizeTranscribeResult(snapshot?.result ?? null, snapshot?.file ?? null);
}

export function useTranscriberPersistence(params: {
  model: string;
  device: string;
  result: TranscribeResult | null;
  file: ElectronFile | null;
}) {
  const { model, device, result, file } = params;

  useEffect(() => {
    const fileReference = mediaReferenceFromElectronFile(file);
    localStorage.setItem(
      TRANSCRIBER_SNAPSHOT_KEY,
      serializeVersionedSnapshot(
        TRANSCRIBER_SNAPSHOT_VERSION,
        {
          model,
          device,
          result,
          file: fileReference,
        } satisfies TranscriberSnapshotPayload,
        TRANSCRIBER_SNAPSHOT_LIFECYCLE,
      ),
    );
  }, [device, file, model, result]);
}
