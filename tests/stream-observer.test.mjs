import test from 'node:test';
import assert from 'node:assert/strict';
import {observeBroadcast,observeReadOnly,probeStream,streamUrl,isStreamHeartbeat} from '../scripts/stream-observer.mjs';
import {roundInfo} from '../src/match-2026.mjs';

const chunks=(...values)=>({
  getReader(){
    let cursor=0;
    return {
      read:async()=>cursor<values.length
        ? {done:false,value:values[cursor++]}
        : {done:true,value:undefined},
      cancel:async()=>{},releaseLock:()=>{}
    };
  }
});
const response=(...values)=>({ok:true,status:200,body:chunks(...values)});
const controlled=()=> {
  let ms=Date.parse('2026-11-24T14:00:00.000Z');
  return {now:()=>ms,wait:async delay=>{ms+=delay;}};
};

test('stream URL derives only from the pinned registry for all fourteen rounds',()=>{
  for(let game=1;game<=14;game++){
    assert.equal(streamUrl(game),
      `https://lichess.org/api/stream/broadcast/round/${roundInfo(game).roundId}.pgn`);
  }
  assert.throws(()=>streamUrl(15),/Unsupported/);
});

test('public endpoint probe uses real stream URL and leaves body unread',async()=>{
  const requested=[];
  const result=await probeStream({game:2,fetcher:async(url,init)=>{
    requested.push({url,init});
    return {ok:true,status:200,headers:{get:()=> 'application/x-chess-pgn'}};
  }});
  assert.equal(result.httpStatus,200);
  assert.equal(result.contentType,'application/x-chess-pgn');
  assert.equal(requested[0].url,streamUrl(2));
  assert.equal(requested[0].init.method,'GET');
});

test('stream notifications trigger snapshot validation, not PGN chunk parsing',async()=>{
  const clock=controlled(),seen=[];
  const result=await observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxConnections:1,
    maxDurationMs:30000,minRefreshMs:0,
    streamFetcher:async()=>response(new Uint8Array([91,69]),new Uint8Array([118,101,110,116,93])),
    onSnapshot:async message=>seen.push(message.reason)
  });
  assert.deepEqual(seen,['connected','stream-update','stream-update']);
  assert.equal(result.notifications,3);
  assert.equal(result.connections,1);
  assert.equal(result.bytesReceived,7);
  assert.equal(result.status,'connection-limit-reached');
});

test('zero-byte heartbeats are ignored and data refresh frequency is bounded',async()=>{
  const clock=controlled(),times=[];
  const result=await observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxConnections:1,
    maxDurationMs:30000,minRefreshMs:2000,
    streamFetcher:async()=>response(new Uint8Array(0),new Uint8Array([1]),new Uint8Array([2])),
    onSnapshot:async()=>times.push(clock.now())
  });
  assert.equal(result.notifications,3);
  assert.deepEqual(times.map(t=>t-times[0]),[0,2000,4000]);
});

test('disconnect reconnects to the same source under a finite connection ceiling',async()=>{
  const clock=controlled(),urls=[],notices=[];
  const result=await observeBroadcast({
    game:3,now:clock.now,wait:clock.wait,maxConnections:2,
    maxDurationMs:30000,retryDelayMs:500,minRefreshMs:0,
    streamFetcher:async url=>{
      urls.push(url);
      if(urls.length===1)throw new Error('transport offline');
      return response(new Uint8Array([1]));
    },
    onSnapshot:async message=>notices.push(message.reason)
  });
  assert.deepEqual(urls,[streamUrl(3),streamUrl(3)]);
  assert.deepEqual(notices,['connected','stream-update']);
  assert.equal(result.transport,'transport-failed');
  assert.equal(result.connections,2);
});

test('authorization failures stop without reconnection',async()=>{
  const clock=controlled();let connections=0;
  await assert.rejects(()=>observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxConnections:3,maxDurationMs:30000,
    streamFetcher:async()=>{connections++;return {ok:false,status:403};},
    onSnapshot:async()=>{}
  }),/HTTP 403/);
  assert.equal(connections,1);
});

test('invalid snapshots fail closed and do not reconnect',async()=>{
  const clock=controlled();let connections=0;
  await assert.rejects(()=>observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxConnections:3,maxDurationMs:30000,
    streamFetcher:async()=>{connections++;return response(new Uint8Array([1]));},
    onSnapshot:async()=>{throw new Error('Broadcast snapshot validation failed');}
  }),/snapshot validation/);
  assert.equal(connections,1);
});

test('read-only source observer strips provider credentials and refuses paid calls',async()=>{
  const clock=controlled(),invocations=[];
  const result=await observeReadOnly({
    game:1,maxConnections:1,maxDurationMs:30000,
    now:clock.now,wait:clock.wait,minRefreshMs:0,
    streamFetcher:async()=>response(new Uint8Array([1])),
    snapshotCycle:async options=>{invocations.push(options);return {status:'no-provider-credentials'};}
  });
  assert.equal(result.notifications,2);
  assert.equal(invocations.length,2);
  for(const invocation of invocations){
    assert.deepEqual(invocation.keys,{});
    assert.equal(invocation.activeOnly,true);
    assert.equal(invocation.gameNumber,1);
  }
});

test('observer rejects invalid execution budgets without opening any connection',async()=>{
  const clock=controlled();let connections=0;
  await assert.rejects(()=>observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxDurationMs:7_200_001,
    streamFetcher:async()=>{connections++;return response();},
    onSnapshot:async()=>{}
  }),/duration/);
  assert.equal(connections,0);
});

test('shadow refresh diagnostics preserve source reception context without model usage',async()=>{
  const clock=controlled(),records=[];
  const result=await observeReadOnly({
    game:1,maxConnections:1,maxDurationMs:30000,minRefreshMs:0,
    now:clock.now,wait:clock.wait,
    streamFetcher:async()=>response(new Uint8Array([2])),
    snapshotCycle:async()=>({status:'no-provider-credentials',newObservations:2,newAttempts:0}),
    onStatus:record=>records.push(record)
  });
  const refreshes=records.filter(r=>r.kind==='source-refresh');
  assert.equal(result.notifications,2);
  assert.equal(refreshes.length,2);
  assert.equal(refreshes[0].newObservations,2);
  assert.equal(refreshes[0].newAttempts,0);
  assert.equal(refreshes[0].reason,'connected');
  assert.equal(refreshes[1].reason,'stream-update');
  assert.equal(Number.isFinite(Date.parse(refreshes[0].completedAt)),true);
});

test('PGN whitespace stream fragments do not trigger redundant full source fetches',async()=>{
  const clock=controlled(),reasons=[];
  assert.equal(isStreamHeartbeat(new Uint8Array()),true);
  assert.equal(isStreamHeartbeat(new Uint8Array([10,13,32,9])),true);
  assert.equal(isStreamHeartbeat(new Uint8Array([10,91])),false);
  const result=await observeBroadcast({
    game:1,now:clock.now,wait:clock.wait,maxConnections:1,
    maxDurationMs:30000,minRefreshMs:0,
    streamFetcher:async()=>response(new Uint8Array([10,13]),new Uint8Array([32]),
      new Uint8Array([91,69,118,101,110,116,93])),
    onSnapshot:async({reason})=>reasons.push(reason)
  });
  assert.deepEqual(reasons,['connected','stream-update']);
  assert.equal(result.notifications,2);
  assert.equal(result.bytesReceived,10);
});

test('temporary PGN source transport errors reconnect without sacrificing the full session',async()=>{
  const clock=controlled(),reasons=[];
  let sourceCalls=0;
  const result=await observeReadOnly({
    game:1,now:clock.now,wait:clock.wait,maxConnections:2,
    maxDurationMs:30000,retryDelayMs:500,minRefreshMs:0,
    streamFetcher:async()=>response(new Uint8Array([65])),
    snapshotCycle:async()=>{
      sourceCalls++;
      if(sourceCalls===1)throw new TypeError('fetch failed');
      return {status:'no-provider-credentials',newObservations:0};
    },
    onStatus:r=>reasons.push(r)
  });
  assert.equal(sourceCalls,3);
  assert.equal(result.connections,2);
  assert.equal(result.notifications,2);
  assert.equal(result.transport,'source-temporarily-unavailable');
  assert.ok(reasons.some(x=>x.kind==='disconnected'&&x.transportFailure));
});

test('malformed or contradictory broadcast source stays fail-closed',async()=>{
  const clock=controlled();let attempts=0;
  await assert.rejects(()=>observeReadOnly({
    game:1,now:clock.now,wait:clock.wait,maxConnections:20,maxDurationMs:30000,
    streamFetcher:async()=>response(new Uint8Array([65])),
    snapshotCycle:async()=>{attempts++;throw new Error('Source revised an earlier observed move');}
  }),/Broadcast snapshot validation failed/);
  assert.equal(attempts,1);
});

test('a completed PGN game ends its source observation session immediately',async()=>{
  const clock=controlled(),seen=[];
  const result=await observeBroadcast({
    game:2,now:clock.now,wait:clock.wait,maxConnections:20,maxDurationMs:30000,
    streamFetcher:async()=>response(new Uint8Array([65])),
    onSnapshot:async info=>{seen.push(info.reason);return {status:'game-finished'};}
  });
  assert.equal(result.status,'game-finished');
  assert.deepEqual(seen,['connected']);
  assert.equal(result.connections,1);
});

test('quiet streams rotate for fallback snapshots without reporting network failure',async()=>{
  let connections=0;
  const readerFor=signal=>({
    getReader:()=>({
      read:()=>new Promise((resolve,reject)=>{
        signal.addEventListener('abort',()=>reject(new Error('connection rotated')),{once:true});
      }),
      cancel:async()=>{},releaseLock:()=>{}
    })
  });
  const history=[];
  const result=await observeBroadcast({
    game:1,maxDurationMs:85,maxConnectionAgeMs:20,maxConnections:8,
    retryDelayMs:0,minRefreshMs:0,
    streamFetcher:async(_url,{signal})=>{
      connections++;
      return {ok:true,status:200,body:readerFor(signal)};
    },
    onSnapshot:async()=>({status:'no-provider-credentials'}),
    onStatus:message=>history.push(message)
  });
  assert.ok(connections>=3,`expected at least three quiet-stream rotations, got ${connections}`);
  assert.equal(result.status,'duration-reached');
  assert.equal(result.transport,null);
  assert.ok(history.some(e=>e.kind==='disconnected'&&e.plannedRotation));
});

test('single-session resource limits reject unreasonable source connection settings',async()=>{
  const clock=controlled();
  const base={game:1,now:clock.now,wait:clock.wait,
    streamFetcher:async()=>response(new Uint8Array([65])),onSnapshot:async()=>({})};
  await assert.rejects(()=>observeBroadcast({...base,maxConnections:513}),/connection limit/);
  await assert.rejects(()=>observeBroadcast({...base,maxConnectionAgeMs:600001}),/rotation limit/);
});

test('HTTP 503 while refreshing the source is transient rather than a permanent PGN error',async()=>{
  const clock=controlled();let count=0;
  const result=await observeReadOnly({
    game:1,now:clock.now,wait:clock.wait,maxConnections:2,
    retryDelayMs:0,maxDurationMs:30000,minRefreshMs:0,
    streamFetcher:async()=>response(),
    snapshotCycle:async()=>{
      count++;
      if(count===1)throw new Error('Broadcast source HTTP 503');
      return {status:'no-provider-credentials'};
    }
  });
  assert.equal(count,2);
  assert.equal(result.transport,'source-temporarily-unavailable');
});
