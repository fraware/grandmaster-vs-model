/**
 * Retrospective, post-event model comparison for the sourced 2024 Game 14.
 * These records are NOT prospective forecasts or an unbiased measure of
 * human prediction: the entire game predates the model's release.
 */
import {createHash} from 'node:crypto';
import {createChallenge} from './challenge.mjs';
import {parsePrediction} from '../scripts/model-runner.mjs';

export const RETROSPECTIVE_SCHEMA = 'historical-api-comparison-v1';
export const RETROSPECTIVE_MODEL_ID = 'openai-gpt-6-2-astra';
export const RETROSPECTIVE_VERSION = 'gpt-6.2-astra';
export const RETROSPECTIVE_CONTEXT = 'post-event-demonstration';

const hex64 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const sha256 = value => createHash('sha256').update(value).digest('hex');

/** A game-specific prompt. Neither the answer nor subsequent moves are supplied. */
export function historicalPrompt(question, archive, replay) {
  if (!question || !replay?.moves || !archive) throw new Error('Missing historical context');
  const history = replay.moves.slice(0, question.ply).map(move => move.uci).join(' ');
  const legal = question.legalMoves.map(move => move.uci).join(' ');
  return [
    'Historical chess decision experiment. This is a retrospective demonstration.',
    'Predict the next HUMAN move from the position; do not seek the best engine move.',
    `Event: FIDE World Chess Championship 2024, Game 14, ${archive.date}.`,
    `Player to move: ${question.player}.`,
    `Opponent: ${question.player === archive.white ? archive.black : archive.white}.`,
    `FEN: ${question.fen}`,
    `Earlier moves in UCI (no future moves): ${history}`,
    `Legal candidate moves in UCI: ${legal}`,
    'Do not call tools or consult external material. Return exactly one legal UCI move, with no explanation.',
  ].join('\n');
}

/** Validate all claimed facts against the legally reconstructed game. */
export function verifyRetrospective(dataset, archive, replay) {
  const questions = createChallenge(archive, replay);
  if (dataset?.schema !== RETROSPECTIVE_SCHEMA ||
      dataset.source !== archive.source || dataset.context !== RETROSPECTIVE_CONTEXT ||
      dataset.game !== 14 || dataset.event !== archive.event ||
      dataset.model?.id !== RETROSPECTIVE_MODEL_ID ||
      dataset.model?.version !== RETROSPECTIVE_VERSION ||
      dataset.model?.provider !== 'openai') throw new Error('Invalid retrospective identity');
  if (!Array.isArray(dataset.attempts) || ![0, 3].includes(dataset.attempts.length)) {
    throw new Error('Retrospective dataset must be empty or contain all three recorded attempts');
  }
  if (dataset.attempts.length === 0) return {ready: false, valid: 0, correct: 0, total: 3};
  let correct = 0, valid = 0;
  dataset.attempts.forEach((attempt, index) => {
    const q = questions[index];
    if (attempt.ply !== q.ply || attempt.fen !== q.fen || attempt.actualUci !== q.answer.uci ||
        attempt.actualSan !== q.answer.san || !['valid', 'invalid', 'request-failed'].includes(attempt.status)) {
      throw new Error('Retrospective attempt contradicts the source game');
    }
    const prompt = historicalPrompt(q, archive, replay);
    if (attempt.prompt !== prompt || attempt.promptSha256 !== sha256(prompt) ||
        typeof attempt.output !== 'string' || attempt.outputSha256 !== sha256(attempt.output)) {
      throw new Error('Retrospective request/response evidence changed');
    }
    if (!Number.isFinite(Date.parse(attempt.startedAt)) || !Number.isFinite(Date.parse(attempt.completedAt)) ||
        Date.parse(attempt.completedAt) < Date.parse(attempt.startedAt)) {
      throw new Error('Invalid retrospective request chronology');
    }
    if (attempt.status === 'valid') {
      if (!attempt.providerResponseId || attempt.providerReportedModel !== RETROSPECTIVE_VERSION) {
        throw new Error('Valid response lacks the requested provider/model evidence');
      }
      if (parsePrediction(attempt.output, q.legalMoves.map(m => m.uci)) !== attempt.predictedUci) {
        throw new Error('Recorded valid model move differs from raw output');
      }
      valid++;
      if (q.answer.uci === attempt.predictedUci) correct++;
    } else if (attempt.predictedUci !== null) {
      throw new Error('Failed model inference must not receive a legal prediction');
    }
    if (attempt.providerResponseId !== null && typeof attempt.providerResponseId !== 'string') {
      throw new Error('Invalid provider response ID');
    }
    if (attempt.providerReportedModel !== null && typeof attempt.providerReportedModel !== 'string') {
      throw new Error('Invalid provider model identity');
    }
    if (attempt.status === 'request-failed' && !['provider-error', 'timeout', 'transport-error'].includes(attempt.failure)) {
      throw new Error('Unexpected provider failure code');
    }
    if (typeof attempt.promptSha256 !== 'string' || !hex64(attempt.promptSha256) || !hex64(attempt.outputSha256)) {
      throw new Error('Invalid SHA-256 digest');
    }
  });
  return {ready: true, valid, correct, total: 3, complete: valid === 3};
}
