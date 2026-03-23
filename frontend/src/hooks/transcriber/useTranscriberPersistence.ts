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
const TRANSCRIBER_SNAPSHOT_VERSION = 1;

type TranscriberSnapshotPayload = {
  engine: "builtin" | "cli";
  model: string;
  device: string;
  result: TranscribeResult | null;
  file: ReturnType<typeof mediaReferenceFromElectronFile>;
};

const TRANSCRIBER_SNAPSHOT_LIFECYCLE = {
  engine: TASK_LIFECYCLE.history_only,
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
        engine: snapshot.engine ?? "builtin",
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
  return reference
    ? attachElectronFileSource(toElectronFile(reference), "transcriber_snapshot")
    : null;
}

export function restoreStoredTranscriberResult(): TranscribeResult | null {
  const snapshot = restoreStoredTranscriberSnapshot();
  return normalizeTranscribeResult(snapshot?.result ?? null, snapshot?.file ?? null);
}

export function useTranscriberPersistence(params: {
  engine: "builtin" | "cli";
  model: string;
  device: string;
  result: TranscribeResult | null;
  file: ElectronFile | null;
}) {
  const { engine, model, device, result, file } = params;

  useEffect(() => {
    const fileReference = mediaReferenceFromElectronFile(file);
    localStorage.setItem(
      TRANSCRIBER_SNAPSHOT_KEY,
      serializeVersionedSnapshot(
        TRANSCRIBER_SNAPSHOT_VERSION,
        {
          engine,
          model,
          device,
          result,
          file: fileReference,
        } satisfies TranscriberSnapshotPayload,
        TRANSCRIBER_SNAPSHOT_LIFECYCLE,
      ),
    );
  }, [device, engine, file, model, result]);
}
