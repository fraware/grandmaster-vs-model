#!/usr/bin/env node
/**
 * Optional live API collection. Uses documented provider REST endpoints, no SDKs.
 * Records actual response bodies through the same local forecast ledger protocol.
 * Transport cannot establish provider identity independently of the operator.
 */
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {withSans,parseFen} from '../src/chess.mjs';
const ledger=fileURLToPath(new URL('./ledger.mjs',import.meta.url));
const PROMPT_VERSION='gvm-forecast-2026-v1';
function flags(argv){const values={};for(let i=0;i<argv.length;i+=2){const k=argv[i];if(!k?.startsWith('--')||argv[i+1]===undefined)throw new Error('Expected --flag value pairs');values[k.slice(2)]=argv[i+1];}return values;}
export function makePrompt({fen,player,opponent,game,history=''}){
  parseFen(fen);const options=withSans(fen).map(x=>x.uci);
  if(options.length===0)throw new Error('No legal moves');
  if(!player?.trim()||!opponent?.trim()||!Number.isInteger(game)||game<1||game>14)throw new Error('Missing/invalid player, opponent or game');
  return `FORECAST PROTOCOL ${PROMPT_VERSION}\nYou are predicting a HUMAN chess decision, not the objectively strongest chess move.\nTournament: 2026 FIDE World Chess Championship. Game: ${game}.\nPlayer to move: ${player}. Opponent: ${opponent}.\nCurrent FEN: ${fen}\nPrevious moves in UCI notation (chronological; empty if unavailable): ${history||'[not supplied]'}\nLegal candidate moves (UCI): ${options.join(' ')}\nPredict the single move this player will actually choose, using only the supplied position and history. Do not consult tools or external information.\nOutput EXACTLY one legal UCI move from the list, with no explanation.`;
}
export function parsePrediction(text, legal){
  if(typeof text!=='string')throw new Error('Provider output was not text');
  const candidate=text.trim().replace(/^`|`$/g,'');
  if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(candidate))throw new Error('Provider output is not a single UCI move: '+JSON.stringify(text.slice(0,100)));
  if(!legal.includes(candidate))throw new Error('Provider returned an illegal move: '+candidate);
  return candidate;
}
/** Client accepts injectable fetch to allow fully offline interface tests. */
export async function requestModel({provider,version,prompt,apiKey,timeoutMs=45000,fetcher=fetch}){
  if(!apiKey)throw new Error(`Missing API credential for ${provider}`);
  if(!version)throw new Error('Model version/name required');
  let url,body,headers={'Content-Type':'application/json'};
  if(provider==='openai'){
    url='https://api.openai.com/v1/responses';headers.Authorization=`Bearer ${apiKey}`;
    body={model:version,input:prompt,reasoning:{effort:'low'},max_output_tokens:2048,store:false};
  }else if(provider==='anthropic'){
    url='https://api.anthropic.com/v1/messages';headers['x-api-key']=apiKey;headers['anthropic-version']='2026-10-21';
    body={model:version,max_tokens:2048,messages:[{role:'user',content:prompt}]};
  }else if(provider==='gemini'){
    if(!/^[a-zA-Z0-9._-]+$/.test(version))throw new Error('Unsafe Gemini model identifier');
    url=`https://generativelanguage.googleapis.com/v1beta/models/${version}:generateContent`;
    headers['x-goog-api-key']=apiKey;
    body={contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:2048}};
  }else throw new Error('Supported providers: openai, anthropic, gemini');
  const started=Date.now();
  let response;
  try{
    response=await fetcher(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs)});
  }catch(e){throw new Error(`Provider transport error (${provider}): ${e.message}`);}
  const elapsedMs=Date.now()-started;
  const content=await response.text();
  if(!response.ok)throw new Error(`${provider} HTTP ${response.status}: ${content.slice(0,400)}`);
  let json;try{json=JSON.parse(content);}catch{throw new Error(`${provider} did not return JSON`);}
  let output;
  if(provider==='openai')output=(json.output||[]).flatMap(item=>item.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');
  else if(provider==='anthropic')output=(json.content||[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');
  else output=(json.candidates?.[0]?.content?.parts||[]).filter(x=>typeof x.text==='string').map(x=>x.text).join('\n');
  if(!output)throw new Error(`${provider} yielded no usable text (status ${json.status||json.stop_reason||'unknown'})`);
  return {output,responseId:json.id||null,elapsedMs,model:json.model||version,usage:json.usage||json.usageMetadata||null};
}
async function main(){
  const o=flags(process.argv.slice(2));
  for(const k of ['provider','version','fen','player','opponent','game','ply'])if(!o[k])throw new Error(`Missing --${k}`);
  const game=Number(o.game),ply=Number(o.ply);
  if(!Number.isInteger(ply)||ply<1)throw new Error('Invalid ply');
  const provider=o.provider;
  const envName={openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY'}[provider];
  if(!envName)throw new Error('Unsupported provider');
  const apiKey=process.env[envName];
  if(!apiKey)throw new Error(`Set ${envName} in the environment (never commit secrets)`);
  const history=o['history-file']?(await readFile(o['history-file'],'utf8')).trim():'';
  const prompt=makePrompt({fen:o.fen,player:o.player,opponent:o.opponent,game,history});
  const result=await requestModel({provider,version:o.version,prompt,apiKey});
  const legal=withSans(o.fen).map(x=>x.uci);
  const uci=parsePrediction(result.output,legal);
  const recordedTime=new Date().toISOString();
  const temp=await mkdtemp(join(tmpdir(),'gvm-'));
  try{
    const promptFile=join(temp,'prompt.txt'),responseFile=join(temp,'response.txt');
    await Promise.all([writeFile(promptFile,prompt),writeFile(responseFile,result.output)]);
    const id=o['model-id']||`${provider}-${o.version.toLowerCase().replace(/[^a-z0-9-]+/g,'-')}`.slice(0,62);
    const args=[ledger,'forecast','--game',String(game),'--ply',String(ply),'--fen',o.fen,'--model',id,'--version',o.version,'--prompt-file',promptFile,'--response-file',responseFile,'--uci',uci,'--predicted-at',recordedTime,'--provider',provider,'--elapsed-ms',String(result.elapsedMs),...(result.responseId?['--provider-response-id',result.responseId]:[]),'--provider-reported-model',result.model];
    const completed=spawnSync(process.execPath,args,{encoding:'utf8'});
    if(completed.status!==0)throw new Error(completed.stderr||completed.stdout||'Ledger command failed');
    console.log(completed.stdout);
    console.log(JSON.stringify({provider,version:result.model,uci,elapsedMs:result.elapsedMs,responseId:result.responseId,usage:result.usage},null,2));
  }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
