/** Auditable operator-originated model calls and source-observation records.
 * Hash integrity and observed-feed order must not be presented as trusted
 * wall-clock proof of an inference preceding a physical chess move.
 */
import {canonical,assertIso,EVENT_ID} from './protocol.mjs';
import {START_FEN,play,parseFen} from './chess.mjs';
import {roundInfo} from './match-2026.mjs';

export const ATTEMPT_SCHEMA='prediction-attempt-v1';
export const OBSERVATION_SCHEMA='observed-feed-v1';
export const INDEX_SCHEMA='collection-index-v1';
export const publicSource=roundInfo(1).pgnUrl;
export const sourceForGame=game=>roundInfo(game).pgnUrl;
export const attemptKey=a=>`g${String(a.game).padStart(2,'0')}-p${String(a.ply).padStart(3,'0')}-${a.model.id}`;

export function validateAttempt(a){
  if(a?.schema!==ATTEMPT_SCHEMA||a.event!==EVENT_ID||!Number.isInteger(a.game)||a.game<1||a.game>14)throw new Error('Unexpected attempt identity');
  if(!Number.isInteger(a.ply)||a.ply<1||a.ply>500)throw new Error('Invalid attempt ply');
  const position=parseFen(a.fen);
  if(a.ply!==(position.fullmove-1)*2+(position.side==='w'?1:2))throw new Error('Attempt FEN/ply mismatch');
  if(typeof a.model?.id!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(a.model.id))throw new Error('Invalid model id');
  if(!['openai','anthropic','gemini'].includes(a.model.provider)||typeof a.model.version!=='string'||!a.model.version)throw new Error('Invalid model provider/version');
  if(!['valid','invalid','request-failed','feed-changed'].includes(a.status))throw new Error('Invalid attempt status');
  assertIso(a.startedAt,'startedAt');assertIso(a.completedAt,'completedAt');
  if(Date.parse(a.completedAt)<Date.parse(a.startedAt))throw new Error('Nonmonotone attempt times');
  if(a.source!==sourceForGame(a.game))throw new Error('Unexpected attempt source');
  if(typeof a.prompt!=='string'||!a.prompt||typeof a.response!=='string')throw new Error('Missing original request/response');
  if(typeof a.promptSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.promptSha256))throw new Error('Missing prompt digest');
  if(typeof a.responseSha256!=='string'||!/^[a-f0-9]{64}$/.test(a.responseSha256))throw new Error('Missing response digest');
  if(a.status==='valid')play(a.fen,a.predictedUci);
  else if(a.predictedUci!==null)throw new Error('Non-valid attempt must have null prediction');
  if(a.error!==null&&typeof a.error!=='string')throw new Error('Invalid error description');
  if(a.providerResponseId!==null&&typeof a.providerResponseId!=='string')throw new Error('Invalid provider response identifier');
  if(a.postflightConfirmed!==undefined&&typeof a.postflightConfirmed!=='boolean')throw new Error('Invalid postflight flag');
  return true;
}

export function validateObservation(o){
  if(o?.schema!==OBSERVATION_SCHEMA||!Number.isInteger(o.game)||o.game<1||o.game>14||o.event!==EVENT_ID||o.source!==sourceForGame(o.game))throw new Error('Unexpected observation identity');
  if(!Array.isArray(o.moves)||o.moves.length>500)throw new Error('Invalid observation moves');
  let previousFen=START_FEN,priorTime=-Infinity;
  for(const [i,m] of o.moves.entries()){
    if(m.ply!==i+1||typeof m.uci!=='string'||m.fenBefore!==previousFen)throw new Error('Observation FEN chain mismatch');
    assertIso(m.firstObservedAt,'firstObservedAt');
    const time=Date.parse(m.firstObservedAt);
    if(time<priorTime)throw new Error('Nonmonotone first observation times');
    priorTime=time;
    previousFen=play(previousFen,m.uci).fen;
  }
  return true;
}

export function extendObservation(previous,game,at,gameNumber=1){
  assertIso(at,'observation time');
  if(previous)validateObservation(previous);
  if(!game||!Array.isArray(game.moves)||!Array.isArray(game.positions)||game.positions[0]!==START_FEN)throw new Error('Missing valid observed source game');
  if(previous&&previous.game!==gameNumber)throw new Error('Observation game changed');
  if(previous&&previous.moves.length>game.moves.length)throw new Error('Source shortened its previous move history');
  const moves=previous?previous.moves.map(x=>({...x})):[];
  for(let i=0;i<moves.length;i++){
    if(moves[i].uci!==game.moves[i].uci||moves[i].fenBefore!==game.positions[i])throw new Error('Source revised an earlier observed move');
  }
  if(moves.length&&Date.parse(at)<Date.parse(moves.at(-1).firstObservedAt))throw new Error('Observation clock moved backwards');
  for(let i=moves.length;i<game.moves.length;i++)moves.push({ply:i+1,uci:game.moves[i].uci,fenBefore:game.positions[i],firstObservedAt:at});
  const next={schema:OBSERVATION_SCHEMA,event:EVENT_ID,game:gameNumber,source:sourceForGame(gameNumber),moves};
  validateObservation(next);
  return next;
}

/** Single observation documents remain accepted for backward compatible callers. */
export function buildIndex({observations,attempts,models}){
  const observedGames=(Array.isArray(observations)?observations:[observations]).filter(Boolean).sort((a,b)=>a.game-b.game);
  const observationMap=new Map();
  for(const o of observedGames){
    validateObservation(o);
    if(observationMap.has(o.game))throw new Error('Duplicate observation for game '+o.game);
    observationMap.set(o.game,o);
  }
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
  const indexed=attempts.map(a=>{
    const move=observationMap.get(a.game)?.moves[a.ply-1];
    if(move&&move.fenBefore!==a.fen)throw new Error('Recorded attempt contradicts observed position');
    const comparison=move&&a.status==='valid'?{
      actualUci:move.uci,
      exact:a.predictedUci===move.uci,
      firstObservedAt:move.firstObservedAt,
      beforeFeedByOperatorClock:Date.parse(a.completedAt)<Date.parse(move.firstObservedAt),
      certifiedPhysicalPreMove:false,
    }:null;
    return {game:a.game,ply:a.ply,fen:a.fen,model:a.model,attemptKey:attemptKey(a),status:a.status,
      startedAt:a.startedAt,completedAt:a.completedAt,predictedUci:a.predictedUci,
      providerResponseId:a.providerResponseId,providerReportedModel:a.providerReportedModel,source:a.source,
      publication:'operator-supplied',timing:'unverified',comparison};
  });
  return {schema:INDEX_SCHEMA,event:EVENT_ID,rosterVerifiedOn:models.verifiedOn,source:publicSource,
    observedMoves:observationMap.get(1)?.moves??[],
    observedGames:observedGames.map(o=>({game:o.game,source:o.source,moves:o.moves})),attempts:indexed};
}
export function canonicalPayload(value){return canonical(value);}
