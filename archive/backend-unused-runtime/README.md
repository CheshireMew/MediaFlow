# Archived backend runtime prototypes

These files were moved out of `backend` on 2026-07-10 after the final
architecture audit confirmed they had no production or test importers:

- `runtime_access.py` was an empty marker left after the runtime service
  locator was replaced by explicit `ApplicationRuntime` dependencies.
- `pillow_subtitle_renderer.py` was an unimplemented prototype whose only
  runtime method always raised `NotImplementedError`.
- `translate_prompt.py` duplicated the active translation prompt pipeline.
- `asr_post_processor.py` was superseded by the active `SegmentRefiner` path.
- `task_runner.py` was superseded by the persisted `TaskQueueRunner`,
  `PipelineRunner`, and `TaskRuntimeContext` execution boundary. It had no
  production or test importers when archived on 2026-08-23.
- `user_agents.py` was the retired random browser fingerprint pool. It was
  archived on 2026-08-24 with SHA-256
  `2C1B1796315DA8EF7B1BFD5901F1FA49963A242EAD17E5B6FE27B90D3F1072E2`
  after the active Chromium context moved to runtime-versioned identities.
- `config_pre_responsibility_split.py` preserves the exact pre-split settings
  module, including the managed-storage limits added before this governance
  pass. It was archived on 2026-08-24 with SHA-256
  `094C121A5BB77581F7427927E44EEF4B2B56597B91978A1CFB6803D1BB5433A5`.

They remain here for historical reference and are intentionally outside the
application and test import boundaries.
