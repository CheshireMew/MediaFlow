# Archived frontend contracts

These files were moved out of `frontend/src` on 2026-07-10 after the final
architecture audit confirmed they had no production consumers:

- `taskSources.ts` was a compatibility re-export superseded by the explicit
  `context/taskSources/shared.ts` boundary.
- `mediaContracts.ts` duplicated the generated `MediaReference` contract and
  was unreachable from production and tests.

They are retained only for history and are not compiled or shipped.
