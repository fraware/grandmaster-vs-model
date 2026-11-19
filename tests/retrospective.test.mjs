import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {replaySanMoves} from '../src/pgn.mjs';
import {createChallenge} from '../src/challenge.mjs';
import {collectHistoricalComparison} from '../scripts/retrospective-run.mjs';
import {verifyRetrospective, historicalPrompt} from '../src/retrospective.mjs';
import {retrospectiveView} from '../src/retro-view.mjs';

const archive = JSON.parse(await readFile(new URL('../data/archive-2024.json', import.meta.url), 'utf8'));
const replay = replaySanMoves(archive.moves.trim().split(/\s+/));
const questions = createChallenge(archive, replay);
const baseline = JSON.parse(await readFile(new URL('../data/retrospective-2024.json', import.meta.url), 'utf8'));
const fixedClock = () => new Date('2026-11-19T10:00:00.000Z');

async function mockComparison() {
  let index = 0;
  return collectHistoricalComparison({archive, replay, apiKey: 'unit-test-only', clock: fixedClock,
    providerRequest: async ({provider,version,prompt,apiKey}) => {
      assert.equal(provider, 'openai');
      assert.equal(version, 'gpt-6.2-astra');
      assert.equal(apiKey, 'unit-test-only');
      assert.ok(prompt.includes('2024'));
      const q = questions[index++];
      const uci = index === 2 ? q.legalMoves.find(m => m.uci !== q.answer.uci).uci : q.answer.uci;
      return {output: uci, responseId: `test-response-${index}`, model: version, elapsedMs: 12, usage: {input_tokens: 50, output_tokens: 2}};
    }});
}

test('empty official dataset never implies a historical model score', () => {
  const empty = {...baseline, attempts: []};
  assert.deepEqual(verifyRetrospective(empty, archive, replay), {ready: false, valid: 0, correct: 0, total: 3});
  assert.equal(retrospectiveView(empty, questions), null);
});
test('historical prompt identifies the 2024 game and includes no future moves', () => {
  questions.forEach(q => {
    const prompt = historicalPrompt(q, archive, replay);
    assert.ok(prompt.includes(`FEN: ${q.fen}`));
    assert.ok(prompt.includes(`${q.player}.`));
    assert.ok(prompt.includes(`Earlier moves in UCI (no future moves): ${replay.moves.slice(0,q.ply).map(m=>m.uci).join(' ')}`));
    assert.ok(!prompt.includes('2026 FIDE World Chess Championship'));
  });
});
test('one bounded request for each position; actual API outputs are preserved and verified', async () => {
  const dataset = await mockComparison();
  assert.equal(dataset.attempts.length, 3);
  assert.deepEqual(dataset.attempts.map(x=>x.status), ['valid','valid','valid']);
  assert.equal(verifyRetrospective(dataset, archive, replay).correct, 2);
  assert.deepEqual(retrospectiveView(dataset, questions).attempts.map(x=>x.hit), [true,false,true]);
  assert.equal(retrospectiveView(dataset, questions).score, 2);
  assert.deepEqual(dataset.attempts.map(x=>x.predictedUci), [questions[0].answer.uci, dataset.attempts[1].predictedUci, questions[2].answer.uci]);
});
test('altered source, predictions, prompts, or evidence hashes are rejected', async () => {
  const original = await mockComparison();
  for (const mutation of [
    d => d.attempts[0].actualUci = 'a1a2',
    d => d.attempts[1].predictedUci = 'a1a2',
    d => d.attempts[2].prompt += '\nSPOILER',
    d => d.attempts[0].output += ' some change',
    d => d.model.version = 'gpt-unknown',
  ]) {
    const modified = structuredClone(original);
    mutation(modified);
    assert.throws(() => verifyRetrospective(modified, archive, replay));
  }
});
test('provider errors record an explicit failure without inventing a score', async () => {
  const dataset = await collectHistoricalComparison({archive, replay, apiKey:'unit-test', clock:fixedClock,
    providerRequest: async () => {throw Object.assign(new Error('HTTP 429'),{safeCode:'rate-limited'});}});
  assert.deepEqual(dataset.attempts.map(x=>x.status), ['request-failed','request-failed','request-failed']);
  assert.equal(verifyRetrospective(dataset, archive, replay).complete, false);
  assert.equal(retrospectiveView(dataset, questions).complete, false);
  assert.equal(retrospectiveView(dataset, questions).score, 0);
});
test('no credential causes zero requests', async () => {
  let calls = 0;
  await assert.rejects(collectHistoricalComparison({archive,replay,apiKey:'',providerRequest:async()=>{calls++;}}));
  assert.equal(calls,0);
});

test('public 2024 model record is real, source-matched, and scored strictly as retrospective', () => {
  const result = verifyRetrospective(baseline, archive, replay);
  assert.equal(baseline.context, 'post-event-demonstration');
  if (baseline.attempts.length === 3) {
    assert.equal(result.valid, 3);
    assert.equal(result.correct, 3);
    assert.ok(baseline.attempts.every(x => x.providerResponseId && x.providerReportedModel === 'gpt-6.2-astra'));
  }
});
