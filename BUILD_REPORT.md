# Release verification — 0.6.0 (19 November 2026)

## Objective and implementation

Redesigned the product for immediate participation. The public entry route now contains **one** sourced interactive chessboard, three positions, one exact-match score, and one primary friend-sharing action. A linked `lab.html` retains the complete live/retrospective chess explorer, documented model roster, and evidence protocol. Existing legacy links with a `mode` query parameter redirect to the lab.

## Changes

- Separate, responsive game entrance (`index.html`, `landing.css`, `src/home.mjs`) with dark-green/ivory visual system and intentional typography. No external fonts, scripts, trackers or accounts.
- Enhanced the replay to show the grandmaster's actual resulting board position, highlighted squares, visually distinct progress and source attribution.
- Mobile reveal dock becomes available after a legal prediction; the fallback move picker remains keyboard accessible.
- Final result screen now contains one prominent score, three per-position tiles and direct result sharing. Native file share is attempted on supported browsers; fallback paths preserve the score and link.
- Shared text is generated from actual local answers; there are no fictional leaderboard ranks or AI-model scores.
- Regenerated 1200×630 social preview and README screenshot from the real tested interface. Open Graph and basic Schema.org metadata describe the actual game.
- Retained the research experience as `lab.html` with its original code, data integrity checks and broadcast reader.
- Updated Pages publication to include both page routes and their styles.

## Evidence and tests

- `npm test`: 54 passed, 0 failed.
- `npm run verify`: passed with 0 recorded 2026 forecasts/outcomes.
- `npm run verify:collection`: passed with 0 championship attempts/moves.
- `CHROMIUM_PATH=/usr/bin/chromium python tests/browser-smoke.py`: passed the entire 3-position flow on desktop (1440px), mobile (390px) and narrow mobile (320px), including clickable legal moves, actual played board, 2/3 scoring, share grid, downloadable PNG, restart, and horizontal-overflow checks.
- Separate lab test: historical replay and guess/reveal, recorded model roster, simulated live broadcast, and feed-outage fallback passed using explicit fixtures.

## Scope and limitations

Browser fixtures establish local presentation and logical behavior, **not** independent deployed-origin connectivity or real network access to Lichess. The historical challenge is genuine; no live 2026 model forecasts, ranking, or engine scores exist at this checkpoint. The latest observed credential test confirms one successful OpenAI inference and unresolved Anthropic/Google access errors. GitHub Pages publication is verified only once the matching GitHub Actions run succeeds.


## Work in progress: retrospective API demonstration (0.7.0)

Added an independently verified, one-time three-call provider workflow using 2024 game positions, strict prompt/output provenance, local fallback, and an after-reveal GPT comparison. The 2024 game is historically known, so the demonstration is expressly separated from the prospective 2026 experiment. The initial committed evidence dataset contains zero model responses until the real GitHub Actions run has been inspected. No real API result is asserted by this entry.

### 0.7.0 authenticated integration

The first live OpenAI integration run (GitHub Actions 44514351159) completed three authenticated responses. Raw output moves were `b5c3`, `f8a8`, and `f4f2`, matching all three selected recorded moves. Public evidence was downloaded from the workflow artifact, validated against the pinned source with `npm run verify:retrospective`, and checked into `data/retrospective-2024.json` for repeatable local review. The 3/3 result is retrospective, potentially memorized, and distinct from the 2026 prospective protocol.


## 0.8.0 — Editorial visual identity (19 November 2026)

Replaced the homepage’s dark green and fluorescent accents with a paper, ink, oxblood, and wood color system. The site now uses restrained journal typography, unadorned navigation, flat controls, and lighter game framing. Reworked the introductory text and all user-facing share surfaces, including the generated 1200×630 Open Graph image and the browser-rendered 1200×630 personal scorecard. The README preview is captured directly from Chromium. The historical chess game and model evidence are unchanged. No API calls are made by the redesign.

Verification: full Node test suite, chess ledger, prospective collection index, retrospective evidence validation, and desktop/mobile/narrow Chromium challenge and research-page smoke checks. Browser tests rely on deterministic network fixtures and do not establish end-to-end access to the public GitHub Pages URL.


## 0.9.0 — Direct-manipulation chess controls (19 November 2026)

Improved the existing editorial challenge without changing the historical source game or retrospective GPT records. The 64 square buttons remain mounted while selecting a move, preserving focus and preventing DOM-based flashes. The board supports mouse/pen/touch dragging and tap-to-move; selected pieces preview their legal destination before the recorded move is revealed. The recorded move then animates to its destination, and the browser honors reduced-motion preferences. The full move list is now an optional, accessible disclosure instead of competing with the chessboard for attention. Arrow keys provide roving focus across squares, with native Enter/Space activation. Mobile progression places the new chessboard immediately to avoid touch targets shifting during an animated scroll.

Verification consists of Node unit tests, syntax checks, deterministic data verification, and Chromium end-to-end exercises on desktop, touch-enabled mobile, and 320px touch-enabled layouts. Browser regression coverage explicitly checks stable square identity, move preview, drag-to-move, tap-to-move, keyboard focus, reveal/advance, score, export, and research-page fallback. No new paid provider requests are needed.
