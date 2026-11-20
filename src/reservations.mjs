/**
 * Immutable, pre-inference attempt reservations.
 *
 * A successful remote publication of one reservation consumes one permitted
 * request slot, irrespective of whether an API response is ever recorded.
 * No cryptographic timestamp or exactly-once provider execution is implied.
 */
import {assertIso, EVENT_ID} from './protocol.mjs';
import {parseFen} from './chess.mjs';
import {roundInfo} from './match-2026.mjs';

export const RESERVATION_SCHEMA='forecast-reservation-v1';
export const reservationKey=value=>
  `g${String(value.game).padStart(2,'0')}-p${String(value.ply).padStart(3,'0')}-${value.model.id}`;

export function validateCaptureRun(value){
  if(!value||typeof value.repository!=='string'||
     !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)||
     typeof value.runId!=='string'||!/^[1-9][0-9]{0,19}$/.test(value.runId)||
     typeof value.runAttempt!=='string'||!/^[1-9][0-9]{0,5}$/.test(value.runAttempt)){
    throw new Error('Invalid GitHub Actions capture reference');
  }
  return true;
}

export function validateReservation(value){
  if(value?.schema!==RESERVATION_SCHEMA||value.event!==EVENT_ID)
    throw new Error('Unexpected request reservation identity');
  if(!Number.isInteger(value.game)||value.game<1||value.game>14||
     !Number.isInteger(value.ply)||value.ply<1||value.ply>500)
    throw new Error('Invalid reservation position');
  const fen=parseFen(value.fen);
  if(value.ply!==(fen.fullmove-1)*2+(fen.side==='w'?1:2))
    throw new Error('Reservation FEN/ply mismatch');
  if(value.source!==roundInfo(value.game).pgnUrl)
    throw new Error('Unexpected reservation broadcast source');
  if(typeof value.model?.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(value.model.id)||
     !['openai','anthropic','gemini'].includes(value.model.provider)||
     typeof value.model.name!=='string'||!value.model.name||
     typeof value.model.version!=='string'||!value.model.version)
    throw new Error('Invalid reservation model');
  if(typeof value.promptSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.promptSha256))
    throw new Error('Invalid reservation prompt digest');
  assertIso(value.reservedAt,'reservedAt');
  validateCaptureRun(value.captureRun);
  if(typeof value.digest!=='string'||!/^[a-f0-9]{64}$/.test(value.digest))
    throw new Error('Invalid reservation document digest');
  return true;
}
