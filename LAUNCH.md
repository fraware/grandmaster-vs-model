# Launch brief · Grandmaster vs Model · 19 November 2026

The public experience is a fast, free, three-position challenge grounded in the December 2024 Ding–Gukesh World Championship final. The primary page is **the game**. The separate research lab preserves the live 2026 broadcast viewer, recorded model attempts and public methodology.

## Release standard

- Every move and answer comes from the legally replayed, sourced historical game.
- No account, visitor API key, advertising, tracking, or model request is needed to play.
- The game fits in one prominent board with selection, immediate reveal, three-round score and native/share-text/image fallbacks.
- A result card reflects the actual three answers; a downloadable image is generated locally.
- Mobile and narrow-width controls are first-class, including the bottom reveal action once a move is selected.
- The original `/ ?mode=live` links (without the space) are redirected to the research lab for backwards compatibility.
- Model accuracy stays unpublished until a genuinely prospective, independently inspectable chronology exists.

## Technical verification

Run `npm test`, `npm run verify`, `npm run verify:collection`, and `python tests/browser-smoke.py`. The browser test runs against deterministic fixture responses and checks the challenge, result sharing, separate lab replay, live-feed projection, and offline fallback. A fixture is not a production endpoint test.

Inspect both GitHub Actions checks for the exact release commit. The Pages deployment should publish `index.html`, `lab.html`, both CSS files, browser modules, and bundled data. Confirm the actual site URLs independently when possible.

## Product/financial decisions

- Official model attempts are privately credentialed, founder-funded, and capped by provider budgets.
- Visitor interactions reuse public results without triggering provider inference.
- Optional bring-your-own-key integrations belong in developer tooling, not the main visitor flow.
- No model-vs-human win/loss claims are extrapolated from the historical three-position experience.
- The model smoke test confirmed an OpenAI response, while Anthropic and Gemini access checks failed as of November 19. Those providers cannot be described as operational.

## Distribution

The challenge is the shareable object. Social text includes a score, the truthful three-position record and a link. Native mobile sharing can attach a generated graphic when supported. The website's Open Graph cover is a tested page-derived design, and the GitHub README includes an actual Chromium screenshot.

Launch through chess players, chess educators and technical developer communities with tailored context. Avoid misleading claims, coordinated stars, or artificial traffic. The observable funnel is landing-page visit → first legal move → completed challenge → voluntary share → GitHub visit/star. The project does not collect analytics by default; never invent funnel rates.

**External repo metadata is not populated by source pushes.** Add a concise GitHub description, verified homepage URL and topics through GitHub's About editor if no authorized repository-settings action is available. The GitHub Trending daily ranking cannot be guaranteed through design or marketing copy alone.

## Championship preparation

FIDE's scheduled first game is **24 November 2026**. The separate `lab.html` is a prospective research surface. Ensure real provider access, actual scheduled collection, a reliable pre-move publication policy, complete missingness records, and an appropriately bounded spending policy before making scored model-comparison claims. The 20 November Lichess API discovery identified all 14 round IDs, published in `data/broadcast-2026.json`. Recheck their scheduling and identity before each game; no played moves are assumed before play starts. The collector uses a declared five-ply sample and a 900-attempt ceiling, not guaranteed continuous observations or a monetary budget limit.

## Live spectator product checkpoint · 20 November 2026

The public site now has two linked activities. The homepage remains the immediate three-position 2024 chess challenge, which uses actual historical moves and a plainly retrospective model demonstration. The separate 2026 board now lets visitors make a **local opening guess before Game 1**, and use the identical interaction on the latest sourced position during a confirmed live session. Each locked guess resolves only through the legally checked official broadcast; the user can immediately continue at the latest position. All 14 broadcast sources remain selectable.

The core conversion path is home or direct shared link → 2026 board → tap/drag/select a legal move → locally locked guess → official feed receipt → match/different reveal → next move → voluntary share. A visitor never triggers a paid model request. These predictions are browser-local entertainment, not authenticated pre-move observations. Human match rates must not appear in model results or be promoted as independent prospective accuracy.

**Release tests:** `npm test`, `npm run verify:2026`, `python tests/browser-smoke.py` and `python tests/live-spectator-smoke.py`. The new Playwright sequence covers pregame locking, source outage, PGN advancement, two scored moves, model-ledger separation and mouse/touch controls. Following deployment, verify actual public URLs and interact with the board on real mobile hardware. Browser fixtures are not substitutes for production-network or external usability studies. No observed engagement, sharing rate or GitHub Trending ranking is claimed.

## Production live-browser acceptance

The live page has been checked from an independent Chromium browser running against the deployed `fraware.github.io` origin. The [20 November preflight](https://github.com/fraware/grandmaster-vs-model/actions/runs/44742780417) returned a fresh in-app Lichess source observation and a cross-origin HTTP 200 for Game 1. The acceptance script and manual workflow are in `tests/production-preflight.py` and `.github/workflows/production-preflight.yml`. The test performs read-only public network requests and has no provider secrets. Run it again before Game 1 and investigate any discrepancy before announcing real-time reliability. Actual observed-move delivery and pre-physical-move model prediction timing remain open validation problems.

## Homepage live entry (v1.7, 20 November 2026)

The next relevant official 2026 round is prominently linked in the first-screen home heading, even at narrow mobile widths, with a fuller event introduction following the immediately playable retrospective board. The copy distinguishes pregame opening guesses, a scheduled broadcast window, and historical board exploration. It never asserts physical play from scheduling metadata alone. Node tests cover all fourteen game boundaries and Chromium tests verify that the entry is visible without scrolling on desktop and mobile. Neither conversion analytics nor visitor tracking is introduced.

## Championship stream readiness (v1.8)

Before Game 1, verify the hourly read-only source workflow is enabled, that every run receives a unique artifact, and that a representative source snapshot succeeds. The expected observational start sequence for November 24 is 14:03, 15:03, …, 23:03 UTC. The ten sessions are distinct because GitHub Actions scheduling is best effort and one interrupted job must not erase the entire day's collection. Source update observations must later be reconciled across runs; never report source timestamps as independently established physical move times. The scheduled paid model collector stays separate from this observer.

## Recover and reconcile match-day shadow artifacts

Each scheduled hourly observer uploads a uniquely named, 90-day source artifact. Reconcile downloaded artifacts through `npm run reconcile:shadow -- --dir DIRECTORY --out NEW_REPORT.json`, preserving their original names and content. Check the report for contradictory histories, missing sessions and anomalous operator timestamps. The deterministic output is not a signed physical move timeline, and its source records must not be substituted for canonical provider prediction attempts. Real data from Game 1 or later rounds are necessary before any empirical latency statistics can be reported.

## Automatic game-day browser readiness

At 13:25 UTC on each scheduled classical game date, the GitHub Actions preflight is intended to test the live Pages route and public PGN for **that day's game**. Verify both its success and the JSON artifact before presenting any round as operationally tested. This is a best-effort scheduled run, not guaranteed real-time monitoring or evidence of player move times. Game 1's first check is scheduled for 24 November 2026, ahead of the 14:00 UTC announced opening.

## Live match invitation loop

The 2026 spectator board now exposes **Challenge a friend** before a visitor commits a local move, and retains it after the lock and sourced reveal. Shared text identifies the broadcast round, asks the recipient to choose independently and preserves the sender's private move and timestamp. It does not reveal the original SAN or UCI, nor claim authenticated ranking, move priority, or physical play timing. The link is a canonical game-level entry; the recipient's origin storage is separate. Browser acceptance tests cover pre-pick, post-lock and post-reveal sharing on desktop and mobile. The feature is a product hypothesis, with no observed referral or retention statistics.

## Exact-set peer challenges

A completed round now shares `?set=N&target=M#challenge`, with N from 1 to 5 and M from 0 to 3. The recipient enters that same sourced three-position set and sees a self-reported target. After three moves the local score is compared and the recipient gets a new result link. The score is explicitly editable, has no authenticated identity, and never contributes to the prospective model ledger. Reproduce the URL validation tests with `npm test` and the desktop/mobile full-session tests in `tests/browser-smoke.py`. This feature is a shareability hypothesis; adoption or referral conversion has not been measured.

## Returning participants (v1.11)

The pregame interaction now retains a local opening prediction across normal tab closure using browser site storage and migrates older in-tab predictions. A returning visitor is directed to the saved reveal from sourced PGN, then can continue to the latest position. Test cross-tab changes, storage access failures, loss of site data, external/other-device visits and browser back/forward behavior. No account or telemetry is introduced; do not describe these records as independently authenticated prediction timestamps.

## Private championship reminder (v1.12)

Once a pregame spectator prediction is saved, the interface allows a local `.ics` download for that round's official scheduled start. The user must import this file into their calendar; no reminder is promised without client support. The filename, dates, timezone, source URL and privacy boundaries are tested across all 14 rounds. Browser tests check the actual download and confirm the action is hidden following the published start. Calendar events never include private predicted moves.

## Embeddable source-linked historical challenge

The 2024 three-position historical challenge is available in a compact, opt-in iframe at `/?embed=1#challenge`, with an actionable brand attribution and a full-game link. It retains all legal move validation, the cited archived source, automatic reveals, native share/image exports, and the strict retrospective-model boundary. The host needs one HTML iframe element, no API key or host-side scripts. Optional self-reported peer challenge URLs work inside a frame as well. Full-page links drop `embed=1`, preserving a valid set/target.

The product hypothesis is distribution through chess clubs, instructional pages and independent chess publishers. The full HTML snippet and browser/security notes are in `README.md`. Chromium acceptance tests place the embed inside a distinct simulated publisher origin, check a 540-pixel and a 320-pixel viewport, and complete an opening prediction. Deployment-time preflight additionally opens the **actual published page** inside a cross-origin iframe, testing framing headers, a complete board and source attribution. Successful synthetic tests do not establish actual usage, adoption, or viral growth. Track downstream links and stars only from genuinely observable voluntary participation.


## Publisher conversion checkpoint

The public homepage now exposes a copy-and-preview action for the existing, legally sourced 2024 chess embed. The snippet is generated by `src/embed.mjs`, identical to the README example, and uses a privacy-preserving `referrerpolicy`. Browser tests cover clipboard permission success, manual text selection on fallback, responsive layout, and the iframe embedded at a separate origin. The iframe view hides publisher controls, keeping the actual chess game first.

This is an access improvement, **not observed adoption**. Publisher experiments should measure actual independent embeds and voluntary referral participation through directly observed publisher pages, not speculative impression or conversion numbers. Existing products already supply chess embeds and master-move guessing widgets, including Hindsight; our claim of value rests on sourced championship-specific positions, transparent model evidence, and the separate 2026 event. Do not describe this feature as the first or only embeddable chess quiz.


## Capture integrity correction · 21 November 2026

A production GitHub Actions forecast is now accepted into the public collection index only when the corresponding immutable reservation remains present and the original claim digest, prompt, position, model, run and chronology match. Rehashing a record after deleting its reservation reference does not convert an Actions-originated forecast into an admissible manual attempt. Ordinary legacy test records remain independently labeled and accepted.

The five-minute capture cron now matches the declared 14 classical game days, including 00:02–00:57 UTC on the subsequent calendar day. A separate season check skips expensive capture work for scheduled invocations after the year 2026. The 11-hour source-session limit remains independently enforced by the capture code. This prevents irrelevant off-day runs and guards historical provenance; it does not confirm provider credentials, eliminate GitHub scheduler delays, or certify model submissions as preceding physical chess moves.


## Paid-capture recovery correction · 21 November 2026

The collection workflow now detects uncommitted evidence and attempts a 30-day recovery upload **immediately after** the reservation/paid-execution steps, even if either step failed. This precedes index validation, signed attestations and the final Git push. The material may include a partially written or invalid record; it must be labeled as **unvalidated operational recovery**, kept out of the public comparison ledger until checked, and never automatically used to reissue a reserved provider request. A job-wide timeout, runner termination, or outage of artifact storage can still lose in-flight records. No exactly-once guarantee or independent pre-move timing follows.

The regression tests assert the upload's position and unconditional-on-failure gating, uniqueness of the recovery artifact name, and absence of a dependency on post-execution validation. The launch operator should inspect the workflow's recovery artifact on any failed paid-capture run before taking action.


## Explicit PGN round identity guard · 21 November 2026

The browser's live 2026 board, the legally checked same-origin broadcast cache, and the prospective model collector now pass the requested game number into the same championship selector. If a provider PGN explicitly contains a parseable numeric `Round` value belonging to another game, the source is rejected before display or paid inference. Two matching championship boards in one feed are rejected as ambiguous. Historical and unnumbered PGN consumers preserve their prior behavior. Tests include a browser-level Game 2 mismatched feed, snapshot rejection, and no-paid-request collection rejection.

This guard detects explicit source contradictions; many official PGNs omit a numerical round label. It does not independently establish the identity of an untagged source, physical chronology, or the official accuracy of user-facing results.


## Shared standard-position source guard · 21 November 2026

All three 2026 PGN ingestion paths now enforce exactly the official chess starting FEN **on the parsed source game**: the spectator's direct Lichess fetch, the static broadcast-cache builder, and the paid forecast collector. A PGN played legally from an alternate starting FEN, including one with the original pieces but modified castling rights, is rejected before the public browser adopts it, the cache serializes it, or a collector reserves/spends a provider slot. This avoids silently recasting the alternate-source UCI sequence as a standard World Championship game.

Node tests exercise a legally replayable alternate FEN and confirm no observation, reservation, or paid request is made. Chromium tests cover source rejection and subsequent recovery when a valid PGN becomes available. This proves consistent handling of the declared input boundary under controlled fixtures; the real live feed's correctness and physical chronology remain independently unverified.


## Terminal PGN result integrity · 21 November 2026

The PGN parser now retains a terminal, unambiguous result from the mainline movetext when the `Result` header is missing. It rejects contradiction with an explicit header and result markers inserted before further moves. This removes a paid-collection failure mode in which a completed game lacking a result header appeared ongoing. Fixture tests verify that `--reserve` ends a finished game with no provider calls or claims, while an internally inconsistent PGN produces no public observations or attempts. Comment and variation result markers are ignored as annotations.

The outcome is sourced from PGN syntax; no independent confirmation of physical game termination is implied. Existing validated source snapshots and historical games are unchanged.

