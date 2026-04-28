# Desktop Worker Concurrency Execution Plan

## Purpose

Eliminate the desktop runtime's global single-lane task execution without changing renderer task semantics or falling back to the local FastAPI task queue.

The current Electron desktop runtime owns desktop tasks in `frontend/electron/desktop/workerSupervisor.ts`, but it dispatches tracked work through one Python stdio worker and one `activeTaskId`. Any long-running transcribe, translate, synthesize, download, OCR, enhance, or clean task blocks every other tracked task.

This plan replaces that model with bounded concurrent worker execution while preserving:

- desktop task snapshots and task events
- pause, resume, cancel, and delete behavior
- request/response correlation by task id
- worker protocol compatibility during migration
- separate web/backend runtime behavior

## Current State

### Electron main process

Current main-process ownership:

- `DesktopWorkerSupervisor`
  - starts one Python worker process
  - owns `desktopWorkerRequests`
  - owns `DesktopWorkerTaskQueue`
  - writes JSON requests to one worker stdin
  - reads protocol lines from one worker stdout
- `DesktopWorkerTaskQueue`
  - stores `activeTaskId: string | null`
  - stores `queuedTaskIds: string[]`
  - stores `pausedTasks`
  - exposes snapshots through `listTasks`
- `taskPlans`
  - pause/cancel of active task restarts the single worker process
  - queued task pause/cancel is local queue mutation only

Current blocker:

```ts
if (
  !this.desktopWorkerReady ||
  this.taskQueue.activeTaskId ||
  !this.desktopWorkerProcess?.stdin?.writable
) {
  return;
}
```

This makes tracked desktop work globally serial.

### Python worker

Current Python worker behavior:

- `backend/desktop_worker.py` reads stdin line by line.
- `handle_request` dispatches synchronously.
- `dispatch_worker_command` calls one registered handler directly.
- Long-running handlers block the stdin loop.
- Progress is emitted through stdout protocol events.

This means a single Python worker cannot accept a second command while a heavy command is running.

## Target Architecture

Use **bounded worker slots** in Electron main. Each slot owns one Python worker process and can run one tracked task at a time.

Main process becomes the scheduler:

- keep one lightweight control path for non-tracked commands
- keep a pool of tracked worker slots for heavy tasks
- dispatch at most `DESKTOP_TASK_MAX_CONCURRENT` tracked tasks
- preserve the existing one-task-per-worker-process assumption

Python workers stay synchronous in phase 1. This avoids rewriting every backend command handler to async/threaded execution.

### Why Worker Slots Instead Of In-Process Python Concurrency

Python command handlers touch shared runtime services, model managers, ffmpeg subprocesses, file outputs, and progress callbacks. Making one Python worker handle multiple tasks would require thread-safety across those services.

Multiple worker processes give cleaner isolation:

- cancel can still kill one worker process
- a crash affects one active task, not the whole queue
- stdout protocol remains request/response based
- existing synchronous handlers remain valid
- CPU/GPU contention can be managed at scheduler level

## Desired Semantics

### Concurrency

Default desktop concurrency should match backend behavior:

- default: `2`
- configurable through Electron environment or shared runtime setting
- hard minimum: `1`
- hard maximum: conservative cap such as `4` until GPU-heavy workloads are profiled

Recommended environment variable:

```text
MEDIAFLOW_DESKTOP_TASK_MAX_CONCURRENT=2
```

### Queueing

Queued tasks should preserve FIFO order.

When any worker slot becomes idle:

1. take the next queued task
2. bind it to that slot
3. emit `running`
4. send the request to the slot worker stdin
5. update remaining queued task positions

### Task Snapshot

Task snapshot must represent multiple active tasks.

Replace:

```ts
activeTaskId: string | null
```

with:

```ts
activeTasks: Map<string, ActiveDesktopWorkerTask>
```

`ActiveDesktopWorkerTask` should include:

```ts
type ActiveDesktopWorkerTask = {
  taskId: string;
  slotId: string;
  command: DesktopTaskType;
  payload: Record<string, unknown>;
  startedAt: number;
};
```

The renderer task contract should not need a breaking change if it already consumes task status updates. Queue internals can change without changing public `Task`.

### Cancellation

Queued task:

- remove from queue
- delete request
- emit delete or cancelled state according to current UI semantics
- reject the pending promise

Active task:

- find owning worker slot by task id
- stop only that worker process
- mark the task cancelled
- reject the pending promise
- replace the killed slot with a fresh worker
- dispatch next queued task when replacement is ready

Do not restart unrelated worker slots.

### Pause / Resume

Queued task pause:

- remove from queue
- move to `pausedTasks`
- reject or settle request according to current behavior

Active task pause:

- same as cancel at process level, but store resumable payload in `pausedTasks`
- mark task status `paused`
- kill only the owning slot
- replacement slot becomes available after restart

Resume:

- remove from `pausedTasks`
- re-enqueue with original task id and created time
- do not create a duplicate task id

### Worker Crash

If an idle slot exits:

- restart it
- no task failure emitted

If an active slot exits unexpectedly:

- fail only the active task bound to that slot
- remove the request
- persist failure to history
- restart that slot
- continue dispatching queued tasks to healthy slots

If all slots fail repeatedly:

- stop restarting after a bounded retry threshold
- fail queued tracked tasks with a clear desktop-worker-unavailable error
- leave the app responsive

### Non-Tracked Commands

Non-tracked commands include ping, settings queries, glossary, cookies, and similar short control calls.

Do not send non-tracked commands to a busy tracked worker slot.

Recommended phase 1 behavior:

- keep a dedicated `controlWorker` for non-tracked commands
- tracked tasks use `workerSlots`
- control worker may still execute synchronous commands, but will no longer be blocked by long tracked tasks

Commands that are currently non-tracked but long-running must be audited. Any long-running command should become tracked or move to a background/progress command.

Known command to audit:

- `install_faster_whisper_cli`
- `update_yt_dlp`
- media analysis commands if they perform network or heavy parsing

## Implementation Phases

## Phase 0: Lock Current Behavior With Tests

Before refactoring, add tests around current queue semantics.

### Electron unit tests

Add or extend tests for:

- queue emits `pending` with correct queue positions
- active task cancel restarts only the execution lane in the future model
- queued cancel removes only queued task
- pause active stores payload with original task id
- resume reuses original task id
- response finalizes history and emits final task update
- worker exit fails active task and queued behavior is deterministic

Recommended files:

- `frontend/electron/desktop/workerTaskQueue.test.ts`
- `frontend/electron/desktop/workerSupervisor.test.ts`
- `frontend/electron/desktop/taskPlans.test.ts`

If Electron main-process tests are difficult to run in current Vitest setup, extract pure scheduling logic first and test that pure module.

### Python worker tests

Keep existing Python command tests. Phase 1 should not require Python handler behavior changes.

## Phase 1: Extract Worker Slot Abstraction

Create a class that owns one Python worker process.

Suggested file:

```text
frontend/electron/desktop/workerSlot.ts
```

Suggested interface:

```ts
type DesktopWorkerSlotState = "starting" | "idle" | "busy" | "stopped";

type WorkerSlotRequest = {
  id: string;
  command: string;
  payload: Record<string, unknown>;
};

class DesktopWorkerSlot {
  readonly id: string;
  state: DesktopWorkerSlotState;
  activeTaskId: string | null;

  start(): void;
  stop(mode: "restart" | "shutdown"): void;
  waitUntilReady(timeoutMs?: number): Promise<void>;
  send(request: WorkerSlotRequest): void;
}
```

Responsibilities:

- start one worker process using `startDesktopWorkerProcess`
- parse worker protocol lines using `handleDesktopWorkerProtocolLine`
- expose callbacks:
  - `onReady(slotId)`
  - `onEvent(slotId, event, payload)`
  - `onTaskEvent(slotId, taskId, payload)`
  - `onResponse(slotId, response)`
  - `onExit(slotId, code)`
  - `onLog(slotId, line)`
- track readiness waiters for only that slot
- know whether it is idle or busy

Move single-worker process fields out of `DesktopWorkerSupervisor`:

- `desktopWorkerProcess`
- `desktopWorkerReady`
- `desktopWorkerReadyWaiters`
- `desktopWorkerStopMode`

These become slot-local.

## Phase 2: Replace Queue Active State

Modify `DesktopWorkerTaskQueue`.

Replace:

```ts
activeTaskId: string | null
```

with:

```ts
readonly activeTasks = new Map<string, ActiveDesktopWorkerTask>();
```

Add methods:

```ts
markActiveStarted(taskId, request, slotId, emitTask)
clearActiveIf(taskId)
getActiveTask(taskId)
activeTaskIds()
hasActiveCapacity(maxConcurrent)
```

`listTasks` should pass active task ids into `getDesktopTaskSnapshot`.

If `getDesktopTaskSnapshot` currently accepts only one `activeTaskId`, update it to accept an iterable or set.

Migration rule:

- no renderer task shape change unless strictly necessary
- internal snapshot builder can infer `running` from `activeTaskIds`

## Phase 3: Add Scheduler In Supervisor

`DesktopWorkerSupervisor` should own:

```ts
private readonly trackedSlots = new Map<string, DesktopWorkerSlot>();
private readonly controlSlot: DesktopWorkerSlot;
private readonly taskAssignments = new Map<string, string>(); // taskId -> slotId
private readonly maxConcurrentTrackedTasks = resolveDesktopMaxConcurrency();
```

Scheduler loop:

```ts
private dispatchQueuedTrackedTasks() {
  for (const slot of this.idleReadyTrackedSlots()) {
    const next = this.taskQueue.nextTask(this.desktopWorkerRequests);
    if (!next) return;
    if (!next.request) continue;

    this.taskAssignments.set(next.taskId, slot.id);
    this.taskQueue.markActiveStarted(next.taskId, next.request, slot.id, emit);
    this.taskQueue.syncQueuedTasks(...);
    slot.send({
      id: next.taskId,
      command: next.request.command,
      payload: next.request.payload,
    });
  }
}
```

Call scheduler when:

- a tracked task is enqueued
- any tracked slot becomes ready
- any tracked slot finishes a response
- any tracked slot restarts after cancel/pause/crash
- a queued task is removed and positions need syncing

## Phase 4: Route Non-Tracked Commands

Change `request` routing:

- tracked command:
  - enqueue into `DesktopWorkerTaskQueue`
  - schedule onto tracked slots
- non-tracked command:
  - send directly to `controlSlot`
  - do not enter tracked queue

Control slot must support multiple outstanding non-tracked requests only if the Python worker can process them concurrently. It cannot today.

Therefore phase 1 control slot should have a small serial queue:

```ts
controlQueue: string[]
controlActiveRequestId: string | null
```

This still improves responsiveness because heavy tracked tasks no longer occupy control slot.

## Phase 5: Update Pause / Cancel Plans

Update `DesktopTaskCollections`:

```ts
type DesktopTaskCollections = {
  activeTaskIds: Set<string>;
  queuedTaskIds: string[];
  pausedTasks: Map<string, PausedDesktopWorkerTask>;
  requests: Map<string, DesktopWorkerRuntimeRequest>;
};
```

`planPauseDesktopTask` and `planCancelDesktopTask` should check:

```ts
collections.activeTaskIds.has(taskId)
```

Supervisor action for active task:

1. look up `slotId = taskAssignments.get(taskId)`
2. remove request if plan says so
3. emit planned task update
4. reject pending promise
5. stop only that slot with `restart`
6. clear task assignment
7. clear active task from queue

Do not kill the control worker or other tracked slots.

## Phase 6: History And Recovery

Current history store records final task states. Keep that behavior.

For concurrent execution, ensure:

- final response upserts only the completed task
- crash failure upserts only assigned task
- queue positions update after any dispatch or removal
- task ids remain stable across pause/resume
- app restart does not attempt to resurrect active tasks from dead worker processes unless a separate recovery feature is explicitly designed

Recommended startup behavior:

- historical completed/failed/cancelled tasks remain visible
- active tasks from previous app process are marked failed or stale if they appear in persisted state
- queued tasks are not silently resumed after app restart unless the user explicitly retries

## Phase 7: Python Worker Protocol Compatibility

Keep protocol shape:

```json
{"id":"task-id","command":"transcribe","payload":{}}
```

Worker response stays:

```json
{"type":"response","id":"task-id","ok":true,"result":{}}
```

Worker progress event stays:

```json
{"type":"event","id":"task-id","event":"transcribe_progress","payload":{}}
```

No Python protocol migration is required for phase 1.

Optional phase 2 protocol additions:

- worker process id or slot id in Electron logs only, not protocol
- structured fatal error event before worker exit if possible
- explicit `cancel` command only if Python handlers become cooperative later

## Phase 8: Resource-Aware Scheduling

After basic concurrency works, add command resource classes.

Suggested map:

```ts
type DesktopTaskResourceClass = "cpu" | "gpu" | "io" | "network" | "control";

const DESKTOP_TASK_RESOURCE_CLASS: Record<DesktopTaskType, DesktopTaskResourceClass> = {
  transcribe: "cpu",
  translate: "network",
  synthesize: "gpu",
  download: "network",
  extract: "cpu",
  enhance: "gpu",
  clean: "gpu",
};
```

Initial rule:

- total tracked concurrency <= 2
- GPU-heavy concurrency <= 1
- network concurrency <= 2

This avoids running synthesize plus enhance plus clean at the same time on one GPU.

Do not add this before basic worker slots are stable.

## Phase 9: Tests And Verification

### Unit tests

Required tests:

- two tracked tasks dispatch to two slots when concurrency is 2
- third tracked task remains queued
- response from slot A dispatches next queued task without affecting slot B
- active cancel kills only assigned slot
- queued cancel does not kill any slot
- active pause kills only assigned slot and stores paused payload
- resume re-enqueues same task id
- slot crash fails only assigned task
- control request completes while tracked task is running
- queue positions update after multi-slot dispatch

### Integration tests

Use fake worker process adapter before testing real Python process.

Refactor `startDesktopWorkerProcess` behind an injected factory:

```ts
type DesktopWorkerProcessFactory = typeof startDesktopWorkerProcess;
```

`DesktopWorkerSupervisor` constructor can accept the factory for tests.

Test fake worker behavior:

- emits `ready`
- captures stdin writes
- emits progress for a specific task id
- emits response out of order
- emits close while active

### Manual QA

Run in desktop dev mode:

1. Start a long transcribe task.
2. Start translate while transcribe is running.
3. Confirm both show `running` when concurrency is 2.
4. Start synthesize as third task.
5. Confirm it remains queued or starts depending on resource rules.
6. Cancel transcribe.
7. Confirm translate continues.
8. Confirm queued synthesize starts if capacity opens.
9. Pause active synthesize.
10. Confirm only that worker restarts.
11. Resume synthesize.
12. Confirm original task id is reused.
13. Open settings and fetch desktop runtime info while long task runs.
14. Confirm UI remains responsive.

### Build checks

Run:

```powershell
npm run electron:build --prefix frontend
npm run lint --prefix frontend
npm run test --prefix frontend
npx tsc --noEmit -p tsconfig.app.json
```

From `frontend` for the last command:

```powershell
cd frontend
npx tsc --noEmit -p tsconfig.app.json
```

Run backend tests if Python command contracts are touched:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
```

## Migration Checklist

1. Add tests around current task queue and task plan behavior.
2. Extract `DesktopWorkerSlot`.
3. Inject worker process factory for tests.
4. Split supervisor into control slot plus tracked slots.
5. Replace single `activeTaskId` with active task map.
6. Update task snapshot builder to accept multiple active task ids.
7. Update dispatch loop to fill idle slots.
8. Update response handling to clear only assigned active task.
9. Update crash handling to fail only assigned task.
10. Update pause/cancel to kill only assigned slot.
11. Add control command serial queue.
12. Add configurable desktop concurrency.
13. Add resource-aware scheduling only after basic pool is stable.
14. Run full frontend and backend verification.
15. Manually test concurrent desktop workflows.

## Rollback Plan

Keep the old single-slot behavior available through configuration during migration:

```text
MEDIAFLOW_DESKTOP_TASK_MAX_CONCURRENT=1
```

This is not a compatibility layer in the final architecture. It is a safe operational fallback while the worker pool is being validated. Once concurrency is stable, the code should still use the same pool scheduler with one slot rather than restoring the old `activeTaskId` path.

## Acceptance Criteria

The migration is complete only when all of these are true:

- no tracked desktop scheduler code depends on a single global `activeTaskId`
- two independent tracked desktop tasks can run concurrently
- cancelling one active task does not interrupt another active task
- control commands can complete while tracked tasks are running
- queue positions remain correct with multiple active tasks
- task history receives correct final state for each task
- worker crash failure is scoped to the crashed slot's active task
- `MEDIAFLOW_DESKTOP_TASK_MAX_CONCURRENT=1` still behaves like bounded one-slot scheduling without old special-case code
- frontend lint, typecheck, tests, and Electron build pass
- manual desktop QA confirms transcribe/translate/synthesize/download/OCR workflows remain usable

## Risks

### Resource Contention

Running multiple heavy jobs can saturate CPU, GPU, disk, or model memory.

Mitigation:

- start with concurrency 2
- add GPU-heavy concurrency cap
- expose concurrency as an advanced setting only after profiling

### Shared Runtime State

Multiple Python processes may read and write the same settings, cache, model, or task output directories.

Mitigation:

- keep per-task output paths unique
- avoid concurrent writes to global settings from tracked tasks
- use existing file locks where available
- add locks around model downloads or tool installs if those become tracked

### Duplicate Progress Or Late Responses

Killed workers may emit buffered output after supervisor has cancelled a task.

Mitigation:

- ignore responses for unknown request ids
- bind task id to slot id and ignore mismatched late events
- remove request before killing active slot

### Startup Cost

Starting multiple Python workers increases memory and startup time.

Mitigation:

- lazy-start tracked slots up to configured concurrency
- keep one control slot warm
- prewarm additional tracked slots after first window show if needed

### GPU Tool Conflicts

FFmpeg, OCR, enhancement, and synthesis may compete for GPU resources.

Mitigation:

- phase 1 total concurrency only
- phase 2 resource class scheduling
- default GPU-heavy concurrency 1

## Non-Goals

- Do not migrate desktop runtime back to local FastAPI queue.
- Do not make Python command handlers async in phase 1.
- Do not introduce task recovery across app restart unless designed separately.
- Do not change renderer task UI contract unless queue state cannot be represented otherwise.
- Do not solve sandbox/preload security as part of this concurrency migration.
