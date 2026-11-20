#!/usr/bin/env node
/**
 * Reconcile downloaded GitHub shadow artifacts without touching the live ledger.
 *
 * Usage: node scripts/reconcile-shadow.mjs --dir PATH [--out NEW_REPORT.json]
 *
 * Expected: PATH/shadow-broadcast-RUN-ATTEMPT/artifacts/shadow/session.json
 * Optional: PATH/shadow-broadcast-RUN-ATTEMPT/data/observations/gameN.json
 *
 * Download artifacts with GitHub's supported run-download functionality;
 * artifact names and file digests alone are not cryptographic attestations.
 */
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {reconcileShadowArtifacts} from '../src/shadow-reconcile.mjs';

const own=fileURLToPath(import.meta.url);
const ARTIFACT=/^shadow-broadcast-[1-9][0-9]{0,19}-[1-9][0-9]{0,5}$/;
const SIZE_LIMIT=2_000_000;
async function jsonFile(path,{optional=false}={}){
  let content;
  try{content=await readFile(path,'utf8');}
  catch(error){if(optional&&error?.code==='ENOENT')return null;throw error;}
  if(Buffer.byteLength(content)>SIZE_LIMIT)throw new Error('Artifact JSON exceeds size limit');
  return JSON.parse(content);
}
export async function reconcileDirectory(inputDir){
  const root=resolve(inputDir);
  const entries=(await readdir(root,{withFileTypes:true}))
    .filter(e=>e.isDirectory()&&ARTIFACT.test(e.name))
    .sort((a,b)=>a.name.localeCompare(b.name,'en'));
  if(entries.length===0)throw new Error('No downloaded shadow-broadcast artifacts found');
  if(entries.length>1000)throw new Error('Excessive number of source artifacts');
  const artifacts=[];
  for(const entry of entries){
    const parent=join(root,entry.name);
    const summary=await jsonFile(join(parent,'artifacts/shadow/session.json'));
    const observation=await jsonFile(
      join(parent,`data/observations/game${summary.game}.json`),{optional:true});
    artifacts.push({artifact:entry.name,summary,observation});
  }
  return reconcileShadowArtifacts(artifacts);
}
if(process.argv[1]&&resolve(process.argv[1])===own){
  const args=process.argv.slice(2);
  const valid=args.length===2&&args[0]==='--dir'||
    args.length===4&&args[0]==='--dir'&&args[2]==='--out';
  if(!valid)throw new Error('Usage: node scripts/reconcile-shadow.mjs --dir PATH [--out NEW_REPORT.json]');
  try{
    const result=await reconcileDirectory(args[1]);
    const serialized=JSON.stringify(result,null,2)+'\n';
    if(args.length===4){
      const output=resolve(args[3]);
      await mkdir(dirname(output),{recursive:true});
      await writeFile(output,serialized,{flag:'wx'});
      console.log(`Wrote ${result.reportedDistinctMoves} operator-reported moves from ${result.inputArtifactCount} source artifacts to ${output}`);
    }else console.log(serialized);
  }catch(error){
    console.error('Shadow source reconciliation failed: '+error.message);
    process.exitCode=1;
  }
}
