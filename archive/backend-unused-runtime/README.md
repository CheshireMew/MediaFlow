# Archived backend runtime prototypes

These files were moved out of `backend` on 2026-07-10 after the final
architecture audit confirmed they had no production or test importers:

- `runtime_access.py` was an empty marker left after the runtime service
  locator was replaced by explicit `ApplicationRuntime` dependencies.
- `pillow_subtitle_renderer.py` was an unimplemented prototype whose only
  runtime method always raised `NotImplementedError`.
- `translate_prompt.py` duplicated the active translation prompt pipeline.
- `asr_post_processor.py` was superseded by the active `SegmentRefiner` path.

They remain here for historical reference and are intentionally outside the
application and test import boundaries.
