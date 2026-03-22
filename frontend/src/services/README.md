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
- `services/domain/runtimeCatalog.ts` is the source of truth for which operations are `desktop-primary`, `backend-fallback`, or `web-only`.
- `context/taskSources.ts` is the renderer task orchestration entry point.
  - `taskSources/desktopSource.ts` owns desktop task behavior.
  - `taskSources/backendSource.ts` owns backend task behavior.
  - `taskSources/shared.ts` owns source-agnostic task helpers and state aggregation.
- Tests should use `src/__tests__/testUtils/electronMock.ts` instead of assigning large ad hoc Electron mocks.
