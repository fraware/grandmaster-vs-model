/**
 * Deterministic reconciliation of independent hourly shadow PGN artifacts.
 *
 * This tool merges consistent source move histories and reports what operator
 * timestamps those artifacts carry. It does not infer physical move times,
 * independently validate GitHub run identity, or alter the paid model ledger.
 */
import {createHash} from 'node:crypto';
import {canonical,assertIso} from './protocol.mjs';
import {validateObservation} from './collection.mjs';
import {roundInfo} from './match-2026.mjs';

export const SHADOW_SESSION_SCHEMA='read-only-broadcast-session-v1';
export const SHADOW_REPORT_SCHEMA='shadow-observation-reconciliation-v1';
const ARTIFACT_PATTERN=/^shadow-broadcast-([1-9][0-9]{0,19})-([1-9][0-9]{0,5})$/;
const END_STATES=new Set([
  'duration-reached','connection-limit-reached','game-finished',
  'outside-scheduled-session','failed'
]);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const order=(a,b)=>a.localeCompare(b,'en');

export function validateShadowSession(record){
  if(!record||typeof record!=='object'||
     record.schema!==SHADOW_SESSION_SCHEMA||
     !Number.isInteger(record.game)||record.game<1||record.game>14||
     record.source!==roundInfo(record.game).pgnUrl||
     record.providerCalls!==0||record.physicalMoveTiming!=='unverified'||
     !END_STATES.has(record.status)){
    throw new Error('Invalid read-only stream session metadata');
  }
  assertIso(record.sessionStartedAt,'sessionStartedAt');
  assertIso(record.sessionCompletedAt,'sessionCompletedAt');
  if(Date.parse(record.sessionCompletedAt)<Date.parse(record.sessionStartedAt))
    throw new Error('Nonmonotone shadow session times');
  for(const key of ['connections','notifications','bytesReceived']){
    if(record[key]!==undefined&&(!Number.isSafeInteger(record[key])||record[key]<0))
      throw new Error('Invalid shadow session counter: '+key);
  }
  return true;
}

/**
 * @param {Array<{artifact:string,summary:object,observation?:object|null}>} artifacts
 * @returns {object} Reconciled, untrusted operator-reported history with digest references.
 */
export function reconcileShadowArtifacts(artifacts){
  if(!Array.isArray(artifacts)||artifacts.length>1000)
    throw new Error('Invalid shadow artifact collection');
  const sessions=[],seen=new Set(),groups=new Map();
  for(const entry of artifacts){
    if(!entry||!ARTIFACT_PATTERN.test(entry.artifact)||
      seen.has(entry.artifact))throw new Error('Duplicate or invalid shadow artifact identity');
    seen.add(entry.artifact);
    validateShadowSession(entry.summary);
    const artifact=entry.artifact,summary=entry.summary,observation=entry.observation??null;
    const session={
      artifact,game:summary.game,status:summary.status,
      sessionStartedAt:summary.sessionStartedAt,
      sessionCompletedAt:summary.sessionCompletedAt,
      connections:summary.connections??null,notifications:summary.notifications??null,
      bytesReceived:summary.bytesReceived??null,
      summaryDigest:digest(summary),
      observationDigest:null,reportedMoveCount:0
    };
    if(observation){
      validateObservation(observation);
      if(observation.game!==summary.game||observation.source!==summary.source)
        throw new Error('Shadow observation and session refer to different rounds');
      for(const move of observation.moves){
        // A carried historical timestamp can precede session start. It cannot
        // arise after this session completed on the same reported clock.
        if(Date.parse(move.firstObservedAt)>Date.parse(summary.sessionCompletedAt))
          throw new Error('Observation timestamp follows shadow session completion');
      }
      session.observationDigest=digest(observation);
      session.reportedMoveCount=observation.moves.length;
    }
    sessions.push(session);
    const group=groups.get(summary.game)??[];
    group.push({artifact,summary,observation});
    groups.set(summary.game,group);
  }
  sessions.sort((a,b)=>order(a.artifact,b.artifact));
  const games=[];
  for(const game of [...groups.keys()].sort((a,b)=>a-b)){
    const set=groups.get(game);
    const observed=set.filter(item=>item.observation!==null);
    const longest=observed.toSorted((a,b)=>
      b.observation.moves.length-a.observation.moves.length||
      order(a.artifact,b.artifact))[0]?.observation??null;
    if(longest){
      for(const item of observed){
        for(const [index,move] of item.observation.moves.entries()){
          const canonicalMove=longest.moves[index];
          if(!canonicalMove||move.uci!==canonicalMove.uci||
             move.fenBefore!==canonicalMove.fenBefore)
            throw new Error(`Conflicting shadow history in Game ${game} ply ${index+1}`);
        }
      }
    }
    const moves=[];
    for(const [index,move] of (longest?.moves??[]).entries()){
      const claims=observed.filter(x=>x.observation.moves.length>index).map(x=>({
        artifact:x.artifact,
        reportedFirstObservedAt:x.observation.moves[index].firstObservedAt
      })).sort((a,b)=>
        Date.parse(a.reportedFirstObservedAt)-Date.parse(b.reportedFirstObservedAt)||
        order(a.artifact,b.artifact));
      moves.push({
        ply:move.ply,uci:move.uci,fenBefore:move.fenBefore,
        earliestOperatorReportedAt:claims[0].reportedFirstObservedAt,
        associatedArtifact:claims[0].artifact,
        carryingArtifactCount:claims.length,
        timestampVariationMs:Date.parse(claims.at(-1).reportedFirstObservedAt)-
          Date.parse(claims[0].reportedFirstObservedAt),
        claims
      });
    }
    const round=roundInfo(game);
    games.push({
      game,source:round.pgnUrl,roundId:round.roundId,
      scheduledStartAt:round.startsAt,
      sessionCount:set.length,
      artifactsWithReportedMoves:observed.filter(x=>x.observation.moves.length>0).length,
      maximumReportedPly:moves.length,moves
    });
  }
  return {
    schema:SHADOW_REPORT_SCHEMA,
    basis:'operator-reported source artifacts only',
    physicalMoveTimesCertified:false,
    modelForecastsCertified:false,
    artifactProvenanceVerified:false,
    inputArtifactCount:sessions.length,
    reportedGameCount:games.length,
    reportedDistinctMoves:games.reduce((sum,g)=>sum+g.maximumReportedPly,0),
    limitations:[
      'Uploaded artifact names and local SHA-256 checksums do not authenticate GitHub provenance.',
      'Operator first-observed timestamps can be inherited from prior repository states.',
      'The earliest carried timestamp does not establish physical move time or pre-move priority.',
      'Missing artifacts, clock skew, and broadcast delays remain unresolved.'
    ],
    sessions,games
  };
}
