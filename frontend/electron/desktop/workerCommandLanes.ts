import desktopWorkerContract from "../../../contracts/desktop-worker-contract.json";
import type { DesktopTaskType } from "./taskTypes";

export type DesktopWorkerExecutionLane = "control" | "utility" | "task";

type ContractCommandDefinition = {
  workerCommand?: string;
  executionLane?: string;
};

const workerCommandLanes = new Map<string, DesktopWorkerExecutionLane>();

function normalizeExecutionLane(command: string, lane: string | undefined): DesktopWorkerExecutionLane {
  if (lane === "control" || lane === "utility" || lane === "task") {
    return lane;
  }
  throw new Error(`Desktop worker command ${command} is missing a valid executionLane.`);
}

for (const rawDefinition of Object.values(
  desktopWorkerContract.invocations,
) as ContractCommandDefinition[]) {
  if (!rawDefinition.workerCommand) {
    continue;
  }
  workerCommandLanes.set(
    rawDefinition.workerCommand,
    normalizeExecutionLane(rawDefinition.workerCommand, rawDefinition.executionLane),
  );
}

for (const [command, rawDefinition] of Object.entries(
  desktopWorkerContract.workerCommands ?? {},
) as Array<[string, ContractCommandDefinition]>) {
  workerCommandLanes.set(command, normalizeExecutionLane(command, rawDefinition.executionLane));
}

export function getDesktopWorkerExecutionLane(command: string): DesktopWorkerExecutionLane {
  const lane = workerCommandLanes.get(command);
  if (!lane) {
    throw new Error(`Unknown desktop worker command: ${command}`);
  }
  return lane;
}

export function isDesktopTaskCommand(command: string): command is DesktopTaskType {
  return getDesktopWorkerExecutionLane(command) === "task";
}
