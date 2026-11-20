# Historical chess data audit

## Scope and outcome

The completed FIDE World Championship Match 2024 in Singapore, Ding Liren versus Gukesh D, consists of 14 classical games. This repository contains the recorded sequence of **1,270 half-moves (plies)** from **all 14 games**.

The source files under `data/sources/2024/lichess-01.pgn` through `lichess-14.pgn` were downloaded from each game's individual Lichess championship broadcast using its known round identifier. The original files are stored unchanged. The primary source URL, source SHA-256, players, date, result, move count, and a hash of the reconstructed UCI sequence are pinned in `data/sources/2024/audit.json`.

The move sequences were compared against the separately published PGN Mentor file [`WorldChamp2024.pgn`](https://www.pgnmentor.com/events/WorldChamp2024.pgn). Both collections contain 14 games. Every game has the same date, result, number of plies, and **exact legal UCI move sequence**. There are **zero move discrepancies** and **zero result discrepancies**. Source-name spelling differences were normalized only in the generated public index. Independent publication does not establish independent electronic capture of the moves.

The PGN Mentor recording was retained as an input to the audit, not republished in the repository. The original retrieved file's SHA-256 is recorded in the manifest; a reader can fetch the file from PGN Mentor to independently reproduce the comparison.

The published `data/championship-2024.json` contains each game's date, players, result, opening as labeled by Lichess, source URL, and every move with SAN, UCI, FEN before, and FEN after. Every FEN transition is legally replayed using the project's chess engine. The historical Game 14 public challenge is checked against the same authoritative sequence.

| Game | Date | White | Black | Result | Plies |
|---:|---|---|---|:---:|---:|
| 1 | 2024-11-25 | Gukesh | Ding | 0–1 | 84 |
| 2 | 2024-11-26 | Ding | Gukesh | ½–½ | 46 |
| 3 | 2024-11-27 | Gukesh | Ding | 1–0 | 74 |
| 4 | 2024-11-29 | Ding | Gukesh | ½–½ | 84 |
| 5 | 2024-11-30 | Gukesh | Ding | ½–½ | 80 |
| 6 | 2024-12-01 | Ding | Gukesh | ½–½ | 92 |
| 7 | 2024-12-03 | Gukesh | Ding | ½–½ | 143 |
| 8 | 2024-12-04 | Ding | Gukesh | ½–½ | 102 |
| 9 | 2024-12-05 | Gukesh | Ding | ½–½ | 107 |
| 10 | 2024-12-07 | Ding | Gukesh | ½–½ | 72 |
| 11 | 2024-12-08 | Gukesh | Ding | 1–0 | 57 |
| 12 | 2024-12-09 | Ding | Gukesh | 1–0 | 77 |
| 13 | 2024-12-11 | Gukesh | Ding | ½–½ | 136 |
| 14 | 2024-12-12 | Ding | Gukesh | 0–1 | 116 |
| **Total** | | | | | **1,270** |

## Independent reproduction

```bash
npm test
npm run verify:history
```

`npm run verify:history` replays all 14 pinned raw PGNs, validates their SHA-256 checksums and recorded move-sequence fingerprints, compares every generated field against the checked-in JSON, and verifies every Game 14 move against the original site's challenge data. `npm run build:history` regenerates `data/championship-2024.json` deterministically from those pinned sources, without any network call. Both commands fail on altered input.

The source-audit workflow under `.github/workflows/archive-source-audit.yml` retrieves the original broadcast PGNs and PGN Mentor independently and preserves a downloadable evidence artifact. The audit retrieval is not connected to the model API and does not spend provider credits.

## Limits and provenance

- The historical game's **moves, results, and game identities** were compared across both source collections. The Lichess `%clk` clock annotations and `%eval` analysis annotations were **not** independently validated and are not treated as certified physical times or engine judgments.
- Source metadata is retrospective. The included PGNs contain **no independently established wall-clock timestamp for each physical board move**.
- The historical data does **not** establish any prospective model forecasting result. The recorded GPT three-position comparison was conducted in 2026 on an already published 2024 game and is separately documented in `METHOD.md`.
- The upcoming 2026 Gukesh–Sindarov World Championship is **a different match**. As of 20 November 2026, the first classical game has not started, and the repository records no fabricated 2026 moves. A confirmed Lichess broadcast source is configured for Game 1. Subsequent games need separately verified source identifiers before publication.

## Attribution and reuse

The Lichess broadcast source records are credited to Lichess and its broadcast contributors. Lichess describes broadcast game datasets as [Creative Commons Attribution–ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) material. The repository's MIT license applies to our original software code; the imported Lichess game records retain their source attribution and applicable data license. PGN Mentor is credited for the independently published comparison file, which is not redistributed here.
