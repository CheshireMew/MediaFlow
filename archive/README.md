# Archive boundary

`archive/` contains retired implementations, prototypes, obsolete tests, and
historical verification scripts. Nothing below this directory belongs to the
runtime, build, test discovery, public API, or supported feature surface.

Each retained group owns a local `README.md` that records why it was archived
and which active implementation superseded it. New files may enter this
directory only after active imports, exports, build inputs, tests, and
documentation references have been removed. Archived code is not a fallback
implementation and must not be repaired as if it were active product code.

The current groups are:

- `backend-unused-runtime/`: superseded backend helpers and execution paths.
- `frontend-unused-components/`, `frontend-unused-contracts/`, and
  `frontend-unused-tests/`: retired renderer surfaces and tests.
- `removed-preprocessing-feature/`: the deliberately removed OCR, cleanup, and
  super-resolution product area.
- `legacy-video-synthesizer-scripts/`: historical synthesis probes.
- `build-profiles/`: superseded packaging profiles retained only for audit history.
- `license-history/`: byte-for-byte copies of superseded root license declarations.
- `propainter-prototype/` and `debug-prototypes/`: experiments that never
  became supported runtime features.

Archive cleanup remains report-only until the user authorizes exact targets.
