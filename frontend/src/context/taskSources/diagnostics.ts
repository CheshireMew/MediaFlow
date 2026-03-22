import type { TaskOwnerMode } from "../../contracts/runtimeContracts";

export type TaskSourceDiagnostic = {
  ignoredTaskCount: number;
  lastIssue: {
    reason: "contract_version" | "owner_mode";
    source: string;
    taskId: string;
    expected: string;
    received: string;
    ownerMode?: TaskOwnerMode;
  } | null;
};

let state: TaskSourceDiagnostic = {
  ignoredTaskCount: 0,
  lastIssue: null,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getTaskSourceDiagnosticState() {
  return state;
}

export function subscribeTaskSourceDiagnostics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetTaskSourceDiagnostics() {
  state = {
    ignoredTaskCount: 0,
    lastIssue: null,
  };
  emit();
}

export function reportTaskSourceIssue(issue: TaskSourceDiagnostic["lastIssue"]) {
  state = {
    ignoredTaskCount: state.ignoredTaskCount + 1,
    lastIssue: issue,
  };
  emit();
}
