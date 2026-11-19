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
