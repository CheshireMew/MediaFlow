export type PersistenceFailureScope =
  | "workspace-read"
  | "workspace-write"
  | "preferences-write";

export type PersistenceHealthEvent = {
  scope: PersistenceFailureScope;
  status: "failed" | "recovered";
};

type PersistenceHealthListener = (event: PersistenceHealthEvent) => void;

type ActiveFailure = {
  announced: boolean;
  identity: string;
  timer: ReturnType<typeof setTimeout> | null;
};

export const PERSISTENCE_FAILURE_ALERT_DELAY_MS = 2_000;

const activeFailures = new Map<PersistenceFailureScope, ActiveFailure>();
const listeners = new Set<PersistenceHealthListener>();

function resolveFailureIdentity(error: unknown) {
  return error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

export function reportPersistenceFailure(
  scope: PersistenceFailureScope,
  error: unknown,
) {
  const identity = resolveFailureIdentity(error);
  const existing = activeFailures.get(scope);
  if (existing?.identity === identity) {
    return;
  }
  if (existing?.announced) {
    existing.identity = identity;
    return;
  }
  if (existing?.timer) clearTimeout(existing.timer);

  const failure: ActiveFailure = {
    announced: false,
    identity,
    timer: null,
  };
  failure.timer = setTimeout(() => {
    const current = activeFailures.get(scope);
    if (current !== failure) return;
    failure.timer = null;
    failure.announced = true;
    for (const listener of listeners) {
      listener({ scope, status: "failed" });
    }
  }, PERSISTENCE_FAILURE_ALERT_DELAY_MS);
  activeFailures.set(scope, failure);
}

export function clearPersistenceFailure(scope: PersistenceFailureScope) {
  const failure = activeFailures.get(scope);
  if (!failure) return;
  activeFailures.delete(scope);
  if (failure.timer) clearTimeout(failure.timer);
  if (!failure.announced) return;
  for (const listener of listeners) {
    listener({ scope, status: "recovered" });
  }
}

export function subscribePersistenceHealth(listener: PersistenceHealthListener) {
  listeners.add(listener);
  for (const [scope, failure] of activeFailures) {
    if (failure.announced) listener({ scope, status: "failed" });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function resetPersistenceHealthForTests() {
  for (const failure of activeFailures.values()) {
    if (failure.timer) clearTimeout(failure.timer);
  }
  activeFailures.clear();
  listeners.clear();
}
