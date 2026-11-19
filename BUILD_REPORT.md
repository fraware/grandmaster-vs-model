# Build and validation report · v0.2.0 · 19 November 2026

## Implemented

- Replaced the fictional demonstration with the real 2024 FIDE World Championship Game 14 score (116 half moves, sourced to Lichess, with result checked against FIDE).
- Added a source-linked Game 1 championship reader for the confirmed 2026 Lichess broadcast round `xLgOJ6cb`. It parses public PGN, reconstructs legal moves, rejects invalid source content and changed game prefixes, and refreshes on an active browser tab.
- Added an interactive historical challenge with legal-move selection, on-board selection, exact-match local score, game replay, rotation, position linking, and responsive presentation.
- Added a method section explicitly distinguishing observed moves, unverified forecasts, physical playing times, API responses, and retrospective user guesses.
- Added a social preview asset and included it in the Pages build.

## Executed validation

- `npm test`: **25 / 25 passed** (standard chess perft, special chess moves, source parsing, full historical score, model adapter mocks, ledger constraints).
- `npm run verify`: passed, **0 forecasts / 0 outcomes** in the ledger.
- `npm run build:data`: passed, generated snapshot unchanged in meaning (zero records).
- `node --check app.mjs`: passed.
- Historical game full SAN replay: exactly **116 legal plies**, ending in 58…Ke5.

## Honest limitations

- Direct browser navigation and screenshot testing were blocked by container-level Chromium `URLBlocklist` policy. UI screenshots are **not** independently validated.
- The Lichess Game 1 broadcast page and ID were verified from public search; the PGN HTTP endpoint has been tested with fixtures, not authenticated end-to-end from the release environment (network DNS restricted here). Real browser CORS behavior is unverified. The deployed page discloses unavailable data.
- No real 2026 championship moves existed on the recorded date. No actual provider inference or Stockfish evaluation was performed. Model accuracy claims are withheld.
- Pages deployment initially failed because repository Pages administration was not enabled; CI was green. A new Pages attempt will occur on this push, but success needs explicit verification.
