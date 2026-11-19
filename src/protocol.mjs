/** Canonical, portable evidence schema for the forecast ledger (v1). */
import {play, parseFen} from './chess.mjs';
export const EVENT_ID = 'fide-world-championship-2026';
export const SCHEMA_VERSION = 'forecast-v1';
export function canonical(value) {
  if(value === null || typeof value !== 'object') return JSON.stringify(value);
  if(Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
}
export function assertIso(value, name){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error(`${name} must be a UTC ISO-8601 timestamp`);
}
export function validateForecast(f){
  if(f?.schema!==SCHEMA_VERSION||f?.event!==EVENT_ID)throw new Error('Unexpected forecast schema/event');
  if(!Number.isInteger(f.game)||f.game<1||f.game>14||!Number.isInteger(f.ply)||f.ply<1)throw new Error('Invalid game or ply');
  const position=parseFen(f.fen);
  if(f.ply!==(position.fullmove-1)*2+(position.side==='w'?1:2))throw new Error('Ply does not agree with FEN move number');
  if(typeof f.model?.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(f.model.id))throw new Error('Invalid model ID');
  if(typeof f.model?.version!=='string'||f.model.version.trim().length<1)throw new Error('Model version required');
  if(typeof f.model?.promptSha256!=='string'||!/^[a-f0-9]{64}$/.test(f.model.promptSha256))throw new Error('SHA-256 of prompt required');
  if(typeof f.model?.promptText!=='string'||!f.model.promptText.trim())throw new Error('Original prompt required');
  if(typeof f.response?.raw!=='string'||!f.response.raw.trim())throw new Error('Original model response required');
  if(typeof f.response?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(f.response.sha256))throw new Error('Response SHA-256 missing');
  play(f.fen,f.prediction.uci);
  assertIso(f.predictedAt,'predictedAt');
  if(f.origin !== 'operator-submitted')throw new Error('Unrecognized provenance');
  return true;
}
export function validateOutcome(o){
  if(o?.schema!=='outcome-v1'||o?.event!==EVENT_ID)throw new Error('Unexpected outcome schema/event');
  if(!Number.isInteger(o.game)||o.game<1||o.game>14||!Number.isInteger(o.ply)||o.ply<1)throw new Error('Invalid game or ply');
  const position=parseFen(o.fen);
  if(o.ply!==(position.fullmove-1)*2+(position.side==='w'?1:2))throw new Error('Outcome ply does not agree with FEN');
  play(o.fen,o.actualUci);
  assertIso(o.playedAt,'playedAt');
  if(typeof o.sourceUrl!=='string'||!/^https:\/\//.test(o.sourceUrl))throw new Error('Public broadcast source URL required');
  return true;
}
export function forecastKey(f) {return `g${String(f.game).padStart(2,'0')}-p${String(f.ply).padStart(3,'0')}-${f.model.id}`;}
export function outcomeKey(o) {return `g${String(o.game).padStart(2,'0')}-p${String(o.ply).padStart(3,'0')}`;}
export function scoreForecast(f,o){
  validateForecast(f);validateOutcome(o);
  if(f.game!==o.game||f.ply!==o.ply||f.fen!==o.fen)throw new Error('Position mismatch: cannot score');
  if(Date.parse(f.predictedAt)>=Date.parse(o.playedAt))return {eligible:false,reason:'Recorded time is not earlier than the played move; chronology is not independently verified'};
  return {eligible:true,exact:f.prediction.uci===o.actualUci,chronology:'operator-reported',independentlyAnchored:false};
}
/** A digest detects accidental changes; timestamps need a separate external anchor. */
export async function sha256(value) {
  const text=typeof value==='string'?value:canonical(value);
  if(!globalThis.crypto?.subtle)throw new Error('WebCrypto unavailable (use HTTPS or localhost)');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
