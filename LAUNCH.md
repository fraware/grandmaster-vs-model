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

The core conversion path is home or direct shared link → 2026 board → tap/drag/select a legal move → locally locked guess → official feed receipt → match/different reveal → next move → voluntary share. A visitor never triggers a paid model request. These predictions are tab-local entertainment, not authenticated pre-move observations. Human match rates must not appear in model results or be promoted as independent prospective accuracy.

**Release tests:** `npm test`, `npm run verify:2026`, `python tests/browser-smoke.py` and `python tests/live-spectator-smoke.py`. The new Playwright sequence covers pregame locking, source outage, PGN advancement, two scored moves, model-ledger separation and mouse/touch controls. Following deployment, verify actual public URLs and interact with the board on real mobile hardware. Browser fixtures are not substitutes for production-network or external usability studies. No observed engagement, sharing rate or GitHub Trending ranking is claimed.
