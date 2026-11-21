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
