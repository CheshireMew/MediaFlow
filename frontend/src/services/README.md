# Services Layout

## Structure

- `desktop/`
  - Electron bridge and desktop-only adapters.
  - This is the only layer that should touch `window.electronAPI`.
- `domain/`
  - App-facing business services such as translation, downloader, settings, and execution dispatch.
  - Consumers should prefer barrel imports from `services/domain`.
- `ui/`
  - Navigation and UI coordination helpers.
- `fileService.ts`
  - Shared file I/O wrapper used by both desktop and UI workflows.

## Import Rules

- Prefer `services/domain` over deep imports like `services/domain/settingsService`.
- Prefer `services/desktop` over deep imports like `services/desktop/eventsService`.
- Page and hook code should not access `window.electronAPI` directly.

## Current Boundary

- `services/desktop/bridge.ts` is the single runtime entry point for Electron APIs.
- Desktop runtime is worker-first.
  - Desktop mode talks to the Python desktop worker through Electron IPC only.
  - Web mode talks to the backend HTTP API directly.
- `context/TaskProvider.tsx` is the renderer task orchestration entry point.
  - Desktop mode owns desktop task snapshot loading and event subscription.
  - Web mode owns backend task snapshot loading and socket updates.
  - `context/taskSources/shared.ts` now only contains task normalization and contract helpers.
- Tests should use `src/__tests__/testUtils/electronMock.ts` instead of assigning large ad hoc Electron mocks.
