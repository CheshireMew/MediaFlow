# MediaFlow Desktop Architecture Migration

## Goal

Reduce startup latency and fragility by moving from:

- `Electron UI`
- `spawned Python FastAPI/Uvicorn backend`
- `local HTTP/WebSocket calls`

to:

- `Electron UI`
- `Electron main-process orchestration`
- `Python worker process for heavy compute only`
- `IPC / stdio / named-pipe RPC instead of local HTTP for desktop`

This is a desktop-specific architecture plan. The existing FastAPI server can remain for dev/testing and, if needed later, a separate headless mode.

## Current State

### 2026-03 desktop runtime status

Desktop runtime is no longer a single-path "renderer -> local HTTP/WebSocket backend" model.

Desktop runtime task ownership is now explicit:

- `task_owner_mode = "desktop"`
- `desktop tasks`
  - owned only by Electron main plus Python desktop worker
  - synchronized through desktop task snapshots and desktop task events
- `backend`
  - remains a non-blocking capability fallback for desktop mode
  - must not be treated as a desktop task-list source

Current desktop renderer task semantics:

- `connected`
  - local desktop task source is ready
- `remoteTasksReady`
  - desktop startup no longer waits for backend health
  - in desktop mode this only reflects whether fallback backend integration is considered non-blocking
- `tasksSettled`
  - task state is sufficiently synchronized to safely conclude an active task no longer exists

Current backend polling behavior in desktop mode:

- backend task snapshots are not fetched in desktop owner mode
- backend task polling remains a backend/web-runtime concern only

### Current task source abstraction

Renderer task synchronization is now organized around a shared task source model instead of hard-coding desktop/backend branches inside `TaskProvider`.

Current source layers:

- `desktop source`
  - owns desktop snapshot loading
  - owns desktop event subscription
  - owns desktop task operations such as pause/resume/delete/clear
- `backend source`
  - owns backend snapshot loading
  - owns backend polling decision
  - owns backend task operations such as pause/resume/delete/clear
- `source state aggregation`
  - converts source readiness into renderer-facing state
  - currently produces:
    - `connected`
    - `remoteTasksReady`
    - `tasksSettled`

Current implementation entry points:

- [frontend/src/context/taskSources.ts](/E:/Work/Code/Mediaflow/frontend/src/context/taskSources.ts)
  - barrel export for the task source layer
- [frontend/src/context/taskSources/types.ts](/E:/Work/Code/Mediaflow/frontend/src/context/taskSources/types.ts)
  - shared source interfaces and bundle types
- [frontend/src/context/taskSources/shared.ts](/E:/Work/Code/Mediaflow/frontend/src/context/taskSources/shared.ts)
  - source-independent helpers
  - task ownership detection
  - snapshot application
  - state aggregation
- [frontend/src/context/taskSources/desktopSource.ts](/E:/Work/Code/Mediaflow/frontend/src/context/taskSources/desktopSource.ts)
  - desktop task source implementation
- [frontend/src/context/taskSources/backendSource.ts](/E:/Work/Code/Mediaflow/frontend/src/context/taskSources/backendSource.ts)
  - backend task source implementation
- [frontend/src/context/TaskProvider.tsx](/E:/Work/Code/Mediaflow/frontend/src/context/TaskProvider.tsx)
  - source composition and React wiring only

Maintenance rule:

- if a behavior belongs to one task source only, add it to that source implementation
- if a behavior is shared across sources, add it to `shared.ts`
- if a change only affects renderer-facing readiness semantics, prefer updating the aggregation helper before editing UI consumers
- `TaskProvider` should stay a composition layer, not regain source-specific branching

### What is already migrated off desktop HTTP/WebSocket

- desktop task submission and task progress for:
  - transcribe
  - translate
  - synthesize
  - download
  - OCR extract
  - enhance
  - clean
- editor desktop flows for:
  - peaks loading
  - silence detection
  - segment transcription
  - segment translation
  - watermark upload/load
- settings and provider management in desktop mode
- glossary management in desktop mode
- downloader URL analysis and cookie save in desktop mode

### What still intentionally remains as backend fallback

- non-desktop/web runtime task submission
- backend task CRUD endpoints
- backend task snapshot endpoints
- desktop fallback for APIs that still support web mode through `apiClient`

Packaged desktop rule from here:

- Python desktop worker is the primary execution path
- bundled FastAPI backend is fallback-only
- fallback backend must not block first paint, desktop task hydration, or worker handshake
- any feature that still needs the backend must declare itself as fallback explicitly instead of re-entering the startup critical path

Examples of backend fallback APIs still retained in renderer services:

- translation task submission/status for non-desktop mode
- glossary CRUD for non-desktop mode
- settings/provider endpoints for non-desktop mode
- task CRUD endpoints for backend-managed tasks
- editor preview and preprocessing endpoints that still exist as web/runtime fallback paths

### Compatibility inventory

Current compatibility reads that still remain during migration:

- renderer navigation/session payload
  - write path is normalized to ref-first session payloads
  - read path now accepts only ref-first payloads
- translator/transcriber/preprocessing task/result parsing
  - task snapshot recovery now requires producer-normalized `*_ref`
  - execution-side path fields still exist at API boundaries, but no longer act as renderer task identity fallback
- editor playback persistence
  - now reads only `editor_playback_snapshot_<path>`
  - legacy `playback_pos_<path>` compatibility read has been removed because no producer remains
- transcriber legacy snapshot keys
  - compatibility reads for `transcriber_model`, `transcriber_device`, `transcriber_result`, `transcriber_file`, and `transcriber_activeTaskId` have been removed
  - only `transcriber_snapshot` is now considered valid transcriber persistence input
- desktop persisted history
  - legacy desktop history is normalized on read before entering the renderer task snapshot
  - completed desktop translation history now synthesizes `context_ref`, `subtitle_ref`, and `output_ref` from legacy `context_path` and result-side `srt_path` when needed

Compatibility reads that should now be treated as deletion candidates first:

- any legacy field or storage key that no longer has a live producer
- any runtime-only field that was previously persisted and is now explicitly excluded from snapshots

### Remaining path-field inventory

The migration is no longer blocked by storage-key compatibility. The remaining compatibility surface is mostly path fields that still exist for execution or fallback matching.

Current path fields that still have live producers and should be treated as execution inputs, not media identity:

- frontend API request payloads
  - `video_path`
  - `srt_path`
  - `context_path`
  - `output_path`
  - reason they still exist:
    - backend and desktop execution handlers still need concrete filesystem input paths
  - exit condition:
    - keep these until execution boundaries can consume refs directly or until path resolution is fully centralized at the last execution hop
- backend request schemas and API handlers
  - editor, OCR, preprocessing, synthesis, translation HTTP endpoints still validate and execute on path fields
  - reason they still exist:
    - these endpoints are execution surfaces, not identity surfaces
  - exit condition:
    - only revisit if backend runtime stops receiving raw filesystem paths at the API boundary
- task/result compatibility mirrors
  - `TaskMeta.srt_path`
  - `TaskRequestParams.context_path`
  - reason they still exist:
    - desktop/backend producers and older persisted tasks may still emit them
    - renderer diagnostics may still expose them in raw payloads
  - exit condition:
    - remove only after execution/request boundaries no longer need the mirrored path fields at all

Current path compatibility reads that are now in the final cleanup zone:

- task media candidate aggregation
  - [frontend/src/services/ui/taskMedia.ts](/E:/Work/Code/Mediaflow/frontend/src/services/ui/taskMedia.ts)
  - no longer falls back to request-side `output_path`
  - `params.context_path` is no longer part of generic task-media candidate aggregation
  - next removal condition:
    - once raw request mirrors are no longer needed at execution boundaries
  - already removed:
    - `result.meta.file_path` is no longer used as a dedicated task-media context candidate because no stable task producer remains
    - `request_params.srt_path` is no longer treated as a standalone subtitle identity candidate in frontend task media aggregation
    - translation task media aggregation no longer scans arbitrary request string fields ending in `.srt` as fallback subtitle identity candidates
- task selector fallback matching
  - [frontend/src/hooks/tasks/taskSelectors.ts](/E:/Work/Code/Mediaflow/frontend/src/hooks/tasks/taskSelectors.ts)
  - current guardrail:
    - if a task already exposes a structured ref for the same media role, selector matching must not fall back to stale path mirrors
    - the same rule now applies to transcribe source media: canonical `audio_ref` or `video_ref` blocks fallback matching against stale `audio_path`
    - translation selectors now resolve source media from request-side refs and target media from result-side refs separately; they no longer share a single ambiguous `subtitle_ref` inference path
    - translation task recovery now requires request-side `context_ref` or `subtitle_ref`; path-only source matching has been removed from task snapshots
  - next removal condition:
    - continue deleting raw path mirrors from request payloads once execution boundaries are redesigned
- current narrowing rule for `result.meta.srt_path`:
  - it remains visible in diagnostics as a legacy mirror, but no longer participates in frontend task snapshot media recovery
  - translation output recovery must now come from producer-normalized `subtitle_ref` or `output_ref`
- task media candidate aggregation
  - [frontend/src/services/ui/taskMedia.ts](/E:/Work/Code/Mediaflow/frontend/src/services/ui/taskMedia.ts)
  - current guardrail:
    - generic task media aggregation no longer treats `context_path` as subtitle identity
    - request-side `output_path` no longer participates in task-media resolution
    - structured refs always win over mirrored path fields for navigation and recovery
- transcribe / translate result normalization helpers
  - [frontend/src/services/ui/transcribeResult.ts](/E:/Work/Code/Mediaflow/frontend/src/services/ui/transcribeResult.ts)
  - [frontend/src/services/ui/translateResult.ts](/E:/Work/Code/Mediaflow/frontend/src/services/ui/translateResult.ts)
  - still derive structured refs from `srt_path` when old result payloads omit `subtitle_ref`
  - next removal condition:
    - once desktop direct results and backend direct results both always emit `subtitle_ref` or `output_ref`

Type-level baseline:

- legacy task path mirrors are now explicitly named in:
  - `TaskRequestLegacyPathMirrors`
  - `TaskMetaLegacyPathMirrors`
- already removed from the frontend task-compat surface:
  - `TaskRequestLegacyPathMirrors.file_path`
  - `TaskMetaLegacyPathMirrors.file_path`
  - `TaskMetaLegacyPathMirrors.path`
  - `TaskRequestLegacyPathMirrors.srt_path`
  - `TaskResultLegacyPathMirrors`
  - reason:
    - these fields were no longer part of any active media resolution path and were permanently classified as `unused_compat`
- legacy-normalized task outputs are now explicitly marked with:
  - `task_contract_normalized_from_legacy`
  - meaning:
    - `true` means the serializer had to synthesize structured refs from legacy path mirrors or legacy result files
    - `false` means the task already carried native structured refs for the roles that were emitted
- any future deletion or addition of task-level compatibility path fields should flow through these named interfaces first, instead of reintroducing anonymous `*_path` fields across helpers

Media-resolution baseline:

- frontend media resolution is now split into two explicit layers
- task resolver layer
  - [frontend/src/services/tasks/taskMediaResolver.ts](/E:/Work/Code/Mediaflow/frontend/src/services/tasks/taskMediaResolver.ts)
  - responsibility:
    - resolves task snapshots into structured media refs, fallback candidates derived from structured outputs, and consumer-facing primary task media
    - covers:
      - generic task media candidates
      - translation source/target media resolution
      - transcribe source media resolution
      - primary task media used by task monitor and navigation
- direct-result resolver layer
  - [frontend/src/services/tasks/directResultMediaResolver.ts](/E:/Work/Code/Mediaflow/frontend/src/services/tasks/directResultMediaResolver.ts)
  - responsibility:
    - normalizes direct execution results into the same structured media shape expected by UI consumers
    - keeps `transcribeResult.ts` and `translateResult.ts` as compatibility adapters only

Maintenance rule from here:

- if the change is about how task snapshots turn into source/output media, update `taskMediaResolver.ts`
- if the change is about how direct execution results turn into structured refs, update `directResultMediaResolver.ts`
- avoid reintroducing media precedence logic directly into page hooks, task selectors, or UI components

Deletion priority from here:

- first remove path fallback reads that no longer have any producer in desktop direct results
- then remove path fallback reads from task selectors and task media resolution
- keep execution-path request fields until the last execution hop is redesigned

### Debug visibility baseline

Runtime diagnostics now expose both structured media refs and legacy path mirrors for each task snapshot:

- `task_contract_normalized_from_legacy`
- `request_media_refs`
- `result_media_refs`
- `result_meta`
- `result_files`
- `runtime_execution_summary`

Legacy result-only mirrors such as `result.meta.srt_path` now remain visible only inside raw `result_meta`. They are no longer part of the formal compat-path diagnostic surface because they no longer influence frontend task recovery.

Resolver-level regressions should now also be treated as first-class coverage:

- `taskMediaResolver.test.ts`
  - locks task snapshot media precedence and primary-media resolution
- `serviceMediaContract.test.ts`
  - locks direct-result media normalization

### Test baseline

High-frequency frontend regressions should now default to ref-first fixtures:

- transcriber result fixtures should include `subtitle_ref` when a subtitle artifact exists
- translation direct-result fixtures should include `subtitle_ref` or `output_ref`
- navigation and task monitor tests should prefer asserting `video_ref` and `subtitle_ref`
- `srt_path` assertions are still allowed, but only as compatibility checks secondary to structured media identity
- navigation payload and editor recovery tests should treat `videoRef` and `subtitleRef` as the primary recovered identity, with `videoPath` and `subtitlePath` asserted only as derived compatibility outputs
- repeated `video_path` / `subtitle_path` null assertions should be concentrated in a small number of normalization tests, not copied into every navigation action test

Contract-level tests should follow the same rule:

- desktop task state fixtures should prefer `context_ref`, `subtitle_ref`, and `output_ref` in worker payload/result samples when those roles exist
- service contract tests should validate that direct-result normalization produces structured refs before UI consumption

### Electron side

- [frontend/electron/main.ts](/E:/Work/Code/Mediaflow/frontend/electron/main.ts)
  - owns app lifecycle and module registration only
- `frontend/electron/desktop/taskCoordinator.ts`
  - owns desktop task orchestration and worker supervision
- `frontend/electron/desktop/historyStore.ts`
  - owns desktop task history persistence
- `frontend/electron/desktop/backendFallback.ts`
  - launches bundled backend as a non-blocking fallback
- [frontend/electron/preload.ts](/E:/Work/Code/Mediaflow/frontend/electron/preload.ts)
  - exposes file, window, and shell APIs to renderer

### Python backend side

- [backend/main.py](/E:/Work/Code/Mediaflow/backend/main.py)
  - FastAPI app
  - startup/shutdown lifecycle
  - writes runtime config and initializes services
- [backend/services/task_manager.py](/E:/Work\Code\Mediaflow/backend/services/task_manager.py)
  - queue, persistence, runtime state
- [backend/api/v1](/E:/Work/Code/Mediaflow/backend/api/v1)
  - HTTP endpoints for all desktop features

### Heavy compute services

- ASR: [backend/services/asr/service.py](/E:/Work/Code/Mediaflow/backend/services/asr/service.py)
- Translation: [backend/services/translator/llm_translator.py](/E:/Work/Code/Mediaflow/backend/services/translator/llm_translator.py)
- OCR: [backend/api/v1/ocr.py](/E:/Work/Code/Mediaflow/backend/api/v1/ocr.py), [backend/services/ocr/pipeline.py](/E:/Work/Code/Mediaflow/backend/services/ocr/pipeline.py)
- Synthesis: [backend/services/video_synthesizer.py](/E:/Work/Code/Mediaflow/backend/services/video_synthesizer.py)
- Download/sniff/browser: [backend/services/downloader/service.py](/E:/Work/Code/Mediaflow/backend/services/downloader/service.py), [backend/services/browser_service.py](/E:/Work/Code/Mediaflow/backend/services/browser_service.py), [backend/services/sniffer.py](/E:/Work/Code/Mediaflow/backend/services/sniffer.py)

## Why Startup Feels Heavy

Desktop startup currently includes:

1. Electron main-process boot.
2. Spawn desktop Python worker.
3. Worker handshake and task bridge availability.
4. Optional bundled backend fallback starts in background when packaged.

The remaining cost problem is no longer "desktop cannot boot without backend". The remaining issue is making sure fallback-only capabilities do not leak back into the primary startup path.

## Target Architecture

### Target split

#### Electron main process owns

- app lifecycle
- settings file I/O
- desktop dialogs and shell actions
- task list UI state bridge
- local job dispatch
- worker spawn / supervision / restart

#### Python worker owns

- ASR
- OCR
- translation
- video synthesis
- enhancement / cleanup
- downloader execution if still easier in Python

#### Renderer owns

- presentation
- editor interaction
- optimistic UI state
- sends commands through preload IPC, not local HTTP

## Migration Phases

## Phase 1: Remove desktop dependence on HTTP semantics

### Goal

Keep Python implementation, but stop treating it as a local web server in packaged desktop builds.

### Deliverables

- Add a desktop-only command channel between Electron main and Python worker.
- Keep FastAPI for dev mode and tests.
- Introduce a worker protocol for desktop:
  - request id
  - command name
  - payload
  - progress event
  - completion event
  - error event

### Suggested transport

Prefer one of:

- `stdin/stdout JSON-RPC`
- Windows named pipe

Recommendation: start with `stdin/stdout JSON lines`.

Reason:

- easiest to debug
- works with bundled exe
- no port management
- no local firewall/path surprises

### Scope

First move only a thin vertical slice:

- health / ready
- create task
- task progress events
- transcribe

### Files likely impacted

- [frontend/electron/main.ts](/E:/Work/Code/Mediaflow/frontend/electron/main.ts)
- [frontend/electron/preload.ts](/E:/Work/Code/Mediaflow/frontend/electron/preload.ts)
- new `frontend/electron/ipc/task-handlers.ts`
- new Python desktop worker entrypoint, for example:
  - `backend/desktop_worker.py`

## Phase 2: Move desktop orchestration out of Python

### Goal

Python stops owning queue and persistence for the desktop shell.

### Move into Electron main

- task queue bookkeeping
- task list persistence
- pause/cancel intent
- startup recovery markers
- desktop progress subscriptions

### Keep in Python worker

- actual task execution primitives
- progress callback emission

### Result

The Python side becomes a stateless or near-stateless execution engine.

### Candidates to move first

- settings access currently in [backend/services/settings_manager.py](/E:/Work/Code/Mediaflow/backend/services/settings_manager.py)
- task CRUD / queue summary currently exposed by [backend/api/v1/tasks.py](/E:/Work/Code/Mediaflow/backend/api/v1/tasks.py)
- parts of [backend/services/task_manager.py](/E:/Work/Code/Mediaflow/backend/services/task_manager.py)

## Phase 3: Collapse light endpoints into Electron-only features

### Goal

Stop routing simple desktop-only operations through Python.

### Good candidates

- settings read/write
- local file open/save
- watermark file import
- file existence / path probing
- some subtitle format conversion utilities
- lightweight validation and parsing

### Why

These are not ML/inference tasks and do not benefit from a Python web backend.

## Phase 4: Keep only a compute worker boundary

### Goal

Python process remains only because the compute stack still depends on Python ecosystem.

### Python worker responsibilities at this stage

- ASR
- OCR
- LLM translation orchestration
- synthesis / ffmpeg orchestration
- optional enhancement pipelines

Everything else should already be in Electron main or renderer.

## Proposed Desktop RPC Surface

### Example commands

- `worker.ready`
- `task.start`
- `task.cancel`
- `task.pause`
- `task.resume`
- `asr.transcribe`
- `translate.run`
- `ocr.extract`
- `synthesis.run`
- `download.run`

### Example event stream

- `progress`
- `log`
- `result`
- `error`

## First Concrete Refactor Order

1. Add `desktop_worker.py` with a minimal JSON command loop.
2. Add Electron worker supervisor in main-process.
3. Move desktop startup health gating from HTTP to worker `ready` event.
4. Port transcription task flow to worker RPC.
5. Port translation task flow.
6. Port synthesis.
7. Move task queue and task persistence to Electron main.
8. Delete desktop dependency on FastAPI/Uvicorn.

## Risks

- Progress/event model must stay compatible with current task UI.
- Python worker crashes need automatic restart policy.
- Long-running ffmpeg / ASR tasks need cancellation semantics that map cleanly across IPC.
- Tests currently assume HTTP endpoints in many places.
- Source abstraction can regress if new task flows bypass the source layer and reintroduce desktop/backend conditionals directly into `TaskProvider` or page hooks.

## Compatibility Strategy

Keep both modes temporarily:

- Dev/test mode:
  - FastAPI remains available
- Packaged desktop mode:
  - Electron talks to worker RPC directly
  - bundled FastAPI backend stays fallback-only and non-blocking

This avoids a big-bang rewrite.

## Recommended Immediate Next Step

Implement a desktop-only worker skeleton and migrate only `transcribe` first.

That gives the team a proof of architecture without rewriting the whole app:

- one command
- one progress stream
- one result shape
- no HTTP dependency for that path

Once transcription works over worker RPC, the same pattern can be reused for translation and synthesis.
