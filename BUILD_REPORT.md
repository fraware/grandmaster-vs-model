# Build and validation report · v0.3.0 · 19 November 2026

## Previously published functionality

- Historical 2024 FIDE World Championship Game 14, full 116-ply legal replay from the recorded Lichess broadcast.
- Interactive challenge with legal-move selection, on-board choice, lock/reveal, exact-match local score, replay, board rotation, and link sharing.
- Real 2026 Game 1 Lichess public PGN endpoint. No invented championship moves or model outputs.
- Independent provider adapters, local record verification, tests, source and methodological disclosures.

## Improvements in this release

- **Readable latest move** on the 2026 live board. The newest observed SAN and grandmaster identity are shown at the end of the line, with a move arrow.
- **Source-aware fallback**. A checked public PGN cache is generated into the static site artifact during Pages deployments. The site validates source identity, chess legality, player names and round ID before restoring cached moves. A direct-fetch failure no longer hides a recent cached game.
- **Polite polling**. The browser checks for a new PGN on initialization and subsequently at most every three minutes while the live view is active, backing off to five minutes on failures. Archive readers do not repeatedly hit Lichess.
- **Append-only session reconciliation**. The browser rejects rewrites, shortened game histories, or disappearance of a previously loaded game instead of silently replacing the score.
- **Cache tests** for invalid UCI, wrong player identities, source mismatch, append-only history, offline retention and deterministic serialization.

## Validation performed

- `npm test` **31/31 passed**, including start-position perft 197,281 at depth 4, complete historical SAN replay, provider response mocks, record validation and cache tests.
- `npm run verify` passed with **0 real forecasts / 0 real outcomes**.
- `npm run build:data` passed.
- `node --check app.mjs` passed.
- The reproducible `tests/browser-smoke.py` passed on desktop and mobile Chromium with 64 board squares and synthetic fetch responses. Tested selection, lock, reveal, navigation, active six-ply live game, and both empty-feed and populated-cache outage modes. No JavaScript exceptions; 390px mobile viewport had no horizontal page overflow. Chromium site navigation is blocked by environment policy, so the tests inject local HTML, CSS and scripts rather than navigating to an actual public origin.

## Operational status and limitations

- The 2026 match is still scheduled to begin 24 November; actual 2026 observations and model forecasts remain zero.
- Lichess public PGN identity and permission for broadcast redisplay are documented, but we cannot verify direct public-domain cross-origin behavior in this restricted browser environment. Cache generation against a genuine live Game 1 response and deployment remain untested.
- Cache `fetchedAt` is build retrieval time, **not** a physical grandmaster move timestamp, an immutable commitment, or evidence that a model forecast preceded a move.
- A deployed public website still needs GitHub Pages enabled at repository Settings → Pages → GitHub Actions. The last Pages workflow returned 404 at the deployment step despite green code checks. Attempting to create a Render static site was rejected by the Hobby workspace's 25-service limit. Neither failure indicates a code test failure.
- API provider credentials have not been supplied. No authenticated real API inference, engine assessment, external timestamping or complete live championship ingestion has been performed.


## V0.4 implementation added 19 November 2026

- Added a provider-documented three-model roster featuring GPT-6.2 Astra, Claude Fable 5.2, and Gemini 4 Neon. Merely listing a model is not evidence of an invocation.
- Added source-observation records with first-received times, a guarded attempt writer retaining failed and unparseable responses, a legal-chess validator, a reproducible public collection index, and a separately scheduled, credential-gated GitHub Actions capture workflow.
- Added an editorial model-field section with transparent zero-data status, source links, and local provisional-attempt labels. No model calls were made for this release.
- Offline test suite: 38 tests passed locally. Chromium mobile and desktop interaction smoke passed against injected historical and 2026 broadcast fixtures. Actual provider credentials and live deployed-origin cross-origin access have not been tested.
- GitHub Pages activation was reported by the repository owner. The subsequent retry of an old run failed because the rerun contained duplicate `github-pages` artifacts; the v0.4 push will provide a clean workflow deployment attempt.
- The roster is a verified model selection, not a reproducible, budget-matched benchmark across vendors. Prospective timing and cryptographic provider attestation remain unresolved.

## v0.4.1 targeted fixes

- The live UI polls the published model-attempt index separately from the source PGN. Unavailable or invalid updates keep the previous accepted index; no invented records are substituted.
- The collector rejects nonstandard starting positions and maps player names from Lichess tags to fixed identities before constructing provider prompts. This prevents arbitrary untrusted player-tag text from entering a model request.
- 39 local automated tests and desktop/mobile Chromium smoke passed, including offline player-tag injection tests. Direct provider API calls remain untested and no actual 2026 observations have been recorded.
- GitHub Actions CI and Pages deployment for v0.4.0 both completed successfully. The next push is separately checked.
