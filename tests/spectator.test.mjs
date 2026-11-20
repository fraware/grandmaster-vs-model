import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN,play} from '../src/chess.mjs';
import {roundInfo} from '../src/match-2026.mjs';
import {createSpectatorSession,spectatorOpportunity,spectatorOutcome,
  spectatorShareText,validateSpectatorChoice,SPECTATOR_STORAGE_KEY} from '../src/spectator.mjs';

const fixed=()=>new Date('2026-11-20T12:00:00.000Z');
const memoryStorage=()=>{
  const items=new Map();
  return {
    getItem:key=>items.has(key)?items.get(key):null,
    setItem:(key,value)=>items.set(key,value),
    setRaw:(value)=>items.set(SPECTATOR_STORAGE_KEY,value),
    items
  };
};
const first={game:1,ply:1,fen:START_FEN,uci:'e2e4'};
const makeMove=uci=>({uci,...play(START_FEN,uci),fenBefore:START_FEN});

test('pregame opening guesses open near a scheduled round, with no physical-clock claims',()=>{
  assert.deepEqual(spectatorOpportunity({game:1,ply:0,moveCount:0,
    at:'2026-11-20T12:00:00Z'}),{kind:'opening',enabled:true});
  assert.equal(spectatorOpportunity({game:1,ply:0,moveCount:0,
    at:'2026-10-20T12:00:00Z'}).enabled,false);
  assert.equal(spectatorOpportunity({game:1,ply:0,moveCount:0,
    at:'2026-11-24T14:01:00Z'}).enabled,false);
  assert.equal(spectatorOpportunity({game:1,ply:0,moveCount:1,
    at:'2026-11-24T14:05:00Z'}).enabled,false);
});

test('live choice needs current position, verified fetch, active session and unfinished PGN',()=>{
  const args={game:1,ply:6,moveCount:6,result:'*',sourceReady:true,
    at:'2026-11-24T14:15:00Z'};
  assert.deepEqual(spectatorOpportunity(args),{kind:'live',enabled:true});
  for(const change of [{ply:5},{sourceReady:false},{sourceError:true},
    {result:'1-0'},{at:'2026-11-25T00:59:00Z'}]){
    assert.equal(spectatorOpportunity({...args,...change}).enabled,false);
  }
});

test('locking stores the exact FEN once and persists across fresh per-tab store instances',()=>{
  const storage=memoryStorage();
  const session=createSpectatorSession({storage,clock:fixed});
  const choice=session.lock(first);
  assert.equal(validateSpectatorChoice(choice),true);
  assert.equal(choice.source,roundInfo(1).pgnUrl);
  assert.equal(choice.ply,1);
  assert.equal(choice.lockedAt,fixed().toISOString());
  assert.equal(session.persisted,true);
  assert.throws(()=>session.lock({...first,uci:'d2d4'}),/already locked/);
  const recovered=createSpectatorSession({storage,clock:fixed});
  assert.deepEqual(recovered.find(1,1),choice);
  assert.equal(recovered.list().length,1);
  assert.equal(spectatorOutcome(choice,{moves:[]}).kind,'pending');
});

test('a later official move resolves a stored opening guess without modifying it',()=>{
  const storage=memoryStorage(),session=createSpectatorSession({storage,clock:fixed});
  const choice=session.lock(first);
  assert.deepEqual(spectatorOutcome(choice,{moves:[makeMove('e2e4')]}),{
    kind:'match',actualUci:'e2e4',actualSan:'e4'
  });
  assert.equal(spectatorOutcome(choice,{moves:[makeMove('d2d4')]}).kind,'different');
  assert.equal(spectatorOutcome(choice,{moves:[{
    ...makeMove('e2e4'),fenBefore:play(START_FEN,'e2e4').fen
  }]}).kind,'source-conflict');
  assert.deepEqual(session.find(1,1),choice);
});

test('different games and plies are independent and cannot be silently replaced',()=>{
  const session=createSpectatorSession({storage:memoryStorage(),clock:fixed});
  session.lock(first);
  session.lock({...first,game:2});
  const post=play(START_FEN,'e2e4').fen;
  session.lock({game:1,ply:2,fen:post,uci:'e7e5'});
  assert.equal(session.list().length,3);
  assert.equal(session.find(2,1).uci,'e2e4');
  assert.throws(()=>session.lock({...first,uci:'g1f3'}),/already locked/);
});

test('illegal moves, incorrect fullmove numbering and forged sources are rejected',()=>{
  const session=createSpectatorSession({clock:fixed});
  assert.throws(()=>session.lock({...first,uci:'e2e5'}),/legal move/);
  assert.throws(()=>session.lock({...first,ply:2}),/ply mismatch/);
  const choice=session.lock(first);
  assert.throws(()=>validateSpectatorChoice({...choice,source:roundInfo(3).pgnUrl}),/source mismatch/);
});

test('corrupt browser session is preserved and isolated from future writes',()=>{
  const storage=memoryStorage();
  storage.setRaw('{"schema":"unknown"}');
  const session=createSpectatorSession({storage,clock:fixed});
  assert.equal(session.persisted,false);
  session.lock(first);
  assert.equal(session.list().length,1);
  assert.equal(storage.getItem(SPECTATOR_STORAGE_KEY),'{"schema":"unknown"}');
  assert.match(session.warning,/Saved choices unavailable/);
});

test('storage quota exception degrades to memory without claiming persistence',()=>{
  const storage={getItem:()=>null,setItem:()=>{throw new Error('quota exceeded');}};
  const session=createSpectatorSession({storage,clock:fixed});
  session.lock(first);
  assert.equal(session.persisted,false);
  assert.equal(session.find(1,1).uci,'e2e4');
  assert.match(session.warning,/Storage unavailable/);
});

test('share text states that local predictions are not authenticated priority',()=>{
  const session=createSpectatorSession({clock:fixed});
  const choice=session.lock(first);
  const text=spectatorShareText(choice,spectatorOutcome(choice,{moves:[makeMove('e2e4')]}));
  assert.match(text,/matched the grandmaster/);
  assert.match(text,/My move: e4/);
  assert.match(text,/Actual broadcast move: e4/);
  assert.match(text,/Timing is not independently verified/);
  assert.match(text,/mode=live&game=1#experiment/);
  assert.doesNotMatch(text,/model accuracy|certified/);
});
