/**
 * Published, standalone embed markup for chess publishers and educators.
 *
 * The URL is fixed at the project's public HTTPS origin. This helper takes no
 * user input, creates no tracking parameters, and embeds the existing sourced
 * historical challenge without changing legal moves or model evidence.
 */
export const HISTORICAL_EMBED_URL =
  'https://fraware.github.io/grandmaster-vs-model/?embed=1#challenge';

export function publisherEmbedHtml() {
  return `<iframe
  title="Grandmaster vs Model: predict three World Championship moves"
  src="${HISTORICAL_EMBED_URL}"
  width="540"
  height="1080"
  loading="lazy"
  referrerpolicy="no-referrer"
  style="display:block;width:100%;max-width:540px;border:0"
></iframe>`;
}


/** Current scheduled round, chosen by the live page at display time. */
export const LIVE_EMBED_URL =
  'https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&embed=1#experiment';

/**
 * Fixed, publisher-safe 2026 iframe. It runs the same source-validated
 * spectator interface as the full public page, never a duplicate simulation.
 * Third-party browser storage restrictions can limit persistent guesses.
 */
export function publisherLiveEmbedHtml() {
  return `<iframe
  title="Gukesh vs Sindarov: play the next World Championship move"
  src="${LIVE_EMBED_URL}"
  width="620"
  height="1460"
  loading="lazy"
  referrerpolicy="no-referrer"
  style="display:block;width:100%;max-width:620px;border:0"
></iframe>`;
}
