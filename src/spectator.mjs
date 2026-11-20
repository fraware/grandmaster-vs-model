/**
 * Per-tab, account-free chess spectator predictions.
 *
 * These records are a recreational local session, not independently timestamped
 * forecasts and never part of the model-provider evidence ledger. A prediction
 * is bound to the exact round, ply, FEN and legal UCI choice. Existing choices
 * are immutable even if a later broadcast changes.
 */
import {withSans,parseFen} from './chess.mjs';
import {roundInfo} from './match-2026.mjs';
import {assertIso} from './protocol.mjs';

export const SPECTATOR_SCHEMA='spectator-session-v1';
export const SPECTATOR_STORAGE_KEY='grandmaster-vs-model:live-choices:v1';
const MAX_CHOICES=500;
const DAY_MS=86_400_000;
export const spectatorKey=choice=>`${choice.game}:${choice.ply}`;

export function validateSpectatorChoice(choice){
  if(choice?.schema!==SPECTATOR_SCHEMA||
    !Number.isInteger(choice.game)||choice.game<1||choice.game>14||
    !Number.isInteger(choice.ply)||choice.ply<1||choice.ply>500){
    throw new Error('Invalid spectator prediction identity');
  }
  if(choice.source!==roundInfo(choice.game).pgnUrl)throw new Error('Spectator source mismatch');
  const position=parseFen(choice.fen);
  if(choice.ply!==(position.fullmove-1)*2+(position.side==='w'?1:2))
    throw new Error('Spectator position and ply mismatch');
  if(typeof choice.uci!=='string'||!withSans(choice.fen).some(m=>m.uci===choice.uci))
    throw new Error('Spectator prediction must be a legal move');
  assertIso(choice.lockedAt,'lockedAt');
  return true;
}
function validateChoices(value){
  if(!Array.isArray(value)||value.length>MAX_CHOICES)throw new Error('Invalid spectator session length');
  const seen=new Set();
  for(const choice of value){
    validateSpectatorChoice(choice);
    const key=spectatorKey(choice);
    if(seen.has(key))throw new Error('Duplicate spectator prediction');
    seen.add(key);
  }
  return value;
}

/** Never infer a live decision opportunity from historical playback. */
export function spectatorOpportunity({
  game,ply,moveCount,at,sourceReady=false,sourceError=false,result='*'
}){
  const round=roundInfo(game),instant=Date.parse(at),start=Date.parse(round.startsAt);
  if(!Number.isFinite(instant)||!Number.isInteger(ply)||!Number.isInteger(moveCount)||
    ply<0||moveCount<0||moveCount>500||!['*','1-0','0-1','1/2-1/2'].includes(result)){
    throw new Error('Invalid live spectator opportunity');
  }
  if(ply!==moveCount)return {kind:'history',enabled:false};
  if(moveCount===0&&instant<start&&instant>=start-14*DAY_MS)
    return {kind:'opening',enabled:true};
  if(moveCount>0&&result==='*'&&sourceReady&&!sourceError&&
     instant>=start&&instant<start+11*3_600_000)
    return {kind:'live',enabled:true};
  return {kind:'closed',enabled:false};
}

/**
 * Match local guesses to a legally validated broadcast game. No timestamps
 * supplied by a user device establish prospective priority or physical times.
 */
export function spectatorOutcome(choice,game){
  validateSpectatorChoice(choice);
  const actual=game?.moves?.[choice.ply-1];
  if(!actual)return {kind:'pending'};
  if(actual.fenBefore!==choice.fen)return {kind:'source-conflict'};
  const candidate=withSans(choice.fen).find(m=>m.uci===actual.uci);
  if(!candidate)return {kind:'source-conflict'};
  return {kind:choice.uci===actual.uci?'match':'different',actualUci:actual.uci,
    actualSan:actual.san||candidate.san};
}

/** Build a durable, per-tab store with a memory fallback on storage failure. */
export function createSpectatorSession({
  storage=null,clock=()=>new Date()
}={}){
  let cached=[],persisted=Boolean(storage),warning=null;
  try{
    if(storage){
      const raw=storage.getItem(SPECTATOR_STORAGE_KEY);
      if(raw!==null)cached=validateChoices(JSON.parse(raw));
    }
  }catch{
    // Never overwrite a malformed or inaccessible prior session.
    storage=null;persisted=false;warning='Saved choices unavailable; using this tab only';
    cached=[];
  }
  const read=()=>{
    if(storage){
      try{
        const raw=storage.getItem(SPECTATOR_STORAGE_KEY);
        if(raw!==null)cached=validateChoices(JSON.parse(raw));
        else cached=[];
      }catch{
        storage=null;persisted=false;
        warning='Saved choices unavailable; using this tab only';
      }
    }
    return cached.slice();
  };
  const list=()=>read();
  const find=(game,ply)=>read().find(c=>c.game===game&&c.ply===ply)||null;
  const lock=({game,ply,fen,uci})=>{
    const existing=find(game,ply);
    if(existing)throw new Error('This position is already locked');
    const now=clock();
    if(!(now instanceof Date)||Number.isNaN(now.getTime()))throw new Error('Invalid local spectator clock');
    const choice={schema:SPECTATOR_SCHEMA,game,ply,fen,uci,
      source:roundInfo(game).pgnUrl,lockedAt:now.toISOString()};
    validateSpectatorChoice(choice);
    const next=[...read(),choice];
    validateChoices(next);
    if(storage){
      try{storage.setItem(SPECTATOR_STORAGE_KEY,JSON.stringify(next));}
      catch{
        storage=null;persisted=false;
        warning='Storage unavailable; the prediction lasts only in this tab';
      }
    }
    cached=next;
    return choice;
  };
  return {list,find,lock,get persisted(){return persisted;},get warning(){return warning;}};
}

/** Share a completed local choice without claiming authenticated timing. */
export function spectatorShareText(choice,outcome){
  validateSpectatorChoice(choice);
  if(!outcome||!['pending','match','different','source-conflict'].includes(outcome.kind))
    throw new Error('Invalid spectator result');
  const status=outcome.kind==='match'?'I matched the grandmaster’s move':
    outcome.kind==='different'? 'My move differed from the grandmaster’s choice':
    outcome.kind==='source-conflict'?'The source position changed':'My next-move guess is locked locally';
  const san=withSans(choice.fen).find(m=>m.uci===choice.uci).san;
  return `${status} in World Championship 2026 Game ${choice.game}, move ${Math.ceil(choice.ply/2)}.\n`+
    `My move: ${san}.${outcome.actualSan?` Actual broadcast move: ${outcome.actualSan}.`:''}\n`+
    'Local spectator challenge. Timing is not independently verified.\n'+
    `https://fraware.github.io/grandmaster-vs-model/lab.html?mode=live&game=${choice.game}#experiment`;
}
