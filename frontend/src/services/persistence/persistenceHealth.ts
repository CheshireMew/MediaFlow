export type PersistenceFailureScope =
  | "workspace-read"
  | "workspace-write"
  | "preferences-write";

export type PersistenceHealthEvent = {
  scope: PersistenceFailureScope;
  status: "failed" | "recovered";
};

type PersistenceHealthListener = (event: PersistenceHealthEvent) => void;

const activeFailures = new Map<PersistenceFailureScope, string>();
const listeners = new Set<PersistenceHealthListener>();

function resolveFailureIdentity(error: unknown) {
  return error instanceof Error ? `${error.name}:${error.message}` : String(error);
}

export function reportPersistenceFailure(
  scope: PersistenceFailureScope,
  error: unknown,
) {
  const identity = resolveFailureIdentity(error);
  if (activeFailures.get(scope) === identity) {
    return;
  }
  activeFailures.set(scope, identity);
  for (const listener of listeners) {
    listener({ scope, status: "failed" });
  }
}

export function clearPersistenceFailure(scope: PersistenceFailureScope) {
  if (!activeFailures.delete(scope)) {
    return;
  }
  for (const listener of listeners) {
    listener({ scope, status: "recovered" });
  }
}

export function subscribePersistenceHealth(listener: PersistenceHealthListener) {
  listeners.add(listener);
  for (const scope of activeFailures.keys()) {
    listener({ scope, status: "failed" });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function resetPersistenceHealthForTests() {
  activeFailures.clear();
  listeners.clear();
}
