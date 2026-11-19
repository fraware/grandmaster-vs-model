/**
 * Single-screen, three-position historical chess challenge.
 * All answers are reconstructed from the sourced match. No network, account,
 * API key, saved identity, model prediction, or global ranking is involved.
 */
import {parseFen, toSquare} from './chess.mjs';
import {createChallenge, scoreChallenge, challengeShareText} from './challenge.mjs';

const pieceGlyph = {K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'};
const pieceName = {K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn'};
const get = id => document.getElementById(id);

/** A privacy-preserving result card constructed without remote rendering. */
export function drawChallengeCard(score) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#f5f2eb';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = '#292c26';
  ctx.fillRect(0, 0, 1200, 12);
  ctx.font = '600 25px Georgia, serif';
  ctx.fillText('GRANDMASTER  vs  MODEL', 68, 94);
  ctx.fillStyle = '#98432e';
  ctx.fillRect(68, 135, 54, 5);
  ctx.font = '600 20px Arial, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('THE THREE-MOVE CHALLENGE', 68, 196);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#292c26';
  ctx.font = 'normal 215px Georgia, serif';
  ctx.fillText(`${score.correct}/3`, 60, 415);
  ctx.font = 'normal 35px Georgia, serif';
  ctx.fillText('grandmaster moves predicted', 73, 482);
  ctx.fillStyle = '#5e625b';
  ctx.font = '23px Arial, sans-serif';
  ctx.fillText('Real positions · 2024 World Chess Championship final', 73, 553);
  ctx.fillStyle = '#292c26';
  ctx.fillRect(897, 140, 231, 312);
  ctx.fillStyle = '#d8d7c8';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#7e896e' : '#e9e6d9';
      ctx.fillRect(910 + col * 27, 156 + row * 27, 27, 27);
    }
  }
  ctx.fillStyle = '#f5f2eb';
  ctx.font = '118px Georgia, serif';
  ctx.fillText('♞', 951, 326);
  ctx.fillStyle = '#98432e';
  ctx.font = '600 23px Arial, sans-serif';
  ctx.fillText('TRY IT YOURSELF', 900, 510);
  ctx.fillStyle = '#5e625b';
  ctx.font = '20px Arial, sans-serif';
  ctx.fillText('fraware.github.io/grandmaster-vs-model', 750, 569);
  return canvas;
}

/** Initialize the challenge once its locally bundled archival game has passed validation. */
export function mountChallenge(archive, replay) {
  const questions = createChallenge(archive, replay);
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

  function setText(id, value) { get(id).textContent = value; }
  function drawPosition(q) {
    const {board: squares} = parseFen(q.fen);
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

  function updateChoice() {
    const q = questions[index];
    chooser.value = selectedUci || '';
    revealButton.disabled = !selectedUci || revealed;
    setText('challenge-hint', selectedUci
      ? `Your choice: ${q.legalMoves.find(m => m.uci === selectedUci)?.san || selectedUci}. Reveal to compare.`
      : origin ? `Choose a destination for ${origin}.` : 'Select a piece and destination, or pick a legal move.');
    drawPosition(q);
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
    final.hidden = true;
    choice.hidden = false;
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
    nextButton.hidden = false;
    const match = selectedUci === q.answer.uci;
    setText('challenge-answer-result', match?'Exact match.':'Different move.');
    setText('challenge-answer-move',`The grandmaster played ${q.answer.san}.`);
    setText('challenge-answer-yours',`You chose ${q.legalMoves.find(m => m.uci === selectedUci).san}.`);
    feedback.classList.toggle('correct',match);
    feedback.hidden = false;
    setText('challenge-hint','The answer is from the recorded 2024 championship game.');
    nextButton.textContent = index === questions.length - 1?'See your result →':'Next position →';
    drawPosition(q);
    nextButton.focus();
  }

  function finish() {
    complete = true;
    const result = scoreChallenge(questions, answers);
    setText('challenge-count','CHALLENGE COMPLETE');
    setText('challenge-phase','YOUR RESULT / WORLD CHAMPIONSHIP 2024');
    setText('challenge-heading',`${result.correct} out of ${result.total}.`);
    setText('challenge-description', 'You predicted the exact human move in three real championship positions.');
    get('challenge-progress').querySelectorAll('span').forEach(el=>{el.classList.add('done');el.classList.remove('current');});
    choice.hidden = true;
    feedback.hidden = true;
    nextButton.hidden = true;
    final.hidden = false;
    setText('challenge-result-label', `${result.correct} / ${result.total} exact matches`);
    setText('challenge-result-note', 'Personal score from a retrospective game. No AI model is scored here.');
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
    const text = challengeShareText(score.correct,url.href);
    try {
      if (navigator.share) {
        await navigator.share({title:'Grandmaster vs Model — Three moves',text});
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
      const canvas = drawChallengeCard(scoreChallenge(questions,answers));
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
