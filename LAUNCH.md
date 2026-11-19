# Launch readiness / blockers

The sole objective of public launch is a credible, visually compelling, timely and reproducible experiment. GitHub Trending rank cannot be guaranteed, and apparent virality is not evidence of model validity.

## Already implemented

- Static responsive site with separate illustrated and championship views; select and rotate a board; compare candidate legal moves; game selector for all 14 games.
- Local standard-chess validation, SAN rendering, special moves, and starting-position perft verification through depth four.
- An append-only local file creation path, record integrity checks, raw prompt and response preservation, and a generated static match snapshot.
- Provider adapters for OpenAI, Anthropic, and Google Gemini with offline mocked-response contract tests.
- GitHub Actions CI and GitHub Pages deployment workflows, awaiting a verified deployment.

## Critical blockers before calling it live

1. Obtain verified live broadcast source and exact round IDs, and implement and test a reliable ingest loop. Detect delayed PGN, retransmissions, corrections, and move-number mismatches. Test against complete historical broadcasts before a live match.
2. Configure real credentials in a private runner. Smoke-test the exact API models and record real provider request IDs, token usage and request/response artifacts. Keep keys outside Git and Pages artifacts.
3. Store provider transport errors, invalid outputs, timeouts and retries as first-class events. Zero valid output must be distinguished from zero attempt. Fix an explicit missingness and scoring policy.
4. Establish an external pre-move publication/timestamp policy, verify it end to end, and prohibit post-hoc amendments to original forecast records. Ensure accurate ordering with a published relay feed.
5. Implement a pinned Stockfish engine and include genuine engine assessment only with recorded build, parameters, search budgets and legal MultiPV moves. No mock engine centipawn numbers.
6. Add end-to-end browser tests and visual review at desktop and mobile viewports. This environment prevented direct Chromium navigation, so visual quality has not been confirmed.
7. Publish the tested source to [fraware/grandmaster-vs-model](https://github.com/fraware/grandmaster-vs-model), enable GitHub Actions as the Pages source, verify deployment, and place the verified live URL in the repository description.

## Distribution and timing

- **Before 22 November:** release reproducible source, a working example, and the full prediction protocol to chess/ML developers, acknowledging relevant prior work.
- **22–23 November:** test the public ingest, provider calls, GitHub publication ordering and mobile design. Opening-day content needs no fabricated leaderboard.
- **24 November:** start recording predictions for the actual match as soon as each source position is available, posting records ahead of each predicted human move. Share a small, visually readable position card only for independently anchored results. Link directly to the source record.
- **Later games:** report error bars and missing attempts, publish meaningful disagreements from the move ledger, and add benchmark baselines.

The promotional line is *"Can AI predict what a world champion will play next?"* The scientific claim must remain narrower: prospective top-1 human-move forecasts for one specific championship with declared model configurations.
