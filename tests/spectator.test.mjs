import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN,play} from '../src/chess.mjs';
import {roundInfo} from '../src/match-2026.mjs';
import {createSpectatorSession,spectatorOpportunity,spectatorOutcome,
  spectatorShareText,validateSpectatorChoice,SPECTATOR_STORAGE_KEY,spectatorReturnPly} from '../src/spectator.mjs';

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
    {result:'1-0'},{at:'2026-11-25T01:01:00Z'}]){
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

test('opening guesses survive a new browser session through origin-local storage',()=>{
  const browser=memoryStorage();
  const firstVisit=createSpectatorSession({storage:browser,clock:fixed});
  const saved=firstVisit.lock(first);
  assert.equal(firstVisit.persistence,'browser');
  const reopened=createSpectatorSession({storage:browser,clock:fixed});
  assert.equal(reopened.persistence,'browser');
  assert.deepEqual(reopened.find(1,1),saved);
  assert.throws(()=>reopened.lock({...first,uci:'d2d4'}),/already locked/);
});

test('v1.6 tab guesses migrate without changing their move or timestamp',()=>{
  const oldTab=memoryStorage(),browser=memoryStorage();
  const original=createSpectatorSession({storage:oldTab,clock:fixed}).lock(first);
  const reopened=createSpectatorSession({
    storage:browser,legacyStorage:oldTab,clock:()=>new Date('2026-11-24T14:00:00Z')
  });
  assert.equal(reopened.persistence,'browser');
  assert.deepEqual(reopened.find(1,1),original);
  assert.deepEqual(JSON.parse(browser.getItem(SPECTATOR_STORAGE_KEY)),[original]);
  assert.deepEqual(JSON.parse(oldTab.getItem(SPECTATOR_STORAGE_KEY)),[original]);
  const later=createSpectatorSession({storage:browser});
  assert.deepEqual(later.find(1,1),original);
});

test('migration preserves established browser choices and imports disjoint older positions',()=>{
  const browser=memoryStorage(),oldTab=memoryStorage();
  const previouslySaved=createSpectatorSession({storage:browser,clock:fixed});
  previouslySaved.lock(first);
  const other=play(START_FEN,'e2e4').fen;
  const older=createSpectatorSession({storage:oldTab,clock:fixed});
  older.lock({game:1,ply:2,fen:other,uci:'e7e5'});
  const union=createSpectatorSession({storage:browser,legacyStorage:oldTab,clock:fixed});
  assert.equal(union.list().length,2);
  assert.equal(union.find(1,1).uci,'e2e4');
  assert.equal(union.find(1,2).uci,'e7e5');
});

test('conflicting legacy choice never replaces an already saved browser prediction',()=>{
  const browser=memoryStorage(),oldTab=memoryStorage();
  createSpectatorSession({storage:browser,clock:fixed}).lock(first);
  createSpectatorSession({storage:oldTab,clock:fixed}).lock({...first,uci:'d2d4'});
  const combined=createSpectatorSession({storage:browser,legacyStorage:oldTab});
  assert.equal(combined.find(1,1).uci,'e2e4');
  assert.equal(JSON.parse(oldTab.getItem(SPECTATOR_STORAGE_KEY))[0].uci,'d2d4');
  assert.match(combined.warning,/Conflicting older tab/);
});

test('damaged persistent data is never overwritten and can use sound legacy tab data',()=>{
  const browser=memoryStorage(),oldTab=memoryStorage();
  browser.setRaw('{"invalid":true}');
  createSpectatorSession({storage:oldTab,clock:fixed}).lock(first);
  const recovered=createSpectatorSession({storage:browser,legacyStorage:oldTab});
  assert.equal(recovered.persistence,'tab');
  assert.equal(recovered.find(1,1).uci,'e2e4');
  assert.equal(browser.getItem(SPECTATOR_STORAGE_KEY),'{"invalid":true}');
  assert.match(recovered.warning,/original data preserved/);
});

test('unavailable persistent storage falls back to tab-only or memory with honest status',()=>{
  const blocked={getItem:()=>{throw new Error('private mode');},setItem:()=>{}};
  const tab=memoryStorage();
  const recovered=createSpectatorSession({storage:blocked,legacyStorage:tab,clock:fixed});
  assert.equal(recovered.persistence,'tab');
  recovered.lock(first);
  assert.equal(recovered.persisted,true);
  assert.deepEqual(JSON.parse(tab.getItem(SPECTATOR_STORAGE_KEY))[0].uci,'e2e4');
  const lost=createSpectatorSession({storage:null,legacyStorage:null,clock:fixed});
  assert.equal(lost.persistence,'memory');
  assert.equal(lost.persisted,false);
});

test('an independent tab sees additions without overwriting the current browser record',()=>{
  const browser=memoryStorage();
  const one=createSpectatorSession({storage:browser,clock:fixed});
  const two=createSpectatorSession({storage:browser,clock:fixed});
  one.lock(first);
  assert.equal(two.find(1,1).uci,'e2e4');
  assert.throws(()=>two.lock({...first,uci:'d2d4'}),/already locked/);
  two.lock({...first,game:2});
  assert.equal(one.list().length,2);
});

test('return visits prioritize a revealed saved choice unless no move has yet appeared',()=>{
  const choice=createSpectatorSession({clock:fixed}).lock(first);
  assert.equal(spectatorReturnPly([choice],1,0),0);
  assert.equal(spectatorReturnPly([choice],1,1),0);
  assert.equal(spectatorReturnPly([choice],1,20),0);
  assert.equal(spectatorReturnPly([choice],2,20),20);
  assert.equal(spectatorReturnPly([],1,20),20);
  const after=play(START_FEN,'e2e4').fen;
  const later={...choice,ply:2,fen:after,uci:'e7e5'};
  assert.equal(spectatorReturnPly([choice,later],1,8),1);
  assert.throws(()=>spectatorReturnPly([choice],15,2),/Invalid returning/);
});
