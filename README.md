# Grandmaster vs Model

**Predict the human. Not just the move.**

An open, independently maintained chess experiment. We compare the *actual next moves* of World Championship grandmasters with predictions submitted by frontier AI models. The 2026 Gukesh–Sindarov match starts **24 November 2026** in Geneva, according to [FIDE's championship calendar](https://worldchampionship.fide.com/schedule).

[Open the interactive website](https://fraware.github.io/grandmaster-vs-model/) · [Read the methodology](METHOD.md) · [Review the launch plan](LAUNCH.md)

## What already works

- **Real historical challenge.** The 2024 World Championship final (Ding–Gukesh, Game 14, 12 December) is supplied as 116 *legally verified* half-moves, reconstructed from its [Lichess broadcast](https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D/YaARFAYu). Visitors select a legal move, lock a prediction, reveal the player's decision, replay all positions, rotate the board, and share a position link. The retrospective guess score is local to that browser session; it is not a model evaluation.
- **Real 2026 broadcast input.** Game 1 has a [public Lichess broadcast](https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb). The site requests its PGN through Lichess's public API, reconstructs legal chess positions, and checks for updates at most every three minutes while the live tab is active. A legally checked same-origin snapshot is also generated during Pages deployments; visitors still have a recent cached position if their direct request fails. Neither retrieval time establishes the physical playing time. Later match games need their own confirmed broadcast IDs.
- **Inspectable prediction ledger.** The repository contains a canonical forecast schema, local SHA-256 record integrity validation, duplicate rejection, move-legality checks, provider-agnostic prompt template, and optional REST adapters for OpenAI, Anthropic, and Gemini (tested offline only).
- **Local-first site.** No external fonts, trackers, cookies, ads, mandatory account, or third-party JavaScript. The browser requests public game PGN directly from Lichess; no credential leaves the browser.

**Evidence status as of 19 November 2026:** The 2026 championship has not begun. The repository has **zero real model forecasts** and **zero observed 2026 moves**. No paid model inference or Stockfish evaluation has been run. There is no leaderboard because there is not yet evidence to justify one. The website source has been pushed; GitHub Pages deployment is blocked until Pages is enabled in the repository settings. The browser-side Lichess endpoint has been tested with offline fixtures, including cache fallback; live browser cross-origin behavior still needs a deployed-network check. Desktop and mobile interactive DOM tests passed using a local Chromium harness with mocked network data, not the public deployed site.

## Why this project is different

Prior systems already predict human chess moves. Relevant work includes [ChessDS DSC](https://github.com/ChessDS/chessds-dsc), [Maia-3](https://github.com/CSSLab/maia3), [MoveLens](https://chessassistlens.vercel.app/research), [ChessBench](https://chessbench.org/), and [LLMChessArena](https://github.com/DeadPackets/LLMChessArena). Historical replay and move-guessing games also predate this project. The intended contribution is **event-specific, prospective model forecasting with public pre-move records and reproducible scoring**, not an assertion that chess prediction itself was invented here.

An accurate prediction of a human's actual choice is different from choosing a move favored by a chess engine. These outcomes must be evaluated separately.

## Quick start

Node.js 20+ is needed for tests, record management, and model adapters; Python 3 is optional for the local site.

```sh
npm test
npm run verify
npm run build:data
python3 -m http.server 8080
```

Open `http://localhost:8080/`. The historical challenge works from bundled game data. The live championship tab attempts a direct Lichess request. Browser networking or CORS policy might block that request; an optional validated cached broadcast is used as a fallback. The fallback timestamp is explicitly labelled as a fetch time, not a move time. Direct `file://` navigation does not reliably permit JSON loading.

## Public broadcast cache

The Pages workflow attempts to fetch the official Game 1 PGN during deployment and writes a legally checked same-origin cache into the **published artifact only**. It does not modify tracked source files or represent a forecast. A failed fetch preserves the packaged default, without inventing moves. The direct browser request supplies fresher observations while the live tab is open; it is limited to one initial request plus a three-minute interval (five minutes if an error occurs). The retrospective challenge does not continually poll Lichess.

An operator may regenerate a cache locally using `node scripts/cache-broadcast.mjs --out /path/to/live-game1.json`. The committed default under `data/live-game1.json` is intentionally empty prior to 24 November 2026. The site rejects illegal cached moves, mismatched players, and changed live history within a browsing session. The build cache is a best-effort availability mechanism, **not immutable source evidence, publication priority, or a record of physical move times**. This build has no automatically scheduled redeployment; caching a new game requires a Pages build or manual refresh from a viewer.

## Real model forecasts

Collect an API prediction with an **explicit** provider/model version and credentials held in environment variables. The runner records the prompt and raw response, calls the common legal-move validator, and writes a locally checksummed JSON record.

```sh
export OPENAI_API_KEY='your-credential'
node scripts/model-runner.mjs \
  --provider openai \
  --version YOUR_EXACT_MODEL_IDENTIFIER \
  --fen 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --player 'White player' --opponent 'Black player' \
  --game 1 --ply 1
```

Alternative providers use `ANTHROPIC_API_KEY` or `GEMINI_API_KEY`; see `scripts/model-runner.mjs`. The runner has offline contract tests, not authenticated end-to-end API smoke tests.

**Publication standard:** A forecast must be publicly published *before the move* for a genuine prospective claim. Local timestamp fields, Git author timestamps, and local file hashes do not independently prove pre-move priority. A broadcast polling timestamp is not the time at which a player physically made a move. Provider identity and the absence of off-protocol information are also separate evidence obligations. Refer to [METHOD.md](METHOD.md) before publishing accuracy statistics.

## Files

| Path | Role |
| --- | --- |
| `index.html`, `style.css`, `app.mjs` | Static responsive site and interactive board |
| `src/chess.mjs` | Dependency-free standard chess rules, SAN/UCI and FEN |
| `src/pgn.mjs`, `src/broadcast.mjs` | Strict PGN parser, source checks and validated cache |
| `data/archive-2024.json` | Historically sourced full game for local challenge |
| `data/match.json` | Generated 2026 forecast and observed-move ledger |
| `data/live-game1.json` | Empty pre-match baseline for public broadcast caching |
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

GitHub Pages is configured through `Settings → Pages → Build and deployment → GitHub Actions`. The workflow automatically publishes the static files when Pages is enabled. The initial deployment returned HTTP 404 while Pages was disabled. Its deployment status is independent of a successful test run.

Source code and original design are licensed under MIT. World Championship scores and event details are sourced to Lichess/FIDE. This is an independent project with no affiliation or endorsement by FIDE, Lichess, players, or model providers.
