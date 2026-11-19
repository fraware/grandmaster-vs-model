import test from 'node:test';
import assert from 'node:assert/strict';
import {checkProviders,errorCategory} from '../scripts/provider-smoke.mjs';

const roster={schema:'model-roster-v1',models:[
  {id:'one',provider:'openai',version:'gpt-6.2-astra',capture:true},
  {id:'two',provider:'anthropic',version:'claude-fable-5-2',capture:true},
  {id:'three',provider:'gemini',version:'gemini-4-neon',capture:true}
]};
const clock=()=>new Date('2026-11-19T09:00:00.000Z');

test('live access check is separate from the championship collection',async()=>{
  const called=[];
  const report=await checkProviders({roster,keys:{OPENAI_API_KEY:'private-openai',ANTHROPIC_API_KEY:'private-anthropic'},clock,request:async args=>{
    called.push(args);
    return {output:'e2e4',responseId:'test-id',elapsedMs:3,model:args.version,usage:{input_tokens:21}};
  }});
  assert.equal(report.schema,'provider-smoke-v1');
  assert.match(report.note,/excluded from championship/);
  assert.equal(report.providers.length,3);
  assert.equal(called.length,2);
  assert.deepEqual(report.providers.map(p=>p.status),['success','success','credential-missing']);
  assert.equal(report.providers[0].move,'e2e4');
  assert.equal(report.providers[0].reportedModel,'gpt-6.2-astra');
  assert.doesNotMatch(JSON.stringify(report),/private-openai|private-anthropic/);
  assert.match(called[0].prompt,/NOT A CHAMPIONSHIP FORECAST/);
});

test('report describes invalid output without promoting a failed prediction',async()=>{
  const result=await checkProviders({roster:{...roster,models:roster.models.slice(0,1)},keys:{OPENAI_API_KEY:'key'},clock,request:async()=>({output:'Let me explain',model:'gpt-6.2-astra',responseId:null,elapsedMs:2,usage:null})});
  assert.equal(result.providers[0].status,'invalid-move');
  assert.equal(result.providers[0].move,null);
});

test('provider errors never disclose provider-originated messages or credentials',async()=>{
  const result=await checkProviders({roster:{...roster,models:roster.models.slice(0,1)},keys:{OPENAI_API_KEY:'private-api-key'},clock,request:async()=>{throw Error('openai HTTP 401: private-api-key echo');}});
  assert.equal(result.providers[0].status,'request-failed');
  assert.equal(result.providers[0].category,'http-401');
  assert.doesNotMatch(JSON.stringify(result),/private-api-key/);
  assert.equal(errorCategory('transport problem with a user name'),'transport-error');
});

test('rejects unsupported or duplicate roster entries before provider attempts',async()=>{
  const duplicate={...roster,models:[roster.models[0],roster.models[0]]};
  await assert.rejects(()=>checkProviders({roster:duplicate,keys:{},clock}),/Duplicate/);
  const invalid={...roster,models:[{...roster.models[0],provider:'rogue'}]};
  await assert.rejects(()=>checkProviders({roster:invalid,keys:{},clock}),/Malformed/);
});

test('restricted provider rerun does not spend credits on already verified models',async()=>{
 const invoked=[];
 const report=await checkProviders({roster,onlyProviders:['anthropic','gemini'],keys:{OPENAI_API_KEY:'key',ANTHROPIC_API_KEY:'key'},clock,request:async opts=>{invoked.push(opts.provider);return {output:'g1f3',responseId:null,model:opts.version,elapsedMs:1,usage:null};}});
 assert.deepEqual(invoked,['anthropic']);
 assert.deepEqual(report.providers.map(p=>p.provider),['anthropic','gemini']);
 assert.deepEqual(report.providers.map(p=>p.status),['success','credential-missing']);
});