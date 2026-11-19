import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN} from '../src/chess.mjs';
import {makePrompt,parsePrediction,requestModel,classifyProviderHttpError} from '../scripts/model-runner.mjs';
test('shared prompt defines a prospective human-choice task and legal moves',()=>{
 const x=makePrompt({fen:START_FEN,player:'Test player',opponent:'Test opponent',game:1});
 assert.match(x,/predicting a HUMAN chess decision/);assert.match(x,/e2e4/);assert.match(x,/Current FEN:/);
});
test('prediction parsing rejects explanation, out-of-list or illegal moves',()=>{
 assert.equal(parsePrediction(' e2e4\n',['e2e4']),'e2e4');
 assert.throws(()=>parsePrediction('I think e2e4',['e2e4']),/single UCI/);
 assert.throws(()=>parsePrediction('e2e5',['e2e4']),/illegal/);
});
const fixtures={openai:{output:[{content:[{type:'output_text',text:'e2e4'}]}],id:'r_1'},anthropic:{content:[{type:'text',text:'e2e4'}],id:'m_1'},gemini:{candidates:[{content:{parts:[{text:'e2e4'}]}}]}};
for(const provider of Object.keys(fixtures))test(`offline adapter test ${provider}`,async()=>{
 let urlUsed='',optionsUsed;
 const fetcher=async (url,options)=>{urlUsed=url;optionsUsed=options;return {ok:true,text:async()=>JSON.stringify(fixtures[provider])};};
 const x=await requestModel({provider,version:'example-model',prompt:'FEN',apiKey:'test-secret',fetcher});
 assert.equal(x.output,'e2e4');assert.equal(optionsUsed.method,'POST');
 assert.equal(JSON.stringify(optionsUsed.body).includes('test-secret'),false);
 assert.ok(urlUsed.startsWith('https://'));
});
test('transport errors are explicit and do not create records',async()=>{
 await assert.rejects(()=>requestModel({provider:'openai',version:'test',prompt:'test',apiKey:'test',fetcher:async()=>({ok:false,status:429,text:async()=>'{"error":"rate limit"}'})}),/HTTP 429/);
});

test('Anthropic workspace-scoped requests use documented 2026 API headers',async()=>{
 let options;
 const fetcher=async (url,opts)=>{options=opts;return {ok:true,text:async()=>JSON.stringify(fixtures.anthropic)};};
 await requestModel({provider:'anthropic',version:'claude-fable-5-2',prompt:'test',apiKey:'private-key',workspaceId:'wrkspc_01ABCDE',fetcher});
 assert.equal(options.headers.Authorization,'Bearer private-key');
 assert.equal(options.headers['anthropic-workspace-id'],'wrkspc_01ABCDE');
 assert.equal(options.headers['anthropic-version'],'2026-10-21');
 await assert.rejects(()=>requestModel({provider:'anthropic',version:'claude-fable-5-2',prompt:'test',apiKey:'private-key',workspaceId:'bad\nheader',fetcher}),/workspace ID/);
});

test('provider HTTP error text is never echoed to callers',async()=>{
 const secret='SENSITIVE_SECRET_DO_NOT_LOG';
 const err=await requestModel({provider:'anthropic',version:'claude-fable-5-2',prompt:'test',apiKey:'x',fetcher:async()=>({ok:false,status:400,text:async()=>JSON.stringify({error:{message:`This API key is not scoped to a workspace. Set anthropic-workspace-id. ${secret}`}})})}).then(()=>null,e=>e);
 assert.equal(err.safeCode,'workspace-required');
 assert.doesNotMatch(err.message,/SENSITIVE_SECRET/);
 assert.equal(classifyProviderHttpError('gemini',403,JSON.stringify({error:{message:'Your project has been denied access'}})),'project-access-denied');
 assert.equal(classifyProviderHttpError('gemini',403,'plaintext unknown'),'unclassified');
});