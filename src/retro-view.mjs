/**
 * Defensive browser projection of server-verified historical API evidence.
 * The public repository and CI own the full evidence and SHA-256 checks.
 */
export function retrospectiveView(dataset, questions) {
  if (!dataset || dataset.schema !== 'historical-api-comparison-v1' ||
      dataset.context !== 'post-event-demonstration' ||
      dataset.game !== 14 || dataset.model?.id !== 'openai-gpt-6-2-astra' ||
      dataset.model?.version !== 'gpt-6.2-astra' ||
      !Array.isArray(dataset.attempts) || dataset.attempts.length !== 3 ||
      !Array.isArray(questions) || questions.length !== 3) return null;

  let score = 0;
  const attempts = dataset.attempts.map((attempt, i) => {
    const q = questions[i];
    if (attempt.ply !== q.ply || attempt.fen !== q.fen ||
        attempt.actualUci !== q.answer.uci || attempt.actualSan !== q.answer.san) {
      throw new Error('Historical API data contradicts the source game');
    }
    if (attempt.status !== 'valid' || typeof attempt.predictedUci !== 'string') return null;
    const legal = q.legalMoves.find(move => move.uci === attempt.predictedUci);
    if (!legal) throw new Error('Historical model prediction is not legal');
    const hit = attempt.predictedUci === q.answer.uci;
    if (hit) score++;
    return {uci: attempt.predictedUci, san: legal.san, hit};
  });
  return {name: 'GPT-6.2 Astra', score, complete: attempts.every(Boolean), attempts};
}
