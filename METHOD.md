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

Local SHA-256 is a digest, not a timestamp. Git commit author/committer metadata are not trusted clocks. Repository history hosted by GitHub provides publicly inspectable ordering and availability information, subject to limitations from force-pushes, delayed pushes, and feed delays. The current workflow signs newly created forecast record digests through GitHub's OIDC-backed artifact attestation system, provided the attestation service succeeds. This binds the artifact to a workflow identity and a public transparency record; it does not independently attest the physical move chronology or provider-owned output. Signed source-observation timestamps and authoritative venue move times remain unavailable.

## Relationship to prior work

- ChessDS DSC: purpose-trained grandmaster move prediction ([repository](https://github.com/ChessDS/chessds-dsc)).
- Maia-3: rating-conditioned modeling of human chess move distributions ([repository](https://github.com/CSSLab/maia3)).
- MoveLens: human-move model comparisons including LLMs and Maia ([methodology](https://chessassistlens.vercel.app/methodology)).
- ChessBench: LLM chess play comparison, a different evaluation target ([website](https://chessbench.org/)).
- Lichess broadcast: public real-time PGN and streaming documented for broadcast redisplay ([documentation](https://lichess.org/broadcast/help)).

Novelty is the attempted real-time, championship-centered and transparently inspectable deployment, not the underlying task of human-move prediction or the use of chess as an LLM benchmark. No exhaustive exclusivity claim is made.

## Public game ingestion (v0.3)

- The site retrieves the Lichess Game 1 broadcast from the public, documented PGN endpoint `https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn`. The identifier is linked to the [2026 championship broadcast](https://lichess.org/broadcast/fide-world-chess-championship-2026/game-1/xLgOJ6cb).
- The endpoint is checked once on page initialization, then at most every three minutes for an active live-tab spectator (five minutes following an error). The historical replay does not continually poll the source. Network failures or CORS limitations are displayed directly; no false success state is substituted.
- PGN tags are not treated as executable code or inserted unescaped into HTML. The source is parsed, moves are matched to a single legal SAN and converted to UCI/FEN with the independently tested local chess rules. Unexpected or illegal tokens invalidate the response. Previously observed move prefixes cannot be silently changed or shortened during a page session.
- During Pages deployment, `scripts/cache-broadcast.mjs` tries to write a same-origin PGN snapshot into the deploy artifact. The static cache has an explicit retrieval timestamp, canonical round identifier, player names, and UCI moves. Source identity, legal moves, and previous move prefixes are checked by the browser. A missing source leaves the committed pre-match default unchanged. Deployed snapshots are not independently immutable evidence of move chronology. The workflow is not yet scheduled.
- Broadcast timestamps mean *time of receipt of the data by this browser or build job*, not authenticated timestamps of physical moves. Displayed broadcast moves, even while live, cannot establish model prediction priority. No score receives an independent priority label on that basis.
- The historic replay draws on the [Lichess 2024 World Championship Game 14 broadcast](https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D/YaARFAYu), with winner, date, and length cross-checked against [FIDE's account](https://www.fide.com/fide-world-championship-game-14-gukesh-d-claims-title/). Its full 116-ply score is shipped with the site to keep the practice experience functional without a network connection. It was known retrospectively: guesses by website visitors do **not** count as prospective predictions in the 2026 benchmark.
- All 14 classical 2026 rounds have pinned, individually verified Lichess broadcast identifiers. No game is synthesized, and no retrospective model forecasts are represented as prospective.

## Browser deployment and limitations

A successful local PGN parsing test and a unit-tested endpoint address do not guarantee that the public Lichess server permits cross-origin access from the deployed website. A live network and browser acceptance test is a separate release check. The site reports a failed request as unavailable and keeps the historical replay functional. There is no application server or credentialed proxy. An optional static build-time snapshot backs up browser requests, although the present deployment workflow is not scheduled and has not been independently tested against a real 2026 PGN. Mocked-source DOM browser tests have passed at desktop and mobile sizes; real cross-origin behavior remains unverified.

## Automatic capture implementation (v0.4, November 19)

A GitHub Actions workflow now provides an optional, credential-gated and event-scoped sampling process for the identified Game 1 broadcast. The roster currently selects `gpt-6.2-astra`, `claude-fable-5-2`, and `gemini-4-neon` based on provider-issued model catalogs consulted 19 November 2026. These are provider API identifiers/aliases, not independently frozen model-weight hashes. Provider response IDs and returned model identifiers are retained when returned. The recorded prompt text and source position permit an exact request reconstruction, although provider execution and identity are not attested cryptographically.

The workflow runs no API calls without valid pregame source/player attribution and one or more configured credentials. Each available model is invoked at most once per `(game, ply, model)` by this code. Models are queried concurrently, with no retries, and a second PGN fetch detects a changed current position. Valid move strings, malformed outputs, transport failures, and postflight source changes produce individually inspectable records. Failed attempts remain part of the visible attempt denominator. A failed GitHub push may necessitate recovery from the workflow logs; the system is not an exactly-once distributed transaction.

**Published evidence vs verified leaderboard:** The workflow stores the raw returned text, prompt, request and response times, and a digest-protected JSON attempt under `data/attempts/`. `data/collection.json` is a validated, derived public index. Even a `valid` prediction means only a locally parseable legal UCI move was returned to the operator. A remote GitHub commit is performed by the GitHub Actions bot and is subject to scheduling and queueing. Its presence does not attest the exact physical playing time, nor does a later Lichess PGN reception certify that priority was secured before a grandmaster moved. The public UI reports attempts but withholds a numeric leaderboard. If independent publication chronology can be verified later, eligibility and denominators must be evaluated separately and explicitly.

**Scope:** All 14 verified classical-round Lichess broadcasts, with independently scheduled capture windows from 24 November through 11 December 2026. The collector is polled on GitHub's non-real-time cron. Authenticated physical move times remain unavailable. API secrets are provided as GitHub Actions secrets, never embedded in client code. Costs, access restrictions, rate limits, possible provider model rerouting, differences in reasoning defaults, output token budgets, and sampling latency affect comparison validity. Present provider requests use the same textual context and one-response protocol, but have distinct, publicly inspectable provider defaults and token limits; matched computational cost has not been demonstrated. API request adapters have been tested against simulated responses only.

### Post-release collection safeguards (v0.4.1)

The browser refreshes `data/collection.json` periodically for active live spectators; all presented model statements continue to be marked as operator-originated and timing-unverified. The collector checks standard starting-position identity and maps untrusted broadcast player tags to a fixed pair of names before model prompting. No external browsing or tools are passed to the API models. These safeguards do not independently attest the provenance of Lichess PGN bytes or prove a provider's internal reasoning process.

## Authenticated provider integration checks (November 2026)

The separate `provider-smoke.yml` workflow submits a single synthetic, explicitly non-forecast chess prompt to each configured provider. Its output records only sanitized operational metadata and one legal-move parse outcome. The smoke check does not establish pre-move prediction priority, replay accuracy, provider identity attestation, or a verified performance measurement. No test results enter `data/collection.json`. A failed model request is reported by category without including provider-supplied HTTP error bodies or credential material.

The provider adapters convert non-successful HTTP responses into a small fixed set of non-sensitive diagnostic codes. Provider-supplied error text is never printed verbatim. Anthropic API calls support an optional workspace identifier, as specified by the vendor for keys not scoped to a single workspace. Gemini 403 responses are classified only if the API provides a recognized explanation. An HTTP failure never counts as an evaluated model prediction.

## Public three-move challenge

The free homepage challenge uses fixed historical positions at zero-indexed plies 28, 61, and 108 of [Game 14 of the 2024 Ding–Gukesh match](https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D/YaARFAYu). `src/challenge.mjs` checks the known legal UCI moves against the complete SAN game; all positions are reconstructed by the same chess rules used by the ledger. The resulting score counts only exact matches to the historically observed move. There are no engines, frontier model calls, or performance claims in this experience.

Results are held only in the browser session. Sharing generates a text claim and a static result graphic; neither is a tamper-resistant attestation of a visitor's skill. The static site does not collect visitor guesses. This recreational challenge is explicitly separate from the prospective 2026 model evaluation and its evidence requirements.

## Retrospective demonstration versus prospective championship forecasts

The optional homepage comparison uses three real, legally replayed positions from Game 14 of the **2024** World Chess Championship. Model inference takes place in November **2026**. This temporal ordering is decisive: public game records could already be included in model training or available through prior information. A successful retrospective exact move is *not* evidence of pre-move forecasting or out-of-sample performance. Its denominator is fixed to three, a demonstration with no meaningful statistical power to generalize.

The bounded script `scripts/retrospective-run.mjs` uses a separately labeled 2024 prompt, records every result or failure, and publishes no data to the 2026 experiment. `src/retrospective.mjs` checks source identity, positions, expected grandmaster move, prompt, output, checksums and chronology; the source-controlled JSON remains empty until verified raw API outputs have been inspected. The website discloses the retrospective status and prevents a model move from being shown before visitors lock their own choices. A visitor's score is local and unauthenticated; a three-question score is an entertainment result rather than a model ranking. The 2026 collection protocol and its stricter chronology remain separate.

The 19 November 2026 authenticated [GitHub Actions run](https://github.com/fraware/grandmaster-vs-model/actions/runs/44514351159) produced three legally valid `gpt-6.2-astra` responses, each matching the known historical grandmaster move. The exact responses and reported usage are recorded in `data/retrospective-2024.json`. The three-out-of-three result is disclosed as **retrospective and potentially contaminated**, without inferential or prospective claims. A provider response ID is an operator-published record, not independently verified server attestation.


## Full historical match verification

The reproducible 2024 archive is documented in [DATA_AUDIT.md](DATA_AUDIT.md). All 14 games and 1,270 half-moves were reconstructed and compared with two independently published game-score files. Each generated SAN/UCI/FEN transition is checked, with pinned raw-source hashes. This validates historical chess records, **not** the time of individual physical moves or any prospective model predictions.

## 2026 round registry and first-observation limitations (20 November 2026)

All fourteen rounds of the Gukesh–Sindarov 2026 match have now been individually identified through a successful GET to the public Lichess tournament API (`qfkdt8mn`), anchored by the verified Game 1 round (`xLgOJ6cb`). The retrieved round identifiers, official broadcast URLs, and reported scheduled start times are recorded in `data/broadcast-2026.json`, validated from `src/match-2026.mjs`. Scheduled start time is not the time the first move physically occurred; Lichess may change the broadcast schedule.

The collector selects only a round with a scheduled start inside its bounded session window. It validates legally reconstructible PGN positions, source identity, and append-only UCI history before attempting a paid model request. Every individual game is isolated by its official PGN URL and by its observation/attempt filename. Source revisions are errors, not changes silently propagated into past evidence. A broadcast is recorded as *first observed* only once the response has been received and parsed. No individual move time is inferred from the broadcast date or game clock.

To bound founder-funded API exposure and avoid retrospective position selection, the default experimental sample predeclares `((ply - 1) % 5) == ((game - 1) % 5)` and a global ceiling of 900 total reserved request slots, counting unresolved reservations and earlier unreserved attempts. The observed match source determines eligibility at run time; GitHub Actions five-minute scheduling is best effort and may miss eligible positions. Responses deemed invalid or failing count toward the cap. The ceiling is in **requests** and does not constitute a verified limit in USD, nor a provider-specific credit cap. Independent provider spending controls remain essential.

An observed move and a recorded model attempt on the same position can later be compared for exact UCI agreement. The public index stores the comparison and whether the locally recorded API completion time precedes the **first recorded source observation**. It retains `timing: unverified` and `certifiedPhysicalPreMove: false`. Even an API completion timestamp preceding a later Lichess feed retrieval does not prove that a move had not already been played in the venue. No accuracy percentage is published on this basis. The separate 2024 retrospective dataset remains outside the 2026 ledger.

## Workflow attestation and provider readiness (20 November 2026)

The capture workflow prepares a SHA-256 checksum file from **only new forecast attempt files** and requests a [GitHub Actions attestation](https://github.com/actions/attest) for these digests. Anyone with the resulting published file and GitHub CLI may independently verify the artifact-to-workflow binding using `gh attestation verify PATH --repo fraware/grandmaster-vs-model`. The attempt's `captureRun` field is an operator-originated GitHub Actions reference and cannot serve as a substitute for a successfully verified attestation. If signing fails, the underlying attempt is still preserved without an attestation. Before Git publication, changed capture files are also uploaded as a 30-day workflow recovery artifact, limiting data loss if the push fails. Abrupt termination during the model request still risks unrecorded charges. The signer vouches for workflow provenance, not provider-output authenticity or pre-physical-move priority. Even a signed bundle issued before the next PGN retrieval cannot rule out earlier play and a delayed broadcast.

Scheduled calls are explicitly restricted by the workflow's `CAPTURE_PROVIDERS` allowlist. It begins with `openai` because that provider passed an authenticated integration check while the Anthropic and Gemini checks returned errors on 19 November. An adapter's offline test is insufficient to enable a provider. The allowlist is intentionally independent of the published model roster and of which secrets happen to be configured. The 900-slot ceiling includes unresolved reservations and does not enforce a dollar limit or provider-side exactly-once billing. Current evidence supports an exploratory, timestamp-qualified set of observations, without a verified comparative leaderboard.

## Streaming source observation experiment (20 November 2026)

The official Lichess API documents an open PGN streaming endpoint for each broadcast round. The observer uses that stream to signal the need for a fresh canonical snapshot, without identifying arbitrary transport chunks as complete PGNs. A connection-level HTTP 200 response has been verified on GitHub Actions for the pregame Game 1 stream. Each snapshot is parsed and checked using the identical source attribution, chess legality, player identity and append-only constraints enforced by the scheduled collector.

A bounded, strictly read-only 90-minute shadow session is scheduled once near the start of each classical game. It records receive and source-refresh completion timestamps reported by the runner, along with derived observation artifacts. The shadow artifacts are separate from the canonical public forecast ledger until reconciled and reviewed. No secrets are made available, and no provider requests occur. Live delivery latency, missed positions, disconnections and differences against the fallback collector must be evaluated empirically during a real game before introducing paid stream-triggered inference. As with polling, delayed broadcast updates cannot demonstrate physical pre-move priority.

## Durable pre-inference reservation protocol (v1.5, 20 November 2026)

**Reservation phase.** The GitHub Actions capture workflow initially gathers an identified, legally reconstructible Lichess broadcast position and applies the locked sample predicate. For each enabled provider with a configured key, it allocates a unique `(game, ply, model)` claim under `data/claims/`. The claim includes the specific FEN, source URL, digest of the exact prompt, provider/model version, operator-originated GitHub run reference, local reservation time and canonical SHA-256 checksum. Uniqueness covers all 14 games. Existing claims and pre-v1.5 attempts both occupy capacity under the 900-slot ceiling. A scheduled workflow first commits this evidence to GitHub `main` and verifies remote ancestry. Any unsuccessful publication terminates the job without making paid requests.

**Execution phase.** A separate step executes only newly published claims belonging to the same GitHub Actions run and attempt. It re-reads the source PGN, validates history and identity, checks that the exact claimed position and prompt are still current, and excludes already recorded attempts. No claims from previous interrupted runs are automatically retried. Responses, malformed outputs and sanitized transport failures are recorded once and linked to the reservation digest. A separate postflight PGN observation detects apparent feed advancement. No return status is used as proof of physical pre-move priority.

**Accounting and missingness.** The generated public index lists all reservations with `completed` or `unresolved` status and keeps attempted model responses in a separate collection. A request slot is consumed at reservation time, even if no API call ultimately occurs. An unresolved slot is explicitly distinct from a failed model prediction, because the provider may never have received the request. Where a provider call occurred and the process ended before persistence, its billing outcome is uncertain. Missing attempts must be disclosed in comparative coverage and never silently replaced.

**Trust and operational limitations.** This is a GitHub-hosted two-phase orchestration protocol, not a distributed exactly-once transaction. The published reservation constrains automatic re-dispatch through this workflow; it cannot establish provider execution identity, external monetary cost, or pre-physical-move chronology. A privileged operator could alter branch history, and separate provider infrastructure may behave independently. The workflow's signing integration covers forecast attempt artifacts when successful, not necessarily the pre-inference reservation itself. Provider-side billing limits remain mandatory; the 900-slot maximum is not a USD-denominated cap. Real-time streaming is still an uncredentialed shadow observer, independent of this paid inference path.

**Publishing constraint.** GitHub Actions pushes authenticated through `GITHUB_TOKEN` do not ordinarily trigger push-based downstream workflows, including Pages deployments ([official GitHub documentation](https://docs.github.com/en/actions/concepts/security/github_token)). The collector explicitly dispatches `pages.yml` through the supported `workflow_dispatch` exception following a successful evidence commit. Deployment is asynchronous and may fail independently; the repository record remains authoritative and the workflow's public site can lag behind the latest reservation or response.

## Recreational 2026 spectator challenge (v1.6, 20 November 2026)

The website includes an account-free audience prediction loop, deliberately separate from the founder-funded model experiment. A spectator may lock a legal UCI move against the exact `(game, ply, FEN)` in the current browser tab. Before the announced start of each round, the board permits an opening-move guess within a bounded 14-day pregame window. The official PGN has not yet confirmed player colors in that state, and this is described as an informal opening guess. During the match, prediction entry is restricted to the latest legally reconstructed position, an unfinished PGN, the declared session window, and a successful current source retrieval. The previously played positions remain replay-only.

A locked move is validated against the local dependency-free chess rules and recorded in per-tab `sessionStorage` as `spectator-session-v1`. The record includes the game, source URL, ply, FEN, UCI move, and local device timestamp. It is immutable for that position. Tab-local storage access or quota failures degrade to a disclosed in-memory state, and malformed persisted records are never overwritten. Local storage is private to the device/browser context, without an account or backend collection service.

An observed move is revealed only from a legally validated, append-only official broadcast reconstruction, with the actual `fenBefore` checked against the stored prediction position. If the broadcast changes unexpectedly or diverges from the stored FEN, the session records a source conflict rather than scoring the choice. A network outage retains the locked prediction without inventing an outcome. An exact UCI match is distinct from move strength. Local results support voluntary share text that explicitly disclaims independent priority attestation.

**Evidence separation.** No spectator choice enters `data/collection.json`, the request-reservation log, the model attempt denominator, or a provider comparison. Visitor clocks, local storage, editable client code and delayed Lichess delivery cannot authenticate an actual pre-physical-move forecast. Consequently, spectator match counts are recreational indicators, never a scientific prospective accuracy leaderboard. End-to-end browser coverage simulates a pregame guess, connection loss, append-only PGN advancement, source-based reveal, an additional live prediction and keyboard/mobile interaction using synthetic 2026 match fixtures. These tests do not establish the deployed site's network latency.

## Public deployment network preflight (20 November 2026)

The optional `Production spectator and Lichess browser preflight` workflow runs a real Chromium browser against the deployed GitHub Pages site, then observes the application's own completed cross-origin broadcast refresh. An independent in-page `fetch` of the exact pinned Game 1 Lichess PGN tests actual browser CORS policy, not a server-side HTTP proxy. It verifies the registry, board, spectator panel and mobile viewport; retains limited JSON and screenshot evidence, and runs without provider secrets. The 20 November run succeeded with a fresh application source status and an HTTP 200 PGN response. This confirms access at one instant and from one GitHub runner. It is not evidence of subsequent uptime, streaming latency, delivery before every played move, or the physical chronology of chess decisions.
