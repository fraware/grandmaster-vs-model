/**
 * Event-aware homepage routing using the pinned 14-round UTC schedule.
 * Schedule information is not evidence of physical play or live feed state.
 */
import {BROADCAST_REGISTRY} from './match-2026.mjs';

const SESSION_MS=11*60*60*1000;
const PREVIEW_MS=14*24*60*60*1000;
const DATE_FORMAT=new Intl.DateTimeFormat('en-GB',{
  timeZone:'UTC',day:'numeric',month:'short',hour:'2-digit',
  minute:'2-digit',hourCycle:'h23'
});

/** Choose the next planned round, including its announced session window. */
export function selectHomepageRound(at){
  const ms=at instanceof Date?at.getTime():Date.parse(at);
  if(!Number.isFinite(ms))throw new Error('Invalid championship entry time');
  const rounds=BROADCAST_REGISTRY.rounds;
  const round=rounds.find(x=>ms<Date.parse(x.startsAt)+SESSION_MS);
  if(!round)return {round:rounds.at(-1),phase:'replay'};
  const start=Date.parse(round.startsAt);
  return {round,phase:ms>=start?'scheduled-window':
    ms>=start-PREVIEW_MS?'opening':'preview'};
}

/** Copy explicitly distinguishes forecast start times from confirmed play. */
export function homepageInvite(at){
  const {round,phase}=selectHomepageRound(at);
  const date=DATE_FORMAT.format(new Date(round.startsAt))+' UTC';
  const base={
    game:round.game,phase,startsAt:round.startsAt,
    href:`lab.html?mode=live&game=${round.game}#experiment`,
    status:`2026 WORLD CHAMPIONSHIP · GAME ${String(round.game).padStart(2,'0')} / 14`,
    time:date
  };
  if(phase==='opening')return {...base,
    title:'Call the next move before the match.',
    description:`Game ${round.game} is scheduled for ${date}. Make a legal opening guess now; the official broadcast will reveal the answer.`,
    action:'Make your opening call'
  };
  if(phase==='scheduled-window')return {...base,
    title:'Your move against the grandmaster.',
    description:`Game ${round.game} is inside its scheduled broadcast window. Predict from the latest sourced board position; the broadcast decides the result.`,
    action:'Open the game board'
  };
  if(phase==='preview')return {...base,
    title:'The world title is on the board.',
    description:`Game ${round.game} is scheduled for ${date}. Opening guesses become available 14 days before the scheduled round.`,
    action:'Preview the chessboard'
  };
  return {...base,
    status:'2026 WORLD CHAMPIONSHIP · LAST SCHEDULED ROUND',
    title:'Play through the championship moves.',
    description:'Explore the published board history and source-linked model records. Results depend on what the official broadcast has actually reported.',
    action:'Explore the championship'
  };
}
