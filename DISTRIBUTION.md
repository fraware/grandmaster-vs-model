# Championship launch and distribution · 22–24 November 2026

**North Star:** independent adoption sufficient to reach GitHub Trending Daily #1. This is an objective, not a projection or current result. Repository baseline on 22 November: **one GitHub star, zero forks**, with no measured external publisher installs. Track changes against a live API snapshot; do not state invented visit, click, conversion, score or retention figures.

## Positioning

**For a chess viewer:** *Gukesh is about to move. What would you play?* A real, legal board, a private local choice and an official broadcast reveal. Before Game 1, make an opening guess. During play, only a source-validated active position is eligible. The choice is recreational and browser-local; the site's public data does not prove the prediction preceded the physical move.

**For chess publishers and teachers:** a free, accessible, privacy-conscious chess decision challenge with sources, a reproducible historical three-position embed and a live 2026 participation URL. A live 2026 compact embed is a separate product milestone; the existing 2024 historical widget should never be represented as the 2026 live game.

**For developers:** a zero-dependency standard-chess board and PGN implementation, 14 pinned Lichess match round IDs, deterministic tests, read-only broadcast observation and a transparent reservation-first model-capture protocol. A recorded model match on three 2024 positions is retrospective. No prospective accuracy leaderboard exists.

The homepage and the live lab now produce distinct social previews. The live image is generated at deployment from source, not fabricated from a played match.

## Launch moments

**22 November: opening ceremony.** Invite a small number of relevant chess publishers or coaches to try the actual site privately. Ask for the first unclear action and one mobile-device problem. Report their responses only if received. Verify the 2026 live OG image by loading the published `lab.html` URL in a real link-preview inspector; crawler caches can retain older card images.

**23 November: pregame.** Publish a single high-quality demonstration of a visitor opening the Game 1 board and locking one legal opening guess. Show the unverified local timestamp disclosure. Share the official source URL. Request permission before posting a promotion in a moderated chess forum. Contact publishers individually with the full link, a screenshot and the narrow question, *Would this help your viewers choose a move before Tuesday's match?*

**24 November: Game 1.** Official schedule: 15:00 Geneva CET, 14:00 UTC. Check the day's preflight and live Lichess PGN before reporting any actual moves. Share an observation only after source validation. If no model attempts or independent pre-move timestamps exist, display that fact plainly. This is the best moment for a timely product demonstration, subject to actual reliable feed delivery.

**Rest of the match:** repeat the same source-backed engagement workflow across the 14 scheduled classical games. A result from one round is neither evidence of model skill nor a sufficient adoption signal. Don't imply 14 rounds were all played merely because they appear on the published calendar.

## Channel selection and participation

1. **Chess educators, YouTube creators, streamers, club sites and newsletters:** personalized, permission-based invitation, direct link to the interactive 2026 game and actual screenshot. Ask whether they'd test it or link to it; don't announce an embed integration that nobody installed.
2. **Chess-focused developer circles, chess-programming discussions and maintainers:** demonstrate the open-source engineering and specific reproducible chess artifacts. Ask for technical criticism and actionable issues, not stars.
3. **Hacker News:** one factual *Show HN* submission, if the author's account and the project's scope meet the current [official Show HN rules](https://news.ycombinator.com/showhn.html). Lead with the interactive game and inspectable repo; describe the real technical constraint (how to distinguish a local guess from independent prospective model evidence).
4. **Reddit:** respect community rules. r/chess limits self-promotion, and a moderator reported in October 2026 that they were declining self-promotional app/tool submissions. Do not mass-post to r/chess or r/chessbeginners; request moderator permission or focus on an organically relevant discussion when allowed. r/chessprogramming is a potential technical community, subject to its current rules.

### Reusable launch texts (adapt personally; do not auto-post)

**Player invitation:** “Gukesh–Sindarov starts Tuesday. I built a tiny open-source board where you make your opening move before Game 1, then compare it with the Lichess broadcast. Free, no account. Curious what you'd play: https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&game=1#experiment”

**Developer launch:** “Show HN: Grandmaster vs Model – play real championship moves, inspect the source. A dependency-free chess board and PGN replay are one part; the other is an intentionally strict boundary between browser-local guesses and actual pre-move model evidence. Play: https://fraware.github.io/grandmaster-vs-model/ · Source: https://github.com/fraware/grandmaster-vs-model”

**Publisher introduction:** “I built a free, source-linked next-move game for Gukesh–Sindarov. Viewers choose one legal move in their own browser, then the validated Lichess feed reveals what the grandmaster played. I would value one candid usability critique before Game 1. Live board: https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&game=1#experiment. The historical three-position quiz is also embeddable on chess sites: https://fraware.github.io/grandmaster-vs-model/#embed”

These are drafts. Their presence in the repo does not signify publication, outreach, replies, participants or publisher adoption.

## Measurement and decision gates

**Technical gate:** latest main CI green; latest Pages deploy and production browser preflight successful; correct live social image delivered; 64-square playable board; source attribution; no fabricated moves.

**Usability gate:** document at least five independent testers not previously familiar with the product, device/viewport, whether they found the 2026 entry, whether they locked a legal move, and their observed difficulties. Do not manufacture testers or infer success from automated Chromium.

**Distribution gate:** record separately (a) publisher outreach sent, (b) interested responses, (c) actually published independent links or embeds, (d) reproducibly observed GitHub stars/forks, (e) independent feedback and bug reports. The project does not collect visitor analytics or private guesses. Any proposed opt-in measurement needs a separate privacy review.

**Scientific gate:** official PGN availability and successful parsing; per-game observed coverage; reservation publication before provider calls; explicit missingness; independently defensible chronology before ranking model matches. No score inflation from historical responses, unpublished reservations or delayed feeds.

**Stop/iterate signal:** with one star and zero forks, polishing metadata alone is insufficient. If independent publishers decline, ask why and fix the engagement hypothesis. If visitors do not understand the opening call, reduce first-screen friction. If link previews work and there is still no distribution, prioritize permissioned outreach and substantive product differentiation, not more decorative code.

## Source and competitive context

FIDE: https://worldchampionship.fide.com/schedule

Official Lichess broadcast index: https://lichess.org/broadcast/fide-world-chess-championship-2026/qfkdt8mn

Existing embeddable chess products include Hindsight chess decision embeds and Lichess game/study embeds; the mere existence of an iframe is not a defensible novel feature. Differentiate through credible source evidence, immediate play, full World Championship context and publishers' actual willingness to reuse the work.

The project is independent and has no FIDE, Lichess or player affiliation.
