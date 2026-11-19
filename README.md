# Grandmaster vs Model

**Predict the human. Not just the move.**

A small, independently maintained experiment to evaluate whether general-purpose AI models anticipate the *actual choices* of grandmasters during the Gukesh–Sindarov 2026 FIDE World Chess Championship. The first classical game is scheduled for **24 November 2026**. See [FIDE's official match schedule](https://worldchampionship.fide.com/schedule).

> **Current status — prelaunch prototype (19 November 2026).** The dashboard has an explicit scripted illustration. The championship ledger has zero observations and zero model predictions. OpenAI, Anthropic, and Gemini API adapters have offline unit tests; no real provider calls or engine evaluations have been executed. The project does not yet ingest a live championship feed or independently attest submitted model results. The repository source is public at [fraware/grandmaster-vs-model](https://github.com/fraware/grandmaster-vs-model). A working Pages deployment is not yet verified.

## Why this project exists

Chess engines select strong moves. The question here is whether models can identify the particular move a human chooses. A prediction that disagrees with Stockfish can be right about the player. A prediction that agrees with Stockfish can be wrong about the player. We maintain separate measures.

This is not a generic chess arena, nor a claim to have invented human-move prediction. Directly relevant prior work includes [ChessDS DSC](https://github.com/ChessDS/chessds-dsc), [Maia-3](https://github.com/CSSLab/maia3), [MoveLens](https://chessassistlens.vercel.app/research), [ChessBench](https://chessbench.org/), and [LLMChessArena](https://github.com/DeadPackets/LLMChessArena). Our intended contribution is a public *prospective*, championship-specific evaluation with inspectable forecast records.

## Run locally

No npm installation or browser framework is needed. Node.js 20+ is used for the ledger and tests; Python 3 is optional for serving the site.

```bash
npm test
npm run verify
npm run build:data
python3 -m http.server 8080
```

Open `http://localhost:8080`. The initial view is an explicitly illustrative board. Select **Championship** for the empty live ledger. Select **Game** to inspect an individual game. A direct `file://` URL is not guaranteed to load the JSON snapshot due to browser origin restrictions.

The app has no external fonts, analytics, advertising, cookies, or third-party JavaScript.

## Record a prospective forecast

A validated forecast contains a game number, half-move (ply) number, FEN, model ID, exact model version, complete prompt, raw provider output, predicted legal move in UCI notation, and a reported UTC time. Records are immutable at the CLI level. They contain SHA-256 checksums of their content and of the prompt and response. **SHA-256 does not prove the time at which a record was created.**

```bash
# First game, initial position. This is an instruction example, not a real prediction.
node scripts/ledger.mjs forecast \
  --game 1 --ply 1 \
  --fen 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --model hypothetical-model --version exact-model-identifier \
  --prompt-file ./prompt.txt --response-file ./response.txt \
  --uci e2e4 --predicted-at 2026-11-24T14:00:00Z
```

The CLI rejects illegal chess moves, malformed FENs, inconsistent ply numbers, duplicate submissions, invalid timestamps, and corrupted record digests. The initial schema uses standard chess only; Chess960 and other variants are out of scope.

**Required external priority evidence.** Commit each forecast on a publicly inspectable branch *before* the corresponding human move. Capture the commit URL/SHA and an independent record of the first public observation of the move. Git author and committer timestamps are operator-controlled; GitHub hosting history is helpful but not a complete time-attestation service. Do not count an unanchored prediction as an independently verified pre-move forecast.

## Invoke a model API

With the appropriate credential in the local environment, use the provider runner. Model identifiers are intentionally explicit and are never guessed.

```bash
export OPENAI_API_KEY='...'
node scripts/model-runner.mjs \
  --provider openai \
  --version YOUR_EXACT_MODEL_IDENTIFIER \
  --fen 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --player 'White player' --opponent 'Black player' \
  --game 1 --ply 1
```

Other supported provider values: `anthropic` (`ANTHROPIC_API_KEY`) and `gemini` (`GEMINI_API_KEY`). Specify `--model-id` for a stable public slug. The optional `--history-file` points to a plain-text UCI move history. The runner sends a position, named player, legal move list, and a common prompt; it rejects responses other than a single legal UCI move. The runner does not grant external tools to the model. A response is recorded with its raw text and operator-side reported completion time. Call origin, API/model authenticity, request accounting, and chronology are not cryptographically attested by this code. Always publish the record prior to the next move.

Provider endpoints are based on [OpenAI Responses](https://platform.openai.com/docs/api-reference/responses/create), [Anthropic Messages](https://docs.anthropic.com/en/api/messages), and [Google Gemini Generate Content](https://ai.google.dev/gemini-api/docs/generate-content). The adapters have mock transport tests and require a real credential-based smoke test before operational use. API syntax and model availability change, so verify them close to launch.

## Record an observed move

```bash
node scripts/ledger.mjs outcome \
  --game 1 --ply 1 \
  --fen 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' \
  --uci e2e4 \
  --played-at 2026-11-24T14:05:00Z \
  --source-url 'https://lichess.org/broadcast/YOUR-REAL-BROADCAST-URL'

npm run verify
npm run build:data
```

The above is a **synthetic command example**. The `--played-at` field needs independent support; it must not be inferred from a polling timestamp. In the absence of a verified physical move time, retain the observation as provisionally sourced and exclude it from independently attested priority claims. To follow games without scraping, see [Lichess broadcast PGN and streaming API](https://lichess.org/broadcast/help). The 2026 championship round identifier has not been configured.

## Interpret the output

- **Exact next move**: whether the predicted UCI equals the broadcast-observed UCI at the same validated FEN.
- **Eligibility**: operator-supplied forecast time precedes the reported human move time. This local check is provisional, not a verified public time anchor.
- **Engine strength**: withheld until Stockfish version, hardware/compute, search limits, MultiPV, and evaluation conventions are fixed and recorded.
- **Summary statistics**: withheld until prospective data exist. Moves from a single game are dependent observations; uncertainty analysis must account for game-level clustering and selection.

Read [METHOD.md](METHOD.md) for the measurement and trust-boundary specification and [LAUNCH.md](LAUNCH.md) for the remaining tasks.

## Repository layout

```text
index.html / style.css / app.mjs      static site, no frontend build
src/chess.mjs                         standard-chess rules and SAN
src/protocol.mjs                      forecast and outcome schema
scripts/ledger.mjs                    record, verify, generate snapshots
scripts/model-runner.mjs              model provider adapters
src/                                zero third-party runtime dependencies
data/match.json                       audited-or-provisional match data snapshot
data/forecasts/                       forecast records (empty initially)
data/outcomes/                        observed-move records (empty initially)
tests/                                Node's built-in test runner
.github/workflows/                    CI and GitHub Pages workflows
```

## Publication

The repository is [fraware/grandmaster-vs-model](https://github.com/fraware/grandmaster-vs-model). CI and GitHub Pages workflows are included. GitHub Pages must be configured in repository settings to use GitHub Actions, and deployment success checked independently. The default branch is `main`.

## Licence and attribution

Original code and design are MIT licensed. Neither FIDE nor any model provider sponsors or endorses this project. Chessboard glyphs are Unicode characters rendered using the visitor's system font. Sports event information is attributed to FIDE.
