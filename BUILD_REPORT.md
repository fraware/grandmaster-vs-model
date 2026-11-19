# Release verification — 0.5.0 (19 November 2026)

The audience-facing site now leads with a three-move historical challenge sourced from Ding–Gukesh, World Championship Game 14 (12 December 2024). The changes preserve the existing match replay, public source feed, collection records, model roster, and published research protocol.

## Production behavior

- Three deterministic, legally reconstructed positions at plies 28, 61, and 108, with independent score calculation and published source attribution.
- Mouse, touch and keyboard-accessible legal move selection, immediate historical reveal, sequential progress and one-click restart.
- Native share or clipboard fallback; browser-generated score graphic downloadable as PNG. No account, tracking, server-side visitor score, or inference cost.
- Open Graph and X/Twitter 1200×630 PNG social preview; complete portable source code; homepage and README updated to foreground the interactive product.
- The historical score is explicitly distinct from prospective AI model performance. No 2026 match move or model prediction has been fabricated.

## Verification

- `npm test` — **53/53 passed**.
- `npm run verify` — local ledger integrity passed (zero 2026 forecasts/outcomes at verification).
- `npm run verify:collection` — collection schema/integrity passed (zero championship attempts/moves).
- `npm run build:data` and `npm run build:collection` — regeneration succeeded.
- `CHROMIUM_PATH=/usr/bin/chromium python tests/browser-smoke.py` — desktop/mobile challenge flow, exact scoring, sharing, PNG export, board-click controls, legacy historical explorer, mocked live feed and outage fallback passed.
- Small-screen overflow was corrected at 320px; no horizontal overflow at 320, 360, 390, 768, 1280 or 1920px in the local fixture harness.

**Verification boundaries:** Browser test data for the 2026 tab are fixtures. No authenticated provider invocation was performed in this release. A successful GitHub Pages workflow proves artifact publication but does not independently establish live-origin browser behavior. Provider access from the earlier checks remains confirmed for OpenAI only; Anthropic and Gemini need access remediation. Live chronological priority is not attested by the historical challenge.
