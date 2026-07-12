# Archived legacy video synthesizer scripts

These debug and verification scripts were moved out of `scripts` on
2026-07-10 because they imported the removed
`backend.services.video_synthesizer.VideoSynthesizer` facade. The active video
pipeline is assembled from `SynthesisOrchestrator` dependencies, so the old
scripts failed immediately and no longer verified production behavior.

They are retained here for historical reference and are intentionally outside
the active lint and tool boundaries.
