#!/usr/bin/env node
/** Reproduce the 14-round Lichess registry from pinned, inspected API metadata. */
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BROADCAST_REGISTRY,validateRegistry} from '../src/match-2026.mjs';
const output=fileURLToPath(new URL('../data/broadcast-2026.json',import.meta.url));
const expected=JSON.stringify(BROADCAST_REGISTRY,null,2)+'\n';
if(process.argv.slice(2).join(' ')==='--write'){
  await writeFile(output,expected);
  console.log('Pinned 14 verified Lichess broadcast rounds');
}else if(process.argv.length===2){
  const current=await readFile(output,'utf8');
  validateRegistry(JSON.parse(current));
  if(current!==expected)throw new Error('Broadcast registry not reproducible byte-for-byte');
  console.log('Verified all 14 broadcast IDs, URLs and scheduled start times');
}else throw new Error('Usage: node scripts/verify-match-2026.mjs [--write]');
