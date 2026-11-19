# Launch readiness / blockers

The sole objective of public launch is a credible, visually compelling, timely and reproducible experiment. GitHub Trending rank cannot be guaranteed, and apparent virality is not evidence of model validity.

## Already implemented

- Static responsive site with separate historical and championship views; select and rotate a board; compare candidate legal moves; game selector for all 14 games.
- Local standard-chess validation, SAN rendering, special moves, and starting-position perft verification through depth four.
- An append-only local file creation path, record integrity checks, raw prompt and response preservation, and a generated static match snapshot.
- Provider adapters for OpenAI, Anthropic, and Google Gemini with offline mocked-response contract tests.
- GitHub Actions CI and GitHub Pages deployment workflows, awaiting a verified deployment.

## Critical blockers before calling it live

1. Confirm browser access to the verified Game 1 Lichess broadcast from the deployed domain. The source identifier, PGN legal replay, monotonic session checks, and build-time same-origin cache are implemented and tested with fixtures. Remaining games need confirmed round identifiers. Long-term retention, game corrections, and relay timing still need production tests.
2. Configure real credentials in a private runner. Smoke-test the exact API models and record real provider request IDs, token usage and request/response artifacts. Keep keys outside Git and Pages artifacts.
3. Store provider transport errors, invalid outputs, timeouts and retries as first-class events. Zero valid output must be distinguished from zero attempt. Fix an explicit missingness and scoring policy.
4. Establish an external pre-move publication/timestamp policy, verify it end to end, and prohibit post-hoc amendments to original forecast records. Ensure accurate ordering with a published relay feed.
5. Implement a pinned Stockfish engine and include genuine engine assessment only with recorded build, parameters, search budgets and legal MultiPV moves. No mock engine centipawn numbers.
6. Add deployed-domain browser and cross-origin tests. Desktop and mobile DOM interaction tests using locally injected code and synthetic network responses passed, including offline cached data; live-domain network behavior and visual regression automation are still outstanding.
7. Repository source is published at [fraware/grandmaster-vs-model](https://github.com/fraware/grandmaster-vs-model). Enable GitHub Actions under repository Settings → Pages, verify public deployment, and add the verified live URL to the repository description. Render deployment was rejected because the connected Hobby workspace is at its 25-service limit.

## Distribution and timing

- **Before 22 November:** release reproducible source, a working example, and the full prediction protocol to chess/ML developers, acknowledging relevant prior work.
- **22–23 November:** test the public ingest, provider calls, GitHub publication ordering and mobile design. Opening-day content needs no fabricated leaderboard.
- **24 November:** start recording predictions for the actual match as soon as each source position is available, posting records ahead of each predicted human move. Share a small, visually readable position card only for independently anchored results. Link directly to the source record.
- **Later games:** report error bars and missing attempts, publish meaningful disagreements from the move ledger, and add benchmark baselines.

The promotional line is *"Can AI predict what a world champion will play next?"* The scientific claim must remain narrower: prospective top-1 human-move forecasts for one specific championship with declared model configurations.

### November 19 development checkpoint

The dashboard now includes a real replay of the 2024 championship's deciding Game 14 and a direct Lichess PGN integration for the upcoming 2026 Game 1. The local chess-rule replay and parsing tests pass. The 2026 match has not begun; there are no real 2026 moves or model results to publish. Direct browser access to the broadcast must be independently confirmed at deployment. A legally checked same-origin snapshot is staged on Pages builds; no automated deployment schedule is configured. GitHub Pages still needs to be enabled under repository Settings → Pages with GitHub Actions as the publishing source. Do not describe Pages as live until the deployment check succeeds.


## Live-capture activation check (2026-11-19)

- Verify the newest GitHub Pages workflow run has succeeded and inspect the deployed origin. Local CI success is a separate fact.
- In GitHub Actions secrets, configure individually budgeted `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY` only for providers approved for spending. Do not place credentials in repository files, commit messages, browser fields, or chat messages.
- Test a manual collection invocation before the match and confirm it exits without API calls while no identified live chess position exists. Add an API sandbox credential test only if charges and permissions are authorized.
- Review the workflow's actual executed response fields, rate limits, and provider entitlements. Never silently reinterpret an HTTP error as a prediction.
- Before each scored live forecast, check a public commit/observation chronology. A forecast recorded retrospectively, even with a plausible timestamp, does not qualify.
- Recover failed pushes or missing workflow runs explicitly. GitHub scheduled Actions are not a low-latency guaranteed event stream.
- Obtain verified broadcast round IDs for Games 2–14 before extending coverage. No speculative round IDs belong in production.
