#!/usr/bin/env node
/** Validate raw attempt artifacts and derive a minimized public dashboard index. */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildIndex,validateAttempt,validateObservation} from '../src/collection.mjs';
import {canonical} from '../src/protocol.mjs';

const defaultRoot=fileURLToPath(new URL('../',import.meta.url));
const digest=x=>createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
export async function collect({root=defaultRoot,write=false}={}){
  const path=resolve(root); const get=async p=>JSON.parse(await readFile(join(path,p),'utf8'));
  const models=await get('data/models.json');
  const observations=existsSync(join(path,'data/observations/game1.json'))?await get('data/observations/game1.json'):null;
  if(observations)validateObservation(observations);
  const dir=join(path,'data/attempts'), attempts=[];
  if(existsSync(dir)){
    for(const name of (await readdir(dir)).filter(n=>/^[a-z0-9-]+\.json$/.test(n)).sort()){
      const doc=await get('data/attempts/'+name);
      const {digest:stored,...raw}=doc;
      if(stored!==digest(raw))throw new Error('Attempt checksum mismatch: '+name);
      validateAttempt(raw);
      if(name!==`g01-p${String(raw.ply).padStart(3,'0')}-${raw.model.id}.json`)throw new Error('Noncanonical attempt filename: '+name);
      if(raw.promptSha256!==digest(raw.prompt)||raw.responseSha256!==digest(raw.response))throw new Error('Request/response checksum mismatch: '+name);
      attempts.push(raw);
    }
  }
  const index=buildIndex({models,observations,attempts});
  if(write){await mkdir(join(path,'data'),{recursive:true});await writeFile(join(path,'data/collection.json'),JSON.stringify(index,null,2)+'\n');}
  return index;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);
  if(args.length>1||!['--write',undefined].includes(args[0]))throw Error('Usage: node scripts/collection.mjs [--write]');
  collect({write:args[0]==='--write'}).then(x=>console.log(`Validated ${x.attempts.length} model attempts; ${x.observedMoves.length} sourced moves`)).catch(error=>{console.error(error.message);process.exitCode=1;});
}
