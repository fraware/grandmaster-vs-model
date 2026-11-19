#!/usr/bin/env node
/**
 * Record and inspect operator-supplied model forecasts and observed moves.
 * CLI claims only local integrity, never an attested call to a model provider.
 */
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {EVENT_ID,canonical,validateForecast,validateOutcome,forecastKey,outcomeKey,scoreForecast} from '../src/protocol.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const forecastDir=join(root,'data','forecasts');
const outcomeDir=join(root,'data','outcomes');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
const help=`Usage:
  node scripts/ledger.mjs forecast --game 1 --ply 1 --fen '...' --model model-id --version exact-version --prompt-file prompt.txt --response-file response.txt --uci e2e4 --predicted-at 2026-11-24T14:03:00Z
  node scripts/ledger.mjs outcome --game 1 --ply 1 --fen '...' --uci e2e4 --played-at 2026-11-24T14:05:00Z --source-url https://lichess.org/broadcast/...
  node scripts/ledger.mjs verify
  node scripts/ledger.mjs build

Forecast records are operator-supplied and locally checksummed. Commit a record publicly before the corresponding move to provide an independently inspectable publication chronology.`;
function opts(argv){
  const v={};for(let i=0;i<argv.length;i+=2){
    const key=argv[i];if(!key?.startsWith('--')||argv[i+1]===undefined)throw new Error('Invalid arguments\n'+help);
    const name=key.slice(2);if(name in v)throw new Error('Duplicate argument '+key);v[name]=argv[i+1];
  }return v;
}
function required(o,...keys){for(const k of keys)if(o[k]===undefined)throw new Error(`Missing --${k}`);}
async function readRecords(dir){
  if(!existsSync(dir))return [];
  const out=[];
  for(const name of (await readdir(dir)).sort()){
    if(!name.endsWith('.json'))continue;
    const obj=JSON.parse(await readFile(join(dir,name),'utf8'));
    const {digest,...payload}=obj;
    if(digest!==hash(payload))throw new Error(`Checksum mismatch: ${dir}/${name}`);
    out.push({name,...obj});
  }return out;
}
async function putRecord(dir,key,payload){
  await mkdir(dir,{recursive:true});const target=join(dir,key+'.json');
  if(existsSync(target))throw new Error(`Record exists: ${target} (append-only; do not overwrite)`);
  await writeFile(target,JSON.stringify({...payload,digest:hash(payload)},null,2)+'\n',{flag:'wx'});
  console.log(`Created ${target}\nSHA-256 ${hash(payload)}\nIMPORTANT: public Git history is needed as an external time anchor.`);
}
async function verify(){
  const forecasts=await readRecords(forecastDir), outcomes=await readRecords(outcomeDir);
  for(const f of forecasts){validateForecast(f);if(f.response.sha256!==hash(f.response.raw))throw new Error('Raw response hash mismatch '+f.name);if(f.model.promptSha256!==hash(f.model.promptText))throw new Error('Prompt hash mismatch '+f.name);}
  for(const o of outcomes)validateOutcome(o);
  const fk=new Set(),ok=new Set();
  for(const f of forecasts){const k=forecastKey(f);if(fk.has(k))throw new Error('Duplicate forecast '+k);fk.add(k);}
  for(const o of outcomes){const k=outcomeKey(o);if(ok.has(k))throw new Error('Duplicate outcome '+k);ok.add(k);}
  const result=[];
  for(const f of forecasts){const o=outcomes.find(o=>o.game===f.game&&o.ply===f.ply);if(o)result.push({key:forecastKey(f),...scoreForecast(f,o)});}
  console.log(`Verified local integrity: ${forecasts.length} forecast(s), ${outcomes.length} outcome(s). Scored ${result.length} candidate pair(s).`);
  console.log('External publication chronology and model identity are NOT attested by this check.');
  return {forecasts,outcomes,results:result};
}
async function build(){
  const {forecasts,outcomes}=await verify();
  const games=Array.from({length:14},(_,i)=>({game:i+1,forecasts:[],outcomes:[]}));
  forecasts.forEach(({name,...f})=>games[f.game-1].forecasts.push({file:`forecasts/${name}`,...f}));
  outcomes.forEach(({name,...o})=>games[o.game-1].outcomes.push({file:`outcomes/${name}`,...o}));
  const payload={schema:'match-v1',event:EVENT_ID,title:'2026 FIDE World Chess Championship',players:['Gukesh D','Javokhir Sindarov'],firstGame:'2026-11-24',source:'https://www.fide.com/salesforce-fide-world-championship-match-2026-schedule-format-and-prize-fund-confirmed/',updateMode:'manual',games};
  const path=join(root,'data','match.json');await writeFile(path,JSON.stringify(payload,null,2)+'\n');console.log('Rebuilt '+path);
}
async function main(){
  const [command,...args]=process.argv.slice(2),o=opts(args);
  if(command==='forecast'){
    required(o,'game','ply','fen','model','version','prompt-file','response-file','uci','predicted-at');
    const [prompt,raw]=await Promise.all([readFile(resolve(o['prompt-file']),'utf8'),readFile(resolve(o['response-file']),'utf8')]);
    const record={schema:'forecast-v1',event:EVENT_ID,game:Number(o.game),ply:Number(o.ply),fen:o.fen,model:{id:o.model,version:o.version,promptText:prompt,promptSha256:hash(prompt),provider:o.provider||'unspecified',providerResponseId:o['provider-response-id']||null,providerReportedModel:o['provider-reported-model']||null,elapsedMs:o['elapsed-ms']===undefined?null:Number(o['elapsed-ms'])},prediction:{uci:o.uci},response:{raw,sha256:hash(raw)},predictedAt:o['predicted-at'],origin:'operator-submitted'};
    validateForecast(record);await putRecord(forecastDir,forecastKey(record),record);
  } else if(command==='outcome'){
    required(o,'game','ply','fen','uci','played-at','source-url');
    const record={schema:'outcome-v1',event:EVENT_ID,game:Number(o.game),ply:Number(o.ply),fen:o.fen,actualUci:o.uci,playedAt:o['played-at'],sourceUrl:o['source-url']};
    validateOutcome(record);await putRecord(outcomeDir,outcomeKey(record),record);
  } else if(command==='verify')await verify();
  else if(command==='build')await build();
  else throw new Error(help);
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
