# Subtitle Shaping Contract

This contract is the single behavioral boundary for subtitle line shaping.
The Python backend and TypeScript preview implementation are separate runtime
implementations, but both must satisfy this document and
`contracts/subtitle-shaping-cases.json`.

## Scope

- Shape plain subtitle text into visual lines that fit within `maxWidthPx`.
- Preserve caller-provided line boundaries and shape each input line independently.
- Return the original text when `fontSize <= 0` or `maxWidthPx <= 0`.
- The backend may serialize shaped lines with ASS `\N`; the frontend may serialize
  them with newline characters. Tests compare line arrays, not separators.

## Width Model

- Space width is `0.25 * fontSize`.
- CJK ideographs, fullwidth forms, CJK punctuation, and forbidden line-boundary
  punctuation use `0.9 * fontSize`.
- Latin letters, digits, and basic punctuation use `0.5 * fontSize`.
- If an implementation can measure a configured font, a positive measured width
  takes precedence over the estimate. If measurement is unavailable or returns a
  non-positive value, the estimate is used.

## Break Rules

- Prefer keeping the whole input line unchanged when its measured width fits.
- Latin text breaks at spaces when possible; the space itself is not retained at
  either line boundary.
- CJK and fullwidth text may break between characters when line-start and
  line-end punctuation constraints allow it.
- Characters in the line-start forbidden set must not start a new visual line.
- Characters in the line-end forbidden set must not end a visual line.
- When no preferred break point exists, force a break before the current
  character that overflows the line.

## Change Policy

- Add or update fixtures before changing either implementation.
- A behavior is not accepted unless both Python and TypeScript contract tests
  pass against the same fixture file.
- New shaping rules must be documented here and covered by at least one fixture.
