#!/usr/bin/env node
/**
 * Credentialed provider integration check.
 *
 * This is intentionally separate from prospective championship collection.
 * It submits one inexpensive synthetic chess-move request per configured API key,
 * records only sanitized operational metadata, and never publishes its outputs
 * as observed championship forecasts.
 *
 * The check reports access to a model; it does not establish prospective
 * prediction validity, model strength, or a contractual API access guarantee.
 */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {START_FEN,withSans} from '../src/chess.mjs';
import {parsePrediction,requestModel} from './model-runner.mjs';

const repositoryRoot=fileURLToPath(new URL('../',import.meta.url));
const envForProvider=Object.freeze({openai:'OPENAI_API_KEY',anthropic:'ANTHROPIC_API_KEY',gemini:'GEMINI_API_KEY'});
const testPrompt=[
  'PROVIDER INTEGRATION CHECK — NOT A CHAMPIONSHIP FORECAST.',
  'Choose exactly one legal chess move in UCI notation for the following standard opening position.',
  `Position (FEN): ${START_FEN}`,
  `Legal moves: ${withSans(START_FEN).map(move=>move.uci).join(' ')}`,
  'Reply with the move alone. No explanation.'
].join('\n');
const digest=value=>createHash('sha256').update(value).digest('hex');

/** Return safe, finite classifications without provider-supplied error text. */
export function errorCategory(error){
  const message=String(typeof error==='string'?error:error?.message??'');
  if(typeof error?.safeCode==='string' && /^[a-z-]{3,40}$/.test(error.safeCode))return error.safeCode;
  const code=/\bHTTP (400|401|402|403|404|408|409|422|429|500|502|503|504)\b/.exec(message);
  if(code)return `http-${code[1]}`;
  if(/timeout|aborted/i.test(message))return 'timeout';
  if(/no usable text/i.test(message))return 'empty-output';
  if(/transport|network|fetch/i.test(message))return 'transport-error';
  return 'provider-error';
}

/**
 * Execute exactly one request for each enabled model with a configured key.
 * The injected request and clock make behavior testable without paid traffic.
 */
export async function checkProviders({roster,keys,request=requestModel,clock=()=>new Date(),onlyProviders=null}={}){
  if(roster?.schema!=='model-roster-v1'||!Array.isArray(roster.models))throw new Error('Invalid model roster');
  const seen=new Set();
  const providers=[];
  for(const model of roster.models){
    if(!model.capture || (onlyProviders && !onlyProviders.includes(model.provider)))continue;
    if(!['openai','anthropic','gemini'].includes(model.provider)||typeof model.version!=='string'||!model.version||typeof model.id!=='string'||!model.id)throw new Error('Malformed model roster item');
    if(seen.has(model.id))throw new Error('Duplicate roster model identifier');
    seen.add(model.id);
    const key=keys?.[envForProvider[model.provider]];
    if(typeof key!=='string'||key.trim()===''){
      providers.push({id:model.id,provider:model.provider,model:model.version,status:'credential-missing'});
      continue;
    }
    const begun=clock().toISOString();
    try{
      const result=await request({provider:model.provider,version:model.version,prompt:testPrompt,apiKey:key,timeoutMs:40000,workspaceId:model.provider==='anthropic'?(keys.ANTHROPIC_WORKSPACE_ID||null):null});
      const record={id:model.id,provider:model.provider,model:model.version,status:'success',startedAt:begun,completedAt:clock().toISOString(),reportedModel:result.model??null,responseId:result.responseId??null,elapsedMs:result.elapsedMs??null,usage:result.usage??null,responseSha256:digest(result.output)};
      try{record.move=parsePrediction(result.output,withSans(START_FEN).map(x=>x.uci));}
      catch{record.status='invalid-move';record.move=null;}
      providers.push(record);
    }catch(error){
      providers.push({id:model.id,provider:model.provider,model:model.version,status:'request-failed',category:errorCategory(error),startedAt:begun,completedAt:clock().toISOString()});
    }
  }
  return {
    schema:'provider-smoke-v1',
    purpose:'credential-and-adapter-verification',
    note:'Synthetic integration requests, excluded from championship forecasts and leaderboards.',
    testedAt:clock().toISOString(),
    promptSha256:digest(testPrompt),
    providers
  };
}

async function main(){
  const roster=JSON.parse(await readFile(join(repositoryRoot,'data/models.json'),'utf8'));
  const onlyProviders=process.env.SMOKE_PROVIDERS?process.env.SMOKE_PROVIDERS.split(',').map(x=>x.trim()):null;
  if(onlyProviders && (!onlyProviders.length||onlyProviders.some(x=>!Object.hasOwn(envForProvider,x))))throw new Error('Invalid provider filter');
  const report=await checkProviders({roster,keys:process.env,onlyProviders});
  const output=join(repositoryRoot,'provider-smoke-report.json');
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log('Credential test completed. These are synthetic requests, not championship forecasts.');
  for(const p of report.providers){
    const code=p.category?` (${p.category})`:'';
    const move=p.status==='success'?` | legal move ${p.move}`:'';
    console.log(`${p.provider} / ${p.model}: ${p.status}${code}${move}`);
  }
  const configured=report.providers.filter(p=>p.status!=='credential-missing');
  if(!configured.length){console.error('No API keys were provided to this workflow.');process.exitCode=1;}
  else if(configured.some(p=>p.status!=='success')){console.error('One or more configured models failed the integration check.');process.exitCode=1;}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main().catch(()=>{console.error('Provider smoke test encountered an internal error');process.exitCode=1;});