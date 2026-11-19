import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN} from '../src/chess.mjs';
import {makePrompt,parsePrediction,requestModel} from '../scripts/model-runner.mjs';
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
