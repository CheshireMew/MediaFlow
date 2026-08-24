# Archived build profiles

This directory retains packaging profiles that no longer prove the supported product. They are excluded from all package scripts and CI workflows.

`electron-builder.smoke.yml` produced a smaller test-only shell that omitted the pinned FFmpeg resources and legal notices. It was retired on 2026-08-23 when CI began building the unpacked desktop application from the same `frontend/electron-builder.yml` used by the formal Windows package.
