/**
 * Single-screen, three-position historical chess challenge.
 * All answers are reconstructed from the sourced match. No network, account,
 * API key, saved identity, model prediction, or global ranking is involved.
 */
import {parseFen, play, toSquare} from './chess.mjs';
import {createChallenge, createPracticeDecks, scoreChallenge, challengeShareText, parsePeerChallenge, peerChallengeOutcome} from './challenge.mjs';
import {retrospectiveView} from './retro-view.mjs';

const pieceGlyph = {K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'};
const pieceName = {K:'king', Q:'queen', R:'rook', B:'bishop', N:'knight', P:'pawn'};
const get = id => document.getElementById(id);

/** A privacy-preserving result card constructed without remote rendering. */
export function drawChallengeCard(score, matches = null, rivalScore = null, set = 1) {
  if (!Number.isInteger(score?.correct) || score.correct < 0 || score.correct > 3 || score.total !== 3) {
    throw new Error('Invalid challenge score for export');
  }
  if (matches !== null && (!Array.isArray(matches) || matches.length !== 3 || matches.some(x => typeof x !== 'boolean') || matches.filter(Boolean).length !== score.correct)) {
    throw new Error('Inconsistent challenge answers for export');
  }
  if (!Number.isInteger(set) || set < 1 || set > 5 || (set !== 1 && rivalScore !== null)) {
    throw new Error('Invalid challenge round for scorecard');
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  // Keep the share result visually continuous with the public chess board.
  // No external fonts or rendered chess position are involved.
  const paper = '#17191f', ink = '#f4f1eb', signal = '#f3bf65',
    muted = '#c0c7d4', rule = '#434c5c';
  const display = '"Arial","Helvetica Neue","Liberation Sans",sans-serif';
  const mono = '"Arial","Helvetica Neue","Liberation Sans",sans-serif';
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = signal;
  ctx.fillRect(0, 0, 1200, 9);
  ctx.font = `800 25px ${display}`;
  ctx.fillStyle = ink;
  ctx.fillText('GRANDMASTER  /  MODEL', 65, 77);
  ctx.fillStyle = rule;
  ctx.fillRect(65, 110, 1070, 2);
  ctx.font = `18px ${mono}`;
  ctx.fillStyle = muted;
  ctx.fillText(`WORLD CHAMPIONSHIP  /  2024  /  SET ${set} OF 5`, 67, 158);
  ctx.fillStyle = signal;
  ctx.font = `800 178px ${display}`;
  ctx.fillText(`${score.correct}/3`, 58, 349);
  if (matches) {
    matches.forEach((hit, i) => {
      const x = 68 + i * 76;
      ctx.fillStyle = hit ? '#385579' : '#654444';
      ctx.fillRect(x, 393, 55, 55);
      ctx.fillStyle = hit ? '#e4efff' : '#FFE0D5';
      ctx.font = `800 29px ${display}`;
      ctx.fillText(hit ? '✓' : '×', x + 14, 431);
    });
  }
  ctx.fillStyle = rule;
  ctx.fillRect(65, 491, 1070, 2);
  ctx.fillStyle = ink;
  ctx.font = `800 35px ${display}`;
  const comparison = rivalScore === null
    ? 'WHAT WOULD YOU PLAY?'
    : `MY SCORE  ${score.correct}/3   /   GPT  ${rivalScore}/3`;
  ctx.fillText(comparison, 68, 543);
  ctx.fillStyle = muted;
  ctx.font = `17px ${mono}`;
  ctx.fillText('fraware.github.io/grandmaster-vs-model', 67, 587);
  if (rivalScore !== null) {
    ctx.font = `13px ${mono}`;
    ctx.fillText('2024 GAME  /  RETROSPECTIVE', 825, 588);
  }
  // This is a decorative chess symbol, never an illustrated game position.
  ctx.fillStyle = signal;
  ctx.font = '270px "DejaVu Sans",Georgia,serif';
  ctx.fillText('♞', 861, 379);
  return canvas;
}

/** Initialize the challenge once its locally bundled archival game has passed validation. */
export function mountChallenge(archive, replay, retrospective = null) {
  const firstQuestions = createChallenge(archive, replay);
  const bonusDecks = createPracticeDecks(archive, replay);
  const incomingPeer = parsePeerChallenge(window.location.href);
  let deckIndex = incomingPeer ? incomingPeer.set - 1 : 0;
  let questions = deckIndex === 0 ? firstQuestions : bonusDecks[deckIndex - 1];
  let model = null;
  try { model = retrospectiveView(retrospective, firstQuestions); }
  catch { /* Bad optional evidence must not disable the verified historical game. */ }
  let activeModel = deckIndex === 0 ? model : null;
  const completedResults = Array(1 + bonusDecks.length).fill(null);
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
  const continueButton = get('challenge-continue');
  let commitTimer = null;
  const cancelCommit = () => {
    if (commitTimer !== null) window.clearTimeout(commitTimer);
    commitTimer = null;
  };

  function setText(id, value) { get(id).textContent = value; }
  let keyboardSquare = 0;
  let pointer = null;
  let dragPiece = null;
  let suppressClick = false;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmallScreen = () => window.matchMedia('(max-width: 720px)').matches;

  /** Update the 64 existing buttons in place: move selection must retain focus. */
  function drawPosition(q) {
    const fen = revealed ? play(q.fen, q.answer.uci).fen
      : selectedUci ? play(q.fen, selectedUci).fen : q.fen;
    const {board: squares} = parseFen(fen);
    const flipped = q.color === 'black';
    const possibleTargets = origin
      ? q.legalMoves.filter(m => m.uci.slice(0, 2) === origin).map(m => m.uci.slice(2, 4))
      : [];
    if (board.children.length !== 64) {
      board.replaceChildren();
      const fragment = document.createDocumentFragment();
      for (let visual = 0; visual < 64; visual++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'challenge-square';
        cell.dataset.visual = String(visual);
        fragment.append(cell);
      }
      board.append(fragment);
    }
    board.setAttribute('aria-label',
      `${q.player}, ${q.color} to move. Tap or drag a piece to choose a legal move. Keyboard: arrow keys navigate, Enter selects.`);
    for (let visual = 0; visual < 64; visual++) {
      const cell = board.children[visual];
      const at = flipped ? 63 - visual : visual;
      const square = toSquare(at);
      const piece = squares[at];
      const row = Math.floor(visual / 8), col = visual % 8;
      cell.dataset.square = square;
      cell.className = `challenge-square ${(row + col) % 2 ? 'dark' : 'light'}`;
      cell.disabled = revealed || complete;
      cell.tabIndex = visual === keyboardSquare ? 0 : -1;
      const name = piece === '.' ? 'empty'
        : `${piece === piece.toUpperCase() ? 'white' : 'black'} ${pieceName[piece.toUpperCase()]}`;
      cell.setAttribute('aria-label', `${square}, ${name}${possibleTargets.includes(square) ? ', legal destination' : ''}`);
      cell.setAttribute('aria-pressed', String(square === origin || !!selectedUci && square === selectedUci.slice(2, 4)));
      if (square === origin) cell.classList.add('selected');
      if (possibleTargets.includes(square)) cell.classList.add('target');
      if (selectedUci && [selectedUci.slice(0, 2), selectedUci.slice(2, 4)].includes(square)) cell.classList.add('predicted');
      if (revealed && [q.answer.uci.slice(0, 2), q.answer.uci.slice(2, 4)].includes(square)) cell.classList.add('answer');
      if (piece !== '.') {
        const glyph = cell.querySelector('.challenge-piece') || document.createElement('span');
        glyph.className = `challenge-piece ${piece === piece.toUpperCase() ? 'white' : 'black'}`;
        glyph.textContent = pieceGlyph[piece];
        glyph.setAttribute('aria-hidden', 'true');
        if (glyph.parentElement !== cell) cell.prepend(glyph);
      } else {
        cell.querySelector('.challenge-piece')?.remove();
      }
      if (row === 7) {
        let file = cell.querySelector('.challenge-coordinate.file');
        if (!file) { file = document.createElement('span'); file.className = 'challenge-coordinate file'; cell.append(file); }
        file.textContent = square[0];
      } else cell.querySelector('.challenge-coordinate.file')?.remove();
      if (col === 0) {
        let rank = cell.querySelector('.challenge-coordinate.rank');
        if (!rank) { rank = document.createElement('span'); rank.className = 'challenge-coordinate rank'; cell.append(rank); }
        rank.textContent = square[1];
      } else cell.querySelector('.challenge-coordinate.rank')?.remove();
    }
  }

  function pickSquare(square) {
    if (revealed || complete) return;
    const q = questions[index];
    const candidates = origin
      ? q.legalMoves.filter(m => m.uci.slice(0, 2) === origin && m.uci.slice(2, 4) === square)
      : [];
    if (candidates.length) {
      // Promotion is unambiguous in these recorded positions; queen promotion
      // is the default elsewhere, with underpromotions available in the list.
      const move = candidates.find(m => m.uci.length === 4) || candidates.find(m => m.uci.endsWith('q')) || candidates[0];
      selectedUci = move.uci;
      origin = null;
    } else {
      origin = q.legalMoves.some(m => m.uci.slice(0, 2) === square) ? square : null;
      selectedUci = null;
    }
    updateChoice();
  }

  board.addEventListener('click', event => {
    if (suppressClick || revealed || complete) return;
    const cell = event.target.closest('.challenge-square');
    if (!cell || !board.contains(cell)) return;
    keyboardSquare = Number(cell.dataset.visual);
    pickSquare(cell.dataset.square);
  });

  board.addEventListener('keydown', event => {
    if (revealed || complete) return;
    const cell = event.target.closest('.challenge-square');
    if (!cell) return;
    const current = Number(cell.dataset.visual);
    let next = current;
    if (event.key === 'ArrowLeft' && current % 8) next--;
    else if (event.key === 'ArrowRight' && current % 8 < 7) next++;
    else if (event.key === 'ArrowUp' && current >= 8) next -= 8;
    else if (event.key === 'ArrowDown' && current < 56) next += 8;
    else if (event.key === 'Home') next = Math.floor(current / 8) * 8;
    else if (event.key === 'End') next = Math.floor(current / 8) * 8 + 7;
    else return;
    event.preventDefault();
    keyboardSquare = next;
    for (const square of board.children) square.tabIndex = Number(square.dataset.visual) === next ? 0 : -1;
    board.children[next].focus();
  });

  function clearDrag() {
    dragPiece?.remove();
    dragPiece = null;
    board.classList.remove('is-dragging');
    board.querySelector('.drag-source')?.classList.remove('drag-source');
    pointer = null;
  }

  /** Natural piece dragging for mouse, pen, and touch; tap-to-select still works. */
  board.addEventListener('pointerdown', event => {
    if (event.button !== 0 || revealed || complete) return;
    const cell = event.target.closest('.challenge-square');
    if (!cell || !questions[index].legalMoves.some(m => m.uci.slice(0, 2) === cell.dataset.square)) return;
    pointer = {
      id:event.pointerId, source:cell.dataset.square,
      x:event.clientX, y:event.clientY, dragging:false,
    };
  });

  window.addEventListener('pointermove', event => {
    if (!pointer || event.pointerId !== pointer.id || revealed || complete) return;
    const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
    if (!pointer.dragging && distance < 9) return;
    if (!pointer.dragging) {
      pointer.dragging = true;
      const source = board.querySelector(`[data-square="${pointer.source}"]`);
      const glyph = source?.querySelector('.challenge-piece');
      if (!glyph) { clearDrag(); return; }
      source.classList.add('drag-source');
      board.classList.add('is-dragging');
      dragPiece = document.createElement('div');
      dragPiece.className = 'drag-piece';
      const clone = glyph.cloneNode(true);
      dragPiece.append(clone);
      dragPiece.style.width = `${source.getBoundingClientRect().width}px`;
      dragPiece.style.height = `${source.getBoundingClientRect().height}px`;
      document.body.append(dragPiece);
    }
    if (event.cancelable) event.preventDefault();
    dragPiece.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0) translate(-50%, -50%)`;
  }, {passive:false});

  window.addEventListener('pointerup', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const {source, dragging} = pointer;
    const target = dragging
      ? document.elementFromPoint(event.clientX, event.clientY)?.closest('.challenge-square')
      : null;
    const destination = target && board.contains(target) ? target.dataset.square : null;
    clearDrag();
    if (!dragging) return; // Native click handles tap and keyboard activation.
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; }, 0);
    const moves = questions[index].legalMoves.filter(m => m.uci.slice(0, 2) === source && m.uci.slice(2, 4) === destination);
    if (moves.length) {
      selectedUci = (moves.find(m => m.uci.length === 4) || moves.find(m => m.uci.endsWith('q')) || moves[0]).uci;
      origin = null;
      keyboardSquare = Number(target.dataset.visual);
      updateChoice({animatePreview:false});
    } else if (destination === source) {
      pickSquare(source);
    }
  });
  window.addEventListener('pointercancel', event => {
    if (pointer?.id === event.pointerId) clearDrag();
  });

  function animateBoardMove(from, to, duration = 420) {
    if (reducedMotion()) return;
    const destination = board.querySelector(`[data-square="${to}"] .challenge-piece`);
    const cell = board.querySelector(`[data-square="${to}"]`);
    if (!destination || !cell || !from) return;
    const deltaX = from.x - cell.getBoundingClientRect().x;
    const deltaY = from.y - cell.getBoundingClientRect().y;
    if (typeof destination.animate !== 'function') return;
    // A visitor can reveal immediately during a preview: cancel the previous
    // animation before beginning the authoritative move transition.
    for (const animation of destination.getAnimations()) animation.cancel();
    destination.animate([
      {transform:`translate(${deltaX}px, ${deltaY}px) scale(1.07)`, opacity:.87},
      {transform:'translate(0,0) scale(1)', opacity:1},
    ], {duration, easing:'cubic-bezier(.2,.78,.22,1)', fill:'both'});
  }

  function scrollToNextBoard() {
    if (!isSmallScreen()) return;
    // Avoid scrolling under a tap; users may start the next move immediately.
    board.scrollIntoView({behavior:'instant', block:'center'});
  }

  function updateMobileDock() {
    if (!mobileRevealButton) return;
    mobileRevealButton.hidden = !revealed || complete;
    mobileRevealButton.disabled = !revealed || complete;
    mobileRevealButton.replaceChildren(document.createTextNode(index === questions.length - 1 ? 'See my score' : 'Next position'));
    document.body.classList.toggle('has-mobile-reveal', !mobileRevealButton.hidden);
  }

  function updateChoice({animatePreview = true} = {}) {
    const q = questions[index];
    const sourcePosition = selectedUci && animatePreview
      ? board.querySelector(`[data-square="${selectedUci.slice(0, 2)}"]`)?.getBoundingClientRect()
      : null;
    chooser.value = selectedUci || '';
    revealButton.disabled = !selectedUci || revealed;
    revealButton.hidden = true;
    setText('challenge-hint', selectedUci
      ? `You played ${q.legalMoves.find(m => m.uci === selectedUci)?.san || selectedUci}. Revealing the grandmaster’s move…`
      : origin ? `Choose a highlighted square for ${origin}.` : 'One guess per position. Make your move above.');
    drawPosition(q);
    if (selectedUci && sourcePosition) animateBoardMove(sourcePosition, selectedUci.slice(2, 4), 240);
    updateMobileDock();
    cancelCommit();
    if (selectedUci && !revealed && !complete) {
      // Show the chosen piece moving before the recorded answer; the extra
      // confirmation click is intentionally eliminated.
      const committed = selectedUci;
      commitTimer = window.setTimeout(() => {
        commitTimer = null;
        if (selectedUci === committed && !revealed && !complete) reveal();
      }, reducedMotion() ? 0 : 420);
    }
  }

  function render() {
    cancelCommit();
    const q = questions[index];
    setText('challenge-series', `Round ${deckIndex + 1}`);
    const thisPeer = incomingPeer && incomingPeer.set === deckIndex + 1 ? incomingPeer : null;
    const peerBanner = get('challenge-peer-target');
    peerBanner.hidden = !thisPeer;
    if (thisPeer) setText('challenge-peer-target-text',
      `Shared target: ${thisPeer.target}/3 in this round. Match it or beat it.`);
    setText('challenge-count',`${index+1} of ${questions.length}`);
    setText('board-instruction', 'Tap or drag a piece to play your move');
    setText('challenge-phase',q.stage);
    setText('challenge-heading',q.title);
    setText('challenge-description',q.detail);
    setText('challenge-player',q.player);
    setText('challenge-color',`${q.color[0].toUpperCase()}${q.color.slice(1)} to move`);
    setText('challenge-move-index',`Move ${Math.floor(q.ply/2)+1}`);
    const progress = get('challenge-progress');
    progress.replaceChildren();
    questions.forEach((_,i) => {
      const el = document.createElement('span');
      el.className = `challenge-step${i===index?' current':''}${i<answers.length?(questions[i].answer.uci === answers[i]?' done':' missed'):''}`;
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
    get('challenge-move-details').open = false;
    revealButton.hidden = true;
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
    keyboardSquare = 0;
    clearDrag();
    updateChoice();
  }

  function reveal() {
    cancelCommit();
    if (!selectedUci || revealed || complete) return;
    const q = questions[index];
    if (!q.legalMoves.some(m => m.uci === selectedUci)) return;
    const sourceCell = board.querySelector(`[data-square="${q.answer.uci.slice(0, 2)}"]`);
    const sourcePosition = sourceCell?.getBoundingClientRect();
    answers.push(selectedUci);
    revealed = true;
    chooser.disabled = true;
    revealButton.hidden = true;
    updateMobileDock();
    nextButton.hidden = false;
    get('challenge-progress').children[index].classList.add(selectedUci === q.answer.uci ? 'done' : 'missed');
    const match = selectedUci === q.answer.uci;
    setText('challenge-answer-result', match?'Exact match.':'Different move.');
    setText('challenge-answer-move',`The grandmaster played ${q.answer.san}.`);
    setText('challenge-answer-yours',`You chose ${q.legalMoves.find(m => m.uci === selectedUci).san}.`);
    feedback.classList.toggle('correct',match);
    feedback.hidden = false;
    const modelNote = get('challenge-model-feedback');
    const modelMove = activeModel?.attempts[index];
    modelNote.hidden = !modelMove;
    if (modelMove) {
      setText('challenge-model-pick', `${activeModel.name} played ${modelMove.san}. ${modelMove.hit ? 'Exact match.' : 'Different move.'}`);
    }
    setText('challenge-hint','The recorded move is now on the board.');
    setText('board-instruction', match ? 'You found the grandmaster’s move' : `The grandmaster played ${q.answer.san}`);
    nextButton.textContent = index === questions.length - 1 ? 'See my score →' : 'Next position →';
    drawPosition(q);
    animateBoardMove(sourcePosition, q.answer.uci.slice(2, 4));
    nextButton.focus({preventScroll:true});
    if (isSmallScreen()) window.setTimeout(() => {
      if (revealed && !complete) feedback.scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth', block:'center'});
    }, reducedMotion() ? 0 : 450);
  }

  function finish() {
    cancelCommit();
    complete = true;
    const result = scoreChallenge(questions, answers);
    completedResults[deckIndex] = result;
    const finishedSets = completedResults.filter(Boolean);
    const totalCorrect = finishedSets.reduce((sum, item) => sum + item.correct, 0);
    const totalAttempted = finishedSets.reduce((sum, item) => sum + item.total, 0);
    setText('challenge-run-progress', `${totalAttempted} of 15 positions explored · ${totalCorrect} exact matches so far`);
    setText('challenge-count','Challenge complete');
    setText('challenge-phase','Your result · 2024 final');
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
    const peerOutcome = get('challenge-peer-outcome');
    const challengeForSet = incomingPeer && incomingPeer.set === deckIndex + 1 ? incomingPeer : null;
    peerOutcome.hidden = !challengeForSet;
    if (challengeForSet) peerOutcome.textContent =
      peerChallengeOutcome(result.correct, challengeForSet.target) +
      ' Shared scores are self-reported.';
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
    versus.hidden = !activeModel?.complete;
    get('challenge-result-evidence').hidden = !activeModel?.complete;
    if (activeModel?.complete) {
      setText('challenge-versus-human', `YOU  ${result.correct}/3`);
      setText('challenge-versus-model', `GPT  ${activeModel.score}/3`);
    }
    setText('challenge-result-note', activeModel?.complete
      ? 'Recorded 2024 moves versus a real, retrospective GPT API run. The game predates this model: this is not a prospective benchmark.'
      : 'Three recorded grandmaster moves from the 2024 final. Practice sets have no corresponding model responses.');
    continueButton.hidden = false;
    continueButton.replaceChildren(document.createTextNode(deckIndex >= bonusDecks.length ? 'Start a fresh run →' : 'Play another three →'));
    get('challenge-restart').textContent = 'Replay this round ↻';
    get('challenge-download').disabled = false;
    get('challenge-share').disabled = false;
    shareStatus.textContent = '';
    (continueButton.hidden ? get('challenge-share') : continueButton).focus({preventScroll:true});
    if (isSmallScreen()) final.scrollIntoView({behavior:reducedMotion() ? 'instant' : 'smooth', block:'start'});
  }

  continueButton.addEventListener('click', () => {
    if (!complete) return;
    cancelCommit();
    if (deckIndex >= bonusDecks.length) {
      deckIndex = 0;
      questions = firstQuestions;
      activeModel = model;
      completedResults.fill(null);
      setText('hero-subtitle', 'Play a move on the board. See the grandmaster’s choice. Start with three positions against a recorded GPT retrospective, then keep playing through the championship final.');
    } else {
      questions = bonusDecks[deckIndex];
      deckIndex += 1;
      activeModel = null;
      setText('hero-subtitle', 'Keep playing through sourced positions from the deciding game. Each move is revealed automatically; only the first round has a recorded GPT comparison.');
    }
    index = 0;
    answers = [];
    complete = false;
    render();
    scrollToNextBoard();
    board.children[0]?.focus({preventScroll:true});
  });
  chooser.addEventListener('change', () => {
    if (revealed || complete) return;
    const q = questions[index];
    selectedUci = q.legalMoves.some(m => m.uci === chooser.value) ? chooser.value : null;
    origin = null;
    updateChoice();
  });
  revealButton.addEventListener('click',reveal);
  if (mobileRevealButton) mobileRevealButton.addEventListener('click', advance);
  function advance() {
    if (!revealed || complete) return;
    if (index === questions.length - 1) finish();
    else { index++; render(); scrollToNextBoard(); board.children[0]?.focus({preventScroll:true}); }
  }
  nextButton.addEventListener('click', advance);
  get('challenge-restart').addEventListener('click',()=>{
    cancelCommit();completedResults[deckIndex] = null;answers = [];index = 0;complete = false;render();scrollToNextBoard();board.children[0]?.focus({preventScroll:true});
  });
  get('challenge-share').addEventListener('click',async () => {
    if (!complete) return;
    const score = scoreChallenge(questions,answers);
    const url = new URL('.', document.baseURI);url.hash='challenge';
    const text = challengeShareText(score.correct,url.href,questions.map((q,i) => q.answer.uci === answers[i]), activeModel?.complete ? {name:activeModel.name,score:activeModel.score} : null, {set:deckIndex + 1});
    try {
      if (navigator.share) {
        const title = 'Can you predict a grandmaster’s next move?';
        let shared = false;
        if (navigator.canShare && typeof File !== 'undefined') {
          try {
            const card = drawChallengeCard(score, questions.map((q,i) => q.answer.uci === answers[i]), activeModel?.complete ? activeModel.score : null, deckIndex + 1);
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
      const canvas = drawChallengeCard(scoreChallenge(questions,answers),questions.map((q,i) => q.answer.uci === answers[i]), activeModel?.complete ? activeModel.score : null, deckIndex + 1);
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
