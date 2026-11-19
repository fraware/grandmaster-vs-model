# Grandmaster vs Model

**Predict the human. Not just the move.**

An open, independently maintained chess experiment. We compare the *actual next moves* of World Championship grandmasters with predictions submitted by frontier AI models. The 2026 Gukesh–Sindarov match starts **24 November 2026** in Geneva, according to [FIDE's championship calendar](https://worldchampionship.fide.com/schedule).

[Open the interactive website](https://fraware.github.io/grandmaster-vs-model/) · [Read the methodology](METHOD.md) · [Review the launch plan](LAUNCH.md)

[![Test and verify](https://github.com/fraware/grandmaster-vs-model/actions/workflows/ci.yml/badge.svg)](https://github.com/fraware/grandmaster-vs-model/actions/workflows/ci.yml) [![Publish site](https://github.com/fraware/grandmaster-vs-model/actions/workflows/pages.yml/badge.svg)](https://github.com/fraware/grandmaster-vs-model/actions/workflows/pages.yml)

![The interactive Grandmaster vs Model website: real 2024 game replay and the declared frontier model field](assets/preview.webp)

*Screenshot of the sourced 2024 retrospective challenge. No 2026 model forecasts are represented.*

## What already works

- **Real historical challenge.** The 2024 World Championship final (Ding–Gukesh, Game 14, 12 December) is supplied as 116 *legally verified* half-moves, reconstructed from its [Lichess broadcast](https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D/YaARFAYu). Visitors select a legal move, lock a prediction, reveal the player's decision, replay all positions, rotate the board, and share a position link. The retrospective guess score is local to that browser session; it is not a model evaluation.
- **Real 2026 broadcast input.** Game 1 has a [public Lichess broadcast](https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb). The site requests its PGN through Lichess's public API, reconstructs legal chess positions, and checks for updates at most every three minutes while the live tab is active. A legally checked same-origin snapshot is also generated during Pages deployments; visitors still have a recent cached position if their direct request fails. Neither retrieval time establishes the physical playing time. Later match games need their own confirmed broadcast IDs.
- **Inspectable prediction ledger.** The repository contains a validated source-reception ledger, digest-protected provider-attempt records, duplicate rejection, chess-legality checks, a shared prompt, and optional REST adapters for OpenAI, Anthropic, and Gemini (tested offline only).
- **Local-first site.** No external fonts, trackers, cookies, ads, mandatory account, or third-party JavaScript. The browser requests public game PGN directly from Lichess; no credential leaves the browser.

**Evidence status as of 19 November 2026:** The 2026 championship has not begun. The repository has **zero real model forecasts** and **zero observed 2026 moves**. Authenticated synthetic provider calls have been attempted separately from the championship ledger; no match forecasts or Stockfish evaluation have been run. There is no leaderboard. The browser-side Lichess endpoint has been tested with offline fixtures, including cache fallback; actual cross-origin behavior still needs an end-to-end deployed-network check. Desktop and mobile Chromium interaction tests passed with isolated network fixtures.

## Why this project is different

Prior systems already predict human chess moves. Relevant work includes [ChessDS DSC](https://github.com/ChessDS/chessds-dsc), [Maia-3](https://github.com/CSSLab/maia3), [MoveLens](https://chessassistlens.vercel.app/research), [ChessBench](https://chessbench.org/), and [LLMChessArena](https://github.com/DeadPackets/LLMChessArena). Historical replay and move-guessing games also predate this project. The intended contribution is **event-specific, prospective model forecasting with public pre-move records and reproducible scoring**, not an assertion that chess prediction itself was invented here.

An accurate prediction of a human's actual choice is different from choosing a move favored by a chess engine. These outcomes must be evaluated separately.

## Quick start

Node.js 20+ is needed for tests, record management, and model adapters; Python 3 is optional for the local site.

```sh
npm test
npm run verify
npm run build:data
npm run verify:collection
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The historical challenge works from bundled game data. The live championship tab attempts a direct Lichess request. Browser networking or CORS policy might block that request; an optional validated cached broadcast is used as a fallback. The fallback timestamp is explicitly labelled as a fetch time, not a move time. Direct `file://` navigation does not reliably permit JSON loading.

## Public broadcast cache

The Pages workflow attempts to fetch the official Game 1 PGN during deployment and writes a legally checked same-origin cache into the **published artifact only**. It does not modify tracked source files or represent a forecast. A failed fetch preserves the packaged default, without inventing moves. The direct browser request supplies fresher observations while the live tab is open; it is limited to one initial request plus a three-minute interval (five minutes if an error occurs). The retrospective challenge does not continually poll Lichess.

An operator may regenerate a cache locally using `node scripts/cache-broadcast.mjs --out /path/to/live-game1.json`. The committed default under `data/live-game1.json` is intentionally empty prior to 24 November 2026. The site rejects illegal cached moves, mismatched players, and changed live history within a browsing session. The build cache is a best-effort availability mechanism, **not immutable source evidence, publication priority, or a record of physical move times**. The capture workflow is scheduled at five-minute intervals within selected UTC hours on championship dates. An actual new observation or model attempt triggers a data commit, which triggers a Pages build and refreshes the cached broadcast. GitHub Actions schedules are best effort; delays and missed positions are expected. The browser direct feed remains available without automated collection. While the live tab is active, the website also refreshes the same-origin public attempt index at most once every two minutes, without requiring a reload.

## Frontier-model field and prospective capture

The public model roster in [`data/models.json`](data/models.json) contains official API identifiers checked **19 November 2026**. Listing a model does not imply API access or a measured result.

| Provider | Model | Source |
| --- | --- | --- |
| OpenAI | `gpt-6.2-astra` | [OpenAI model specification](https://developers.openai.com/api/docs/models/gpt-6.2-astra) |
| Anthropic | `claude-fable-5-2` | [Claude model catalog](https://platform.claude.com/docs/en/models/overview) |
| Google | `gemini-4-neon` | [Gemini model catalog](https://aistudio.google.com/docs/models) |

The [`Capture prospective forecasts`](.github/workflows/capture.yml) action polls the [identified Game 1 broadcast](https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb). If a legal 2026 game position and registered provider credentials exist, it sends a documented shared prompt to each configured API once per position. The source is restricted to the standard initial chess position, and broadcast player names are mapped to canonical identities before being placed in prompts. The public artifacts are:

- `data/observations/game1.json` — first *feed reception* times for legally reconstructed moves; never claimed as physical move times.
- `data/attempts/*.json` — full prompt, raw model output or explicit failure, provider-reported model/response ID if available, digests, and local request timestamps. A second broadcast fetch detects obvious position changes during collection.
- `data/collection.json` — minimized, reproducibly derived index rendered on the website. Valid attempts are **provisional** and excluded from a ranked score until independently inspectable publication priority is established.

The workflow is active only for the defined **24 November–12 December 2026** collection interval. The five-minute cron cadence is not guaranteed by GitHub and might miss short time intervals. It is not a continuous, latency-bounded service. Only Game 1 has a confirmed broadcast round ID. To cover more games, obtain and verify their round identifiers and extend the implementation explicitly.

### Checking provider access before Game 1

The [Verify frontier model access](.github/workflows/provider-smoke.yml) workflow runs **once on initial installation** and is available for later manual execution. It invokes each configured API model at most once using a small synthetic opening-position prompt. The command reports which keys were available to the job, the returned provider model identifier, and whether the response contained one legal UCI move. A seven-day GitHub Actions artifact retains a sanitized health report. The check does **not** create a championship prediction or contribute to the match leaderboard.

The command is intentionally unsuccessful if every credential is missing or if any configured provider fails. Missing individual keys are recorded without affecting the status of other providers. Anthropic keys created without a fixed workspace may need an additional `ANTHROPIC_WORKSPACE_ID` repository secret containing the workspace identifier from the Claude Console. If Google returns HTTP 403, inspect the sanitized status and your Gemini API project access before changing the public model roster. Do not copy API keys into issues, local screenshots, logs, or this repository. A successful check confirms only access at that moment, not access on match day. Manual reruns incur additional API charges.

[Open the credential verification workflow](https://github.com/fraware/grandmaster-vs-model/actions/workflows/provider-smoke.yml)

**To enable actual API predictions**, add the corresponding credentials at [Settings → Secrets and variables → Actions](https://github.com/fraware/grandmaster-vs-model/settings/secrets/actions), using the exact names `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`. For an Anthropic key that is not tied to one workspace, also add `ANTHROPIC_WORKSPACE_ID` with its workspace identifier. This value is sent as a request header exclusively to Anthropic. Add only the providers you intend to fund. The workflow ignores providers without a key. Provider calls incur usage charges. Secrets are never written to the site, files, or workflow logs. Authenticated provider access is assessed by the separate credential verification workflow. Inspect its actual report before claiming successful inference; access, model support, rate limits, and individual spending limits must be confirmed.

You can trigger one collector run manually from [Actions → Capture prospective forecasts](https://github.com/fraware/grandmaster-vs-model/actions/workflows/capture.yml). Prior to the opening game, the collector records no forecasts. A finished match stops calls. Automated data commits use the transparent GitHub Actions bot identity, distinct from the owner's code commits.

```sh
npm test
npm run verify:collection
npm run capture:once    # needs a real match position and provider secrets to invoke models
```

The earlier [`scripts/model-runner.mjs`](scripts/model-runner.mjs) is also available for deliberate single-model invocations. Its output is operator-originated; it does not gain priority or provider attestation from a self-reported timestamp.

**Methodological boundary:** A local SHA-256 digest is not a timestamp. `firstObservedAt` is a source reception time, not the physical move time. Git hosting establishes public version history, subject to delivery delays. API requests, commits, and the championship broadcast are separate clocks. We will not publish a cross-model accuracy leaderboard without checking their relationship. See [METHOD.md](METHOD.md).

## Files

| Path | Role |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Static responsive site and interactive board |
| `src/chess.mjs` | Dependency-free standard chess rules, SAN/UCI and FEN |
| `src/pgn.mjs`, `src/broadcast.mjs` | Strict PGN parser, source checks and validated cache |
| `data/archive-2024.json` | Historically sourced full game for local challenge |
| `data/match.json` | Generated 2026 forecast and observed-move ledger |
| `data/live-game1.json` | Empty pre-match baseline for public broadcast caching |
| `data/models.json` | Versioned provider model roster with primary documentation |
| `data/collection.json` | Derived index of source observations and recorded model calls |
| `scripts/forecast-cycle.mjs`, `scripts/collection.mjs` | Optional, audited prospective capture and index validation |
| `src/collection.mjs` | Source/attempt validation and reproducible public projection |
| `scripts/ledger.mjs` | Record, verify, rebuild ledger data |
| `scripts/model-runner.mjs` | Optional real model API adapters |
| `scripts/cache-broadcast.mjs` | Best-effort static source snapshot generation |
| `tests/` | Chess perft, protocols, provider mocks, PGN validation and an optional Chromium UI smoke test |
| `.github/workflows/` | CI and GitHub Pages deployment |

## Optional browser integration test

The repository includes a reproducible Chromium smoke test for desktop and mobile DOM interactions. It uses a clearly artificial six-ply PGN fixture to exercise the live view without presenting those moves as observed championship data. The test also checks legal prediction/reveal behavior and failure handling for direct PGN requests. This is distinct from testing the actual deployed origin or Lichess cross-origin policy.

```sh
python -m pip install playwright
python -m playwright install chromium
python tests/browser-smoke.py
```

Use `CHROMIUM_PATH=/path/to/chromium` for a system browser and `GVM_SCREENSHOT_DIR=/your/directory` for screenshots. These optional dependencies are unnecessary to run the website.

## Hosting

GitHub Pages uses `Settings → Pages → Build and deployment → GitHub Actions`. The publishing workflow builds the site and validates data on each push. Inspect [the current deployment workflow](https://github.com/fraware/grandmaster-vs-model/actions/workflows/pages.yml) to confirm the live environment rather than inferring deployment from passing CI. The first attempted deployment returned 404 with Pages disabled; rerunning that same failed job subsequently caused a duplicate-artifact error. A new push starts a fresh workflow run.

Source code and original design are licensed under MIT. World Championship scores and event details are sourced to Lichess/FIDE. This is an independent project with no affiliation or endorsement by FIDE, Lichess, players, or model providers.