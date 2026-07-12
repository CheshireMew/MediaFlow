# Archived frontend prototypes

These components were archived on 2026-07-10 because no production or test
module imports them:

- `LoadingScreen.tsx` predates the startup state machine and
  `StartupPlaceholderPage`.
- `TimelineEditor.tsx` predates the current `WaveformPlayer` editor surface.

They remain here for historical reference and are intentionally outside
`frontend/src`, so they are not part of the shipped application or its type and
lint boundaries.
