# Archived frontend dead-code tests

`downloadSubmission.test.ts` was moved here on 2026-07-10 together with the
unused `resolveDownloadStepParams` export it tested. The production download
path submits the validated pipeline directly and never called that helper, so
retaining its test in the active suite would only preserve dead code.

The file remains for historical reference and is intentionally outside the
frontend test and build boundaries.
