# Build report — initial source package

- Initially prepared 18 November 2026 (Pacific time); repository preparation updated 19 November 2026, ahead of the scheduled 24 November first classical game.
- Local Node.js 22 test run: **19 / 19 tests passed**.
- Standard chess initial-position perft: 20, 400, 8,902, and 197,281 nodes at depths 1–4, respectively.
- Local forecast integrity check: passed with zero real forecasts and zero results (as expected).
- Isolated end-to-end test: created one **synthetic** forecast, one **synthetic** outcome, and successfully built their combined JSON snapshot in a separate temporary directory. No synthetic records were placed into the deliverable's real championship ledger.
- Three provider adapters tested against mock responses; no live provider calls executed.
- HTML duplicate-ID check: passed.
- JavaScript syntax checks: passed.
- Browser rendering: **not verified**. Local browser navigation was blocked by the execution environment's administrator policy. The page needs a visual check in a normal browser.
- Live chess broadcast ingestion: **not implemented**; no known 2026 live round ID pinned.
- Stockfish assessments: **not implemented**; zero engine evaluations claimed.
- Public repository: **created** at https://github.com/fraware/grandmaster-vs-model. Source upload and public Pages deployment are independent steps; deployment is not verified in this report.
- Forecast origin and timestamps: **operator-reported**, not provider- or third-party-attested. SHA-256 only checks local content integrity.
