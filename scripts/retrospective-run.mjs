#!/usr/bin/env node
/**
 * One-time, three-request historical API demonstration.
 * Writes a report artifact only; never changes the 2026 championship ledger.
 * The GitHub workflow is triggered only by installation of its own YAML file.
 */
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {replaySanMoves} from '../src/pgn.mjs';
import {createChallenge} from '../src/challenge.mjs';
import {
  RETROSPECTIVE_SCHEMA, RETROSPECTIVE_MODEL_ID, RETROSPECTIVE_VERSION,
  RETROSPECTIVE_CONTEXT, historicalPrompt, verifyRetrospective, sha256,
} from '../src/retrospective.mjs';
import {requestModel, parsePrediction} from './model-runner.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Never record arbitrary provider response bodies as error messages. */
function failureCode(error) {
  if (/timeout|aborted/i.test(String(error?.name || ''))) return 'timeout';
  if (typeof error?.safeCode === 'string') return 'provider-error';
  if (/network|transport|fetch|timeout|aborted/i.test(String(error?.message || ''))) return 'transport-error';
  return 'provider-error';
}

export async function collectHistoricalComparison({
  archive, replay, apiKey, providerRequest = requestModel, clock = () => new Date(),
} = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for the historical comparison');
  const questions = createChallenge(archive, replay);
  const attempts = [];
  for (const q of questions) {
    const prompt = historicalPrompt(q, archive, replay);
    const startedAt = clock().toISOString();
    let status = 'request-failed';
    let output = '', predictedUci = null, providerResponseId = null;
    let providerReportedModel = null, failure = null, usage = null, elapsedMs = null;
    try {
      const reply = await providerRequest({
        provider: 'openai', version: RETROSPECTIVE_VERSION, prompt, apiKey, timeoutMs: 45000,
      });
      output = reply.output;
      providerResponseId = reply.responseId ?? null;
      providerReportedModel = reply.model ?? null;
      usage = reply.usage ?? null;
      elapsedMs = reply.elapsedMs ?? null;
      try {
        predictedUci = parsePrediction(output, q.legalMoves.map(move => move.uci));
        status = 'valid';
      } catch { status = 'invalid'; }
    } catch (error) { failure = failureCode(error); }
    attempts.push({
      ply: q.ply, fen: q.fen, actualUci: q.answer.uci, actualSan: q.answer.san,
      status, prompt, promptSha256: sha256(prompt), output, outputSha256: sha256(output),
      predictedUci, startedAt, completedAt: clock().toISOString(),
      providerResponseId, providerReportedModel, failure, elapsedMs, usage,
    });
  }
  const dataset = {
    schema: RETROSPECTIVE_SCHEMA, source: archive.source, event: archive.event,
    game: 14, context: RETROSPECTIVE_CONTEXT,
    note: 'The game was public before this model was released; this is retrospective entertainment, not prospective forecasting or a benchmark of generalization.',
    model: {id: RETROSPECTIVE_MODEL_ID, name: 'GPT-6.2 Astra', provider: 'openai', version: RETROSPECTIVE_VERSION},
    attempts,
  };
  verifyRetrospective(dataset, archive, replay);
  return dataset;
}

async function main() {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/retrospective-run.mjs');
  const archive = JSON.parse(await readFile(new URL('../data/archive-2024.json', import.meta.url), 'utf8'));
  const replay = replaySanMoves(archive.moves.trim().split(/\s+/));
  const report = await collectHistoricalComparison({archive, replay, apiKey: process.env.OPENAI_API_KEY});
  const destination = process.env.RETRO_REPORT_PATH || resolve(root, 'retrospective-api-report.json');
  await writeFile(destination, JSON.stringify(report, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  const ok = report.attempts.filter(a => a.status === 'valid').length;
  console.log(`Historical API demonstration completed: ${ok}/3 valid model moves. Report preserved as workflow artifact; no 2026 forecasts recorded.`);
  if (ok !== 3) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(`Historical demonstration failed: ${failureCode(error)}`);
    process.exitCode = 1;
  });
}
