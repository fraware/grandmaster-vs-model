/** Auditable API-attempt records. Data are operator-originated, never provider-attested. */
import {canonical,assertIso,EVENT_ID} from './protocol.mjs';
import {play,parseFen} from './chess.mjs';

export const ATTEMPT_SCHEMA='prediction-attempt-v1';
export const OBSERVATION_SCHEMA='observed-feed-v1';
export const INDEX_SCHEMA='collection-index-v1';
export const publicSource='https://lichess.org/api/broadcast/round/xLgOJ6cb.pgn';
export const attemptKey=a=>`g${String(a.game).padStart(2,'0')}-p${String(a.ply).padStart(3,'0')}-${a.model.id}`;

/** A digest is an integrity check, never proof of API identity or publication time. */
export function validateAttempt(a){
  if(a?.schema!==ATTEMPT_SCHEMA || a.event!==EVENT_ID || a.game!==1)throw new Error('Unexpected attempt identity');
  if(!Number.isInteger(a.ply)||a.ply<1||a.ply>500)throw new Error('Invalid attempt ply');
  const position=parseFen(a.fen);
  if(a.ply!==(position.fullmove-1)*2+(position.side==='w'?1:2))throw new Error('Attempt FEN/ply mismatch');
  if(typeof a.model?.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(a.model.id))throw new Error('Invalid model id');
  if(!['openai','anthropic','gemini'].includes(a.model.provider)||typeof a.model.version!=='string'||!a.model.version)throw new Error('Invalid model provider/version');
  if(!['valid','invalid','request-failed','feed-changed'].includes(a.status))throw new Error('Invalid attempt status');
  assertIso(a.startedAt,'startedAt');assertIso(a.completedAt,'completedAt');
  if(Date.parse(a.completedAt)<Date.parse(a.startedAt))throw new Error('Nonmonotone attempt times');
  if(a.source!==publicSource)throw new Error('Unexpected attempt source');
  if(typeof a.prompt!=='string'||!a.prompt || typeof a.response!=='string')throw new Error('Missing original request/response');
  if(typeof a.promptSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.promptSha256))throw new Error('Missing prompt digest');
  if(typeof a.responseSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.responseSha256))throw new Error('Missing response digest');
  if(a.status==='valid')play(a.fen,a.predictedUci);
  else if(a.predictedUci!==null)throw new Error('Non-valid attempt must have null prediction');
  if(a.error!==null&&typeof a.error!=='string')throw new Error('Invalid error description');
  if(a.providerResponseId!==null&&typeof a.providerResponseId!=='string')throw new Error('Invalid provider response identifier');
  return true;
}
export function validateObservation(o){
  if(o?.schema!==OBSERVATION_SCHEMA||o.game!==1||o.event!==EVENT_ID||o.source!==publicSource)throw new Error('Unexpected observation identity');
  if(!Array.isArray(o.moves)||o.moves.length>500)throw new Error('Invalid observation moves');
  let prev=null;
  for(const [i,m] of o.moves.entries()){
    if(m.ply!==i+1 || typeof m.uci!=='string'||typeof m.fenBefore!=='string')throw new Error('Invalid observation entry');
    assertIso(m.firstObservedAt,'firstObservedAt');
    if(prev&&prev!==m.fenBefore)throw new Error('Observation FEN chain mismatch');
    prev=play(m.fenBefore,m.uci).fen;
  }
  return true;
}
export function extendObservation(previous,game,at){
  assertIso(at,'observation time');
  if(previous)validateObservation(previous);
  if(!game||!Array.isArray(game.moves)||!Array.isArray(game.positions))throw new Error('Missing observed source game');
  if(previous && previous.moves.length>game.moves.length)throw new Error('Source shortened its previous move history');
  const moves=previous?previous.moves.map(x=>({...x})):[];
  for(let i=0;i<moves.length;i++){
    if(moves[i].uci!==game.moves[i].uci||moves[i].fenBefore!==game.positions[i])throw new Error('Source revised an earlier observed move');
  }
  for(let i=moves.length;i<game.moves.length;i++)moves.push({ply:i+1,uci:game.moves[i].uci,fenBefore:game.positions[i],firstObservedAt:at});
  const next={schema:OBSERVATION_SCHEMA,event:EVENT_ID,game:1,source:publicSource,moves};
  validateObservation(next);
  return next;
}
export function buildIndex({observations,attempts,models}){
  if(observations)validateObservation(observations);
  if(models?.schema!=='model-roster-v1'||!Array.isArray(models.models))throw new Error('Unrecognized roster');
  const registered=new Map(models.models.map(m=>[m.id,m]));
  if(registered.size!==models.models.length)throw new Error('Duplicate roster id');
  const keys=new Set();
  for(const a of attempts){
    validateAttempt(a);
    if(!registered.has(a.model.id)||registered.get(a.model.id).version!==a.model.version)throw new Error('Unregistered model attempt');
    const key=attemptKey(a);
    if(keys.has(key))throw new Error('Duplicate attempt '+key);
    keys.add(key);
  }
  const indexed=attempts.map(a=>({game:a.game,ply:a.ply,fen:a.fen,model:a.model,attemptKey:attemptKey(a),status:a.status,startedAt:a.startedAt,completedAt:a.completedAt,predictedUci:a.predictedUci,providerResponseId:a.providerResponseId,providerReportedModel:a.providerReportedModel,source:a.source,publication:'operator-supplied',timing:'unverified'}));
  return {schema:INDEX_SCHEMA,event:EVENT_ID,rosterVerifiedOn:models.verifiedOn,source:publicSource,observedMoves:observations?.moves??[],attempts:indexed};
}
export function canonicalPayload(value){return canonical(value);}
