#!/usr/bin/env node
/** Verify that model claims match an unchanged, legally reconstructed source. */
import {readFile} from 'node:fs/promises';
import {replaySanMoves} from '../src/pgn.mjs';
import {verifyRetrospective} from '../src/retrospective.mjs';
const archive = JSON.parse(await readFile(new URL('../data/archive-2024.json', import.meta.url), 'utf8'));
const report = JSON.parse(await readFile(new URL('../data/retrospective-2024.json', import.meta.url), 'utf8'));
const result = verifyRetrospective(report, archive, replaySanMoves(archive.moves.trim().split(/\s+/)));
console.log(`Historical model evidence valid; published valid moves: ${result.valid}/3.`);
