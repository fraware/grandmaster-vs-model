# Evaluation protocol and trust boundaries

**Status**: prospective specification, with partial software implementation and no empirical results. This document separates protocol intentions from completed infrastructure.

## Evaluation objective

For a chess position \(x_t\), player identity \(h_t\), and causal game history \(H_{<t}\), the prediction task is \(\hat m_{k,t} = f_k(x_t,h_t,H_{<t})\), where \(f_k\) is a frozen invocation of model \(k\). The observed response \(m_t\) is the next move made by the player. Primary per-move scoring is \(1[\hat m_{k,t}=m_t]\). The experiment predicts a player choice, not a maximum-engine-evaluation action.

Prediction origin, context, time precedence, and game position are separate requirements. A correct match found retrospectively is not counted as an attested prospective prediction.

## Admission criteria for comparisons

1. **Position**: same canonical FEN, player to move, move history, and legal UCI move set. Check that the player identity and game number match an independently sourced broadcast.
2. **Model**: exact provider, provider-returned model identifier, request configuration, shared prompt version and prompt bytes, tool settings, and response text. No silent retries that replace an earlier incorrect or malformed response.
3. **Timing**: response completed and corresponding forecast published before the human move. Rely on externally observed publication evidence rather than local system time or local Git commit timestamps.
4. **Outcome**: broadcast-observed UCI move, provenance URL, and defensible move-time evidence. Distinguish the physical move time from the time a relay first reported it.
5. **Integrity**: retain full prompt, original response, and local checksums; any correction creates an amendment record instead of overwriting an already published forecast.

The current CLI checks chess legality, record structure, and local checksums. It does not verify external time anchors, source timestamps, identity attestation, or amendment chains.

## Primary metrics

**Top-1 exact-match accuracy**: numerator = eligible prospective forecasts with matching UCI; denominator = eligible prospective forecasts with an observed move. Report denominator and missing attempts per model. Illegal and unparseable model outputs are failures at the response-validation stage and must not disappear silently from the denominator. The current API runner fails loudly and does not yet persist structured failure records; such a ledger is a launch blocker for any formal comparative score.

**Other analyses (planned, not implemented)**: top-k probability mass and log loss only if the model supplies a precommitted distribution; engine centipawn loss and MultiPV rankings under a pinned Stockfish protocol; calibration diagnostics; paired model comparisons by game and game phase. Chess-specific baselines must include Maia-3 and, where practical, ChessDS DSC rather than treating Stockfish as a human-behavior predictor.

**Uncertainty**: account for dependent plies from a single game. Simple per-ply binomial confidence intervals underestimate dependence. With at most fourteen championship games, uncertainty will remain considerable even if hundreds of moves are sampled. The public dashboard must not extrapolate universal model superiority from the match.

## Model exposure and leakage

General-purpose models are unlikely to possess the unreleased move in their weights, though responses can be contaminated by tools, live browsing, replay transcripts, or uncontrolled retrieval. Prohibit external tools at API invocation. Record query timing and latency. The shared prompt includes legal moves and player identity; model comparisons must account for these controls. Any ability to query the live broadcast beyond the supplied position compromises inference.

## Publication priority

Local SHA-256 is a digest, not a timestamp. Git commit author/committer metadata are not trusted clocks. Repository history hosted by GitHub provides publicly inspectable ordering and availability information, subject to limitations from force-pushes, delayed pushes, and feed delays. The strongest implementation would record independent signed timestamp receipts and contemporaneous broadcast poll artifacts. Neither is implemented in this prototype.

## Relationship to prior work

- ChessDS DSC: purpose-trained grandmaster move prediction ([repository](https://github.com/ChessDS/chessds-dsc)).
- Maia-3: rating-conditioned modeling of human chess move distributions ([repository](https://github.com/CSSLab/maia3)).
- MoveLens: human-move model comparisons including LLMs and Maia ([methodology](https://chessassistlens.vercel.app/methodology)).
- ChessBench: LLM chess play comparison, a different evaluation target ([website](https://chessbench.org/)).
- Lichess broadcast: public real-time PGN and streaming documented for broadcast redisplay ([documentation](https://lichess.org/broadcast/help)).

Novelty is the attempted real-time, championship-centered and transparently inspectable deployment, not the underlying task of human-move prediction or the use of chess as an LLM benchmark. No exhaustive exclusivity claim is made.

## Public game ingestion (v0.2)

- The site retrieves the Lichess Game 1 broadcast from the public, documented PGN endpoint `https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn`. The identifier is linked to the [2026 championship broadcast](https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb).
- The endpoint is polled from visitors' browsers every 90 seconds while the page is active. Network failures or CORS limitations are displayed directly; no false success state is substituted.
- PGN tags are not treated as executable code or inserted unescaped into HTML. The source is parsed, moves are matched to a single legal SAN and converted to UCI/FEN with the independently tested local chess rules. Unexpected or illegal tokens invalidate the response. Previously observed move prefixes cannot be silently changed or shortened during a page session.
- Broadcast timestamps mean *time of receipt of the data by this browser*, not authenticated timestamps of physical moves. Displayed broadcast moves, even while live, cannot establish model prediction priority. No score receives an independent priority label on that basis.
- The historic replay draws on the [Lichess 2024 World Championship Game 14 broadcast](https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D/YaARFAYu), with winner, date, and length cross-checked against [FIDE's account](https://www.fide.com/fide-world-championship-game-14-gukesh-d-claims-title/). Its full 116-ply score is shipped with the site to keep the practice experience functional without a network connection. It was known retrospectively: guesses by website visitors do **not** count as prospective predictions in the 2026 benchmark.
- Only 2026 Game 1 has a verified public broadcast identifier at this revision. Other games remain explicitly unconfigured. No game is synthesized, and no retrospective model forecasts are generated.

## Browser deployment and limitations

A successful local PGN parsing test and a unit-tested endpoint address do not guarantee that the public Lichess server permits cross-origin access from the deployed website. A live network and browser acceptance test is a separate release check. The site reports a failed request as unavailable and keeps the historical replay functional. There is no application server, credentialed proxy, or backend cache at present.
