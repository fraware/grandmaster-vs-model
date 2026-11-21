/**
 * Conservative browser-side access policy for the public Lichess broadcast.
 *
 * The scheduled UTC window is permission to check for feed updates, not
 * evidence of physical chess play. A user-initiated refresh remains possible
 * outside the automatic polling window unless a rate-limit cooldown applies.
 */
import {roundInfo} from './match-2026.mjs';

const SESSION_MS = 11 * 60 * 60 * 1000;
const MIN_RATE_LIMIT_MS = 65_000;
const MAX_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

/**
 * Permit automatic browser polling only within a scheduled, unfinished round.
 * The initial live-page fetch is independently useful and is not gated here.
 *
 * @param {{game:number,at:string|number|Date,result?:string}} state
 * @returns {boolean}
 */
export function shouldAutoRefreshBroadcast({game,at,result='*'}) {
  const instant = at instanceof Date ? at.getTime() :
    typeof at === 'number' ? at : Date.parse(at);
  if(!Number.isFinite(instant))throw new Error('Invalid broadcast polling instant');
  if(!['*','1-0','0-1','1/2-1/2'].includes(result))
    throw new Error('Unexpected broadcast game result');
  const start = Date.parse(roundInfo(game).startsAt);
  return result === '*' && instant >= start && instant < start + SESSION_MS;
}

/**
 * Honor Retry-After in seconds or HTTP date format following HTTP 429.
 * Lichess asks clients to pause for at least a minute. Include five seconds
 * of margin, and bound pathological header values to 24 hours.
 *
 * @param {string|null|undefined} retryAfter
 * @param {number} now - Local operator/browser clock (unattested).
 * @returns {number} milliseconds
 */
export function rateLimitDelayMs(retryAfter,now=Date.now()) {
  if(!Number.isFinite(now))throw new Error('Invalid broadcast retry clock');
  let requested = MIN_RATE_LIMIT_MS;
  if(typeof retryAfter === 'string') {
    const value = retryAfter.trim();
    if(/^\d+$/.test(value)){
      requested = Number(value) * 1000;
    } else if(value) {
      const date = Date.parse(value);
      if(Number.isFinite(date)) requested = date - now;
    }
  }
  if(!Number.isFinite(requested)) requested = MAX_RATE_LIMIT_MS;
  return Math.min(MAX_RATE_LIMIT_MS, Math.max(MIN_RATE_LIMIT_MS, requested));
}
