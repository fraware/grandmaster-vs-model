/** Pinned and independently inspected Lichess broadcast round registry.
 * The metadata were fetched on 2026-11-20 from the round and tournament APIs.
 * Scheduled start times are organizer-supplied predictions, not move timestamps.
 */
export const MATCH_REGISTRY_SCHEMA='championship-broadcast-registry-v1';
export const MATCH_TOUR_ID='qfkdt8mn';
export const MATCH_TOUR_URL=`https://lichess.org/broadcast/fide-world-chess-championship-2026/${MATCH_TOUR_ID}`;
export const ROUND_DATA=Object.freeze([
  ['xLgOJ6cb','2026-11-24T14:00:00.000Z'],
  ['L3j03TZq','2026-11-25T14:00:00.000Z'],
  ['fnmEB1kH','2026-11-26T14:00:00.000Z'],
  ['wIwJtPqz','2026-11-28T14:00:00.000Z'],
  ['ueVpeXxW','2026-11-29T14:00:00.000Z'],
  ['b0ACq4LF','2026-11-30T14:00:00.000Z'],
  ['OZYNuhhF','2026-12-02T14:00:00.000Z'],
  ['K9grUNXr','2026-12-03T14:00:00.000Z'],
  ['gBI5kKDi','2026-12-04T14:00:00.000Z'],
  ['NhfhTSep','2026-12-06T14:00:00.000Z'],
  ['bAU22Apj','2026-12-07T14:00:00.000Z'],
  ['vRbnvNEi','2026-12-08T14:00:00.000Z'],
  ['S4C6oJ1k','2026-12-10T14:00:00.000Z'],
  ['MDkKXuQD','2026-12-11T14:00:00.000Z'],
]);

export const roundInfo = game=>{
  if(!Number.isInteger(game)||game<1||game>ROUND_DATA.length)throw new Error('Unsupported championship game number');
  const [roundId,startsAt]=ROUND_DATA[game-1];
  return {game,roundId,name:`Game ${game}`,startsAt,
    url:`https://lichess.org/broadcast/fide-world-chess-championship-2026/game-${game}/${roundId}`,
    pgnUrl:`https://lichess.org/api/broadcast/round/${roundId}.pgn`};
};

export const BROADCAST_REGISTRY=Object.freeze({
  schema:MATCH_REGISTRY_SCHEMA,
  event:'fide-world-championship-2026',
  tourId:MATCH_TOUR_ID,
  tourUrl:MATCH_TOUR_URL,
  verifiedAt:'2026-11-20T10:06:01.539Z',
  metadataSource:'https://lichess.org/api/broadcast/qfkdt8mn',
  rounds:ROUND_DATA.map((_,i)=>roundInfo(i+1)),
});

/** Refuse a forged, reordered or partially modified tournament roster. */
export function validateRegistry(value){
  if(!value||value.schema!==MATCH_REGISTRY_SCHEMA||value.event!==BROADCAST_REGISTRY.event||
      value.tourId!==MATCH_TOUR_ID||value.tourUrl!==MATCH_TOUR_URL||
      value.metadataSource!==BROADCAST_REGISTRY.metadataSource||
      value.verifiedAt!==BROADCAST_REGISTRY.verifiedAt||!Array.isArray(value.rounds)||value.rounds.length!==14){
    throw new Error('Unexpected championship registry identity');
  }
  for(let i=0;i<14;i++){
    const expected=roundInfo(i+1),actual=value.rounds[i];
    if(!actual||Object.keys(expected).some(k=>actual[k]!==expected[k]))throw new Error(`Wrong official Game ${i+1} broadcast reference`);
  }
  return value;
}
/** Match-day eligibility limits polling and paid calls to an expected game session.
 * This is deliberately not proof that the game has actually started.
 */
export function activeRound(at,{windowHours=11}={}){
  const instant=Date.parse(at);
  if(!Number.isFinite(instant)||!Number.isFinite(windowHours)||windowHours<=0||windowHours>20)throw new Error('Invalid capture window');
  return BROADCAST_REGISTRY.rounds.find(r=>instant>=Date.parse(r.startsAt)&&instant<Date.parse(r.startsAt)+windowHours*3_600_000)||null;
}
