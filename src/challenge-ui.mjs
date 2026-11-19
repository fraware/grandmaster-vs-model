/**
 * Single-screen, three-position historical chess challenge.
 * All answers are reconstructed from the sourced match. No network, account,
 * API key, saved identity, model prediction, or global ranking is involved.
 */
import {parseFen, play, toSquare} from './chess.mjs';
import {createChallenge, scoreChallenge, challengeShareText} from './challenge.mjs';
import {retrospectiveView} from './retro-view.mjs';

const pieceGlyph = {K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'};
const pieceName = {K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn'};
const get = id => document.getElementById(id);

/** A privacy-preserving result card constructed without remote rendering. */
export function drawChallengeCard(score, matches = null, rivalScore = null) {
  if (!Number.isInteger(score?.correct) || score.correct < 0 || score.correct > 3 || score.total !== 3) {
    throw new Error('Invalid challenge score for export');
  }
  if (matches !== null && (!Array.isArray(matches) || matches.length !== 3 || matches.some(x => typeof x !== 'boolean') || matches.filter(Boolean).length !== score.correct)) {
    throw new Error('Inconsistent challenge answers for export');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#121e19';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#def47c';
  ctx.fillRect(0, 0, 1200, 8);
  ctx.fillStyle = '#e9efdb';
  ctx.font = '600 27px Georgia, serif';
  ctx.fillText('GRANDMASTER  vs  MODEL', 72, 87);
  ctx.fillStyle = '#def47c';
  ctx.font = '700 19px Arial, sans-serif';
  ctx.fillText('THE THREE-MOVE CHALLENGE', 72, 160);
  ctx.font = '400 200px Georgia, serif';
  ctx.fillText(`${score.correct}/3`, 57, 373);
  if (matches) {
    matches.forEach((hit, i) => {
      ctx.fillStyle = hit ? '#cce6a9' : '#ac6b56';
      ctx.fillRect(73 + i * 79, 409, 62, 62);
      ctx.fillStyle = '#11221a';
      ctx.font = '700 34px Arial, sans-serif';
      ctx.fillText(hit ? '✓' : '×', 92 + i * 79, 451);
    });
  }
  ctx.fillStyle = '#e9efdb';
  ctx.font = '400 34px Georgia, serif';
  ctx.fillText(rivalScore === null ? 'Can you predict the grandmaster’s next move?' : rivalScore === 3 ? 'GPT scored 3/3. Can you match it?' : `GPT scored ${rivalScore}/3. Can you do better?`, 72, 530);
  ctx.fillStyle = '#a9b9a6';
  ctx.font = '21px Arial, sans-serif';
  ctx.fillText('fraware.github.io/grandmaster-vs-model', 72, 575);
  if (rivalScore !== null) {
    ctx.font = '15px Arial, sans-serif';
    ctx.fillText('Retrospective 2024 game, tested in 2026. Not a prospective forecast.', 72, 612);
  }
  // An abstract chessboard motif, not a purported position from the match.
  const startX = 855, startY = 164, cell = 34;
  ctx.fillStyle = '#23372a';
  ctx.fillRect(startX - 12, startY - 12, 8 * cell + 24, 8 * cell + 24);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#71876c' : '#d7ddc4';
      ctx.fillRect(startX + col * cell, startY + row * cell, cell, cell);
    }
  }
  ctx.fillStyle = '#17261f';
  ctx.font = '202px Georgia, serif';
  ctx.fillText('♞', startX + 62, startY + 220);
  return canvas;
}

/** Initialize the challenge once its locally bundled archival game has passed validation. */
export function mountChallenge(archive, replay, retrospective = null) {
  const questions = createChallenge(archive, replay);
  let model = null;
  try { model = retrospectiveView(retrospective, questions); }
  catch { /* Bad optional evidence must not disable the verified historical game. */ }
  let index = 0;
  let selectedUci = null;
  let origin = null;
  let revealed = false;
  let complete = false;
  let answers = [];
  const board = get('challenge-board');
  const chooser = get('challenge-move-select');
  const revealButton = get('challenge-reveal');
  const nextButton = get('challenge-next');
  const feedback = get('challenge-feedback');
  const final = get('challenge-finished');
  const choice = get('challenge-choice');
  const shareStatus = get('challenge-share-status');
  const mobileRevealButton = get('challenge-mobile-reveal');
  if (model?.complete) {
    setText('hero-subtitle', model.score === 3
      ? 'Three real moves from the 2024 World Championship. GPT matched all three in a retrospective API test. Now it’s your turn.'
      : "Can you predict the grandmaster's moves better than a real GPT model? Three historical positions. No signup.");
  }

  function setText(id, value) { get(id).textContent = value; }
  function drawPosition(q) {
    const {board: squares} = parseFen(revealed ? play(q.fen, q.answer.uci).fen : q.fen);
    const flipped = q.color === 'black';
    const possibleTargets = origin ? q.legalMoves.filter(m => m.uci.startsWith(origin)).map(m => m.uci.slice(2,4)) : [];
    board.replaceChildren();
    board.setAttribute('aria-label',`${q.player}, ${q.color} to move. Choose a piece and a destination, or use the legal move selector.`);
    for (let visual = 0; visual < 64; visual++) {
      const at = flipped ? 63-visual : visual;
      const square = toSquare(at), piece = squares[at];
      const row = Math.floor(visual/8), col = visual%8;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = `challenge-square ${(row+col)%2 ? 'dark' : 'light'}`;
      cell.disabled = revealed || complete;
      cell.setAttribute('aria-label',`${square}${piece === '.' ? ', empty' : `, ${piece === piece.toUpperCase() ? 'white' : 'black'} ${pieceName[piece.toUpperCase()]}`}${possibleTargets.includes(square)?', legal destination':''}`);
      if (square === origin) cell.classList.add('selected');
      if (possibleTargets.includes(square)) cell.classList.add('target');
      if (selectedUci && [selectedUci.slice(0,2), selectedUci.slice(2,4)].includes(square)) cell.classList.add('predicted');
      if (revealed && [q.answer.uci.slice(0,2), q.answer.uci.slice(2,4)].includes(square)) cell.classList.add('answer');
      if (revealed && square === q.answer.uci.slice(2,4)) cell.classList.add('answer-end');
      if (piece !== '.') {
        const glyph = document.createElement('span');
        glyph.className = `challenge-piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`;
        glyph.textContent = pieceGlyph[piece];
        glyph.setAttribute('aria-hidden','true');
        cell.append(glyph);
      }
      if (row === 7) {
        const file = document.createElement('span');file.className = 'challenge-coordinate file';file.textContent = square[0];cell.append(file);
      }
      if (col === 0) {
        const rank = document.createElement('span');rank.className = 'challenge-coordinate rank';rank.textContent = square[1];cell.append(rank);
      }
      cell.addEventListener('click', () => {
        if (revealed || complete) return;
        const candidates = origin ? q.legalMoves.filter(m => m.uci.slice(0,2) === origin && m.uci.slice(2,4) === square) : [];
        if (candidates.length) {
          const move = candidates.find(m => m.uci.length === 4) || candidates.find(m => m.uci.endsWith('q')) || candidates[0];
          selectedUci = move.uci;
          origin = null;
          updateChoice();
          return;
        }
        origin = q.legalMoves.some(m => m.uci.startsWith(square)) ? square : null;
        selectedUci = null;
        updateChoice();
      });
      board.append(cell);
    }
  }

  function updateMobileDock() {
    if (!mobileRevealButton) return;
    mobileRevealButton.hidden = !selectedUci || revealed || complete;
    mobileRevealButton.disabled = !selectedUci || revealed || complete;
    document.body.classList.toggle('has-mobile-reveal', !mobileRevealButton.hidden);
  }

  function updateChoice() {
    const q = questions[index];
    chooser.value = selectedUci || '';
    revealButton.disabled = !selectedUci || revealed;
    setText('challenge-hint', selectedUci
      ? `Your move: ${q.legalMoves.find(m => m.uci === selectedUci)?.san || selectedUci}. Ready to lock in.`
      : origin ? `Choose a destination for ${origin}.` : 'Select a piece and destination, or pick a legal move.');
    drawPosition(q);
    updateMobileDock();
  }

  function render() {
    const q = questions[index];
    setText('challenge-count',`${index+1} OF ${questions.length}`);
    setText('challenge-phase',q.stage);
    setText('challenge-heading',q.title);
    setText('challenge-description',q.detail);
    setText('challenge-player',q.player);
    setText('challenge-color',q.color.toUpperCase() + ' TO MOVE');
    setText('challenge-move-index',`MOVE ${Math.floor(q.ply/2)+1}`);
    const progress = get('challenge-progress');
    progress.replaceChildren();
    questions.forEach((_,i) => {
      const el = document.createElement('span');
      el.className = `challenge-step${i===index?' current':''}${i<answers.length?' done':''}`;
      el.setAttribute('aria-label',`Position ${i+1}${i<answers.length?', answered':''}${i===index?', current':''}`);
      progress.append(el);
    });
    chooser.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Choose a legal move…';
    chooser.append(placeholder);
    [...q.legalMoves].sort((a,b) => a.san.localeCompare(b.san)).forEach(move => {
      const o = document.createElement('option');o.value = move.uci;o.textContent = move.san;chooser.append(o);
    });
    chooser.disabled = false;
    revealButton.hidden = false;
    revealButton.disabled = true;
    nextButton.hidden = true;
    feedback.hidden = true;
    get('challenge-model-feedback').hidden = true;
    final.hidden = true;
    choice.hidden = false;
    get('challenge-prompt').hidden = false;
    board.hidden = false;
    selectedUci = null;
    origin = null;
    revealed = false;
    updateChoice();
  }

  function reveal() {
    if (!selectedUci || revealed || complete) return;
    const q = questions[index];
    if (!q.legalMoves.some(m => m.uci === selectedUci)) return;
    answers.push(selectedUci);
    revealed = true;
    chooser.disabled = true;
    revealButton.hidden = true;
    updateMobileDock();
    nextButton.hidden = false;
    const match = selectedUci === q.answer.uci;
    setText('challenge-answer-result', match?'Exact match.':'Different move.');
    setText('challenge-answer-move',`The grandmaster played ${q.answer.san}.`);
    setText('challenge-answer-yours',`You chose ${q.legalMoves.find(m => m.uci === selectedUci).san}.`);
    feedback.classList.toggle('correct',match);
    feedback.hidden = false;
    const modelNote = get('challenge-model-feedback');
    const modelMove = model?.attempts[index];
    modelNote.hidden = !modelMove;
    if (modelMove) {
      setText('challenge-model-pick', `${model.name} played ${modelMove.san}. ${modelMove.hit ? 'Exact match.' : 'Different move.'}`);
    }
    setText('challenge-hint','The recorded move is now on the board.');
    nextButton.textContent = index === questions.length - 1?'See your result →':'Next position →';
    drawPosition(q);
    nextButton.focus();
  }

  function finish() {
    complete = true;
    const result = scoreChallenge(questions, answers);
    setText('challenge-count','CHALLENGE COMPLETE');
    setText('challenge-phase','YOUR RESULT / WORLD CHAMPIONSHIP 2024');
    setText('challenge-heading', 'The result is in.');
    setText('challenge-description', 'Three positions. Three real decisions.');
    get('challenge-prompt').hidden = true;
    get('challenge-progress').querySelectorAll('span').forEach(el=>{el.classList.add('done');el.classList.remove('current');});
    choice.hidden = true;
    feedback.hidden = true;
    get('challenge-model-feedback').hidden = true;
    nextButton.hidden = true;
    final.hidden = false;
    setText('challenge-result-label', `${result.correct} of ${result.total}.`);
    const resultTiles = get('challenge-result-tiles');
    if (resultTiles) {
      resultTiles.replaceChildren();
      questions.forEach((q, i) => {
        const hit = q.answer.uci === answers[i];
        const tile = document.createElement('span');
        tile.className = `challenge-result-tile${hit ? ' hit' : ''}`;
        tile.textContent = hit ? '✓' : '×';
        tile.setAttribute('aria-label', `Position ${i + 1}: ${hit ? 'exact match' : 'different move'}`);
        resultTiles.append(tile);
      });
    }
    updateMobileDock();
    const versus = get('challenge-versus');
    versus.hidden = !model?.complete;
    get('challenge-result-evidence').hidden = !model?.complete;
    if (model?.complete) {
      setText('challenge-versus-human', `YOU  ${result.correct}/3`);
      setText('challenge-versus-model', `GPT  ${model.score}/3`);
    }
    setText('challenge-result-note', model?.complete
      ? 'Recorded 2024 moves versus a real, retrospective GPT API run. The game predates this model: this is not a prospective benchmark.'
      : 'Exact grandmaster moves predicted. The historical AI comparison is not yet published.');
    get('challenge-download').disabled = false;
    get('challenge-share').disabled = false;
    shareStatus.textContent = '';
    get('challenge-share').focus();
  }

  chooser.addEventListener('change', () => {
    if (revealed || complete) return;
    const q = questions[index];
    selectedUci = q.legalMoves.some(m => m.uci === chooser.value) ? chooser.value : null;
    origin = null;
    updateChoice();
  });
  revealButton.addEventListener('click',reveal);
  if (mobileRevealButton) mobileRevealButton.addEventListener('click', reveal);
  nextButton.addEventListener('click',() => {
    if (!revealed || complete) return;
    if (index === questions.length-1) finish();
    else {index++;render();chooser.focus();}
  });
  get('challenge-restart').addEventListener('click',()=>{
    answers = [];index = 0;complete = false;render();chooser.focus();
  });
  get('challenge-share').addEventListener('click',async () => {
    if (!complete) return;
    const score = scoreChallenge(questions,answers);
    const url = new URL('.', document.baseURI);url.hash='challenge';
    const text = challengeShareText(score.correct,url.href,questions.map((q,i) => q.answer.uci === answers[i]), model?.complete ? {name:model.name,score:model.score} : null);
    try {
      if (navigator.share) {
        const title = 'Can you predict a grandmaster’s next move?';
        let shared = false;
        if (navigator.canShare && typeof File !== 'undefined') {
          try {
            const card = drawChallengeCard(score, questions.map((q,i) => q.answer.uci === answers[i]), model?.complete ? model.score : null);
            const imageBlob = await new Promise(resolve => card.toBlob(resolve, 'image/png'));
            if (imageBlob) {
              const file = new File([imageBlob], 'grandmaster-vs-model-score.png', {type:'image/png'});
              if (navigator.canShare({files:[file]})) {
                await navigator.share({title,text,files:[file]});
                shared = true;
              }
            }
          } catch (error) {
            if (error?.name === 'AbortError') return;
            // File attachments are optional: fall back to native text sharing.
          }
        }
        if (!shared) await navigator.share({title,text});
        shareStatus.textContent = 'Shared.';
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        shareStatus.textContent = 'Result and challenge link copied.';
      } else {
        get('challenge-share-text').hidden=false;
        get('challenge-share-text').value=text;
        get('challenge-share-text').focus();get('challenge-share-text').select();
        shareStatus.textContent='Select and copy your result.';
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      get('challenge-share-text').hidden=false;
      get('challenge-share-text').value=text;
      get('challenge-share-text').focus();get('challenge-share-text').select();
      shareStatus.textContent='Select and copy your result.';
    }
  });
  get('challenge-download').addEventListener('click',async () => {
    if (!complete) return;
    try {
      const canvas = drawChallengeCard(scoreChallenge(questions,answers),questions.map((q,i) => q.answer.uci === answers[i]), model?.complete ? model.score : null);
      const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if (!blob) throw new Error('Image encoding unavailable');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');a.href=url;a.download='grandmaster-vs-model-result.png';
      document.body.append(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
      shareStatus.textContent='Result image saved.';
    } catch (error) {shareStatus.textContent='Image export is unavailable in this browser.';}
  });

  get('challenge-source').href = archive.source;
  render();
}
