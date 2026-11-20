/** Public chess dashboard. Historical moves are sourced; 2026 moves use Lichess PGN.
 * Browser API calls do not use credentials, trackers, cookies, or model inference.
 */
import {START_FEN,parseFen,play,toIndex,toSquare,withSans} from './src/chess.mjs';
import {replaySanMoves,parsePgn,findChampionshipGame,GAME_ONE_PGN} from './src/pgn.mjs';
import {restoreSnapshot,validateAppendOnly} from './src/broadcast.mjs';
import {validateRegistry,roundInfo} from './src/match-2026.mjs';
import {createSpectatorSession,spectatorOpportunity,spectatorOutcome,spectatorShareText} from './src/spectator.mjs';
import {validateObservation} from './src/collection.mjs';
import {restoreHistoricalMatch} from './src/history.mjs';
import {mountChallenge} from './src/challenge-ui.mjs';
const $=id=>document.getElementById(id);
const glyphs={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const pieceNames={K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn'};
const query=new URLSearchParams(location.search);
const requestedMode=query.get('mode');
let mode=requestedMode==='live'?'live':'archive',userChangedMode=requestedMode==='live'||requestedMode==='archive';
let matchData=null,modelRoster=null,collectionIndex=null,archive=null,archiveReplay=null,historicalGames=null,liveSnapshotAt=null;
const liveGames=new Map(),liveStatus=new Map();
let selectedGame=Number(query.get('game'))||(mode==='archive'?14:1);if(selectedGame<1||selectedGame>14)selectedGame=mode==='archive'?14:1;
let selectedPly=null,flipped=false,originSquare=null,guesses=new Map(),revealedPly=new Set(),selectedArrow=null;
let requestRunning=false,lastDirectAttempt=0,indexRequestRunning=false,lastIndexAttempt=0;
let spectatorStorage=null;
try{spectatorStorage=window.sessionStorage;}catch{/* Session storage can be blocked. */}
const spectatorSession=createSpectatorSession({storage:spectatorStorage});
let keyboardSquare=0,dragStart=null,suppressBoardClick=false;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(id,text)=>{$(id).textContent=String(text)};
const humanMoveLabel=(ply)=>`Move ${Math.floor(ply/2)+1}${ply%2===0?' (White)':' (Black)'}`;
const isArchive=()=>mode==='archive';

function game(){
  if(isArchive())return historicalGames?.[selectedGame-1]||(selectedGame===14?archiveReplay:null);
  return liveGames.get(selectedGame)||null;
}
function currentIndex(){const data=game();return Math.max(0,Math.min(selectedPly??data?.moves?.length??0,data?.moves?.length??0));}
/** A source-anchored live position or an explicitly pregame opening guess. */
function liveOpportunity(){
  const data=liveGames.get(selectedGame),ply=currentIndex();
  const status=liveStatus.get(selectedGame)||{};
  return {...spectatorOpportunity({
    game:selectedGame,ply,moveCount:data?.moves.length??0,
    at:new Date(Date.now()).toISOString(),
    sourceReady:Boolean(status.checkedAt),sourceError:Boolean(status.error),
    result:data?.tags?.Result??'*'
  }),fen:data?.positions?.[ply]||START_FEN,ply:ply+1};
}
function liveChoice(){return spectatorSession.find(selectedGame,currentIndex()+1);}
function liveOutcome(choice){return spectatorOutcome(choice,liveGames.get(choice.game));}
function focusNewSourceMove(gameNumber,previousCount,latestCount){
  if(mode!=='live'||selectedGame!==gameNumber||
      (selectedPly!==null&&selectedPly<previousCount))return;
  const resolved=spectatorSession.list().filter(x=>
    x.game===gameNumber&&x.ply>previousCount&&x.ply<=latestCount);
  // Land on a newly resolved choice first, rather than skipping its reveal.
  selectedPly=resolved.length?resolved.at(-1).ply-1:latestCount;
}
function selectIndex(n){
  selectedPly=Math.max(0,Math.min(n,game()?.moves?.length||0));
  originSquare=null;selectedArrow=null;syncUrl();render();
}
function syncUrl(){
  const url=new URL(location.href);
  url.searchParams.set('mode',mode);
  url.searchParams.set('game',String(selectedGame));
  if(selectedPly!==null)url.searchParams.set('ply',String(selectedPly));else url.searchParams.delete('ply');
  history.replaceState(null,'',url);
}
function switchMode(next,manual=true){
  mode=next;
  if(manual)userChangedMode=true;
  selectedGame=isArchive()?14:1;
  selectedPly=isArchive()?(archive?.highlightPly||1)-1:(liveGames.get(selectedGame)?.moves.length??0);
  originSquare=null;selectedArrow=null;guesses.clear();revealedPly.clear();
  syncUrl();render();
  if(!isArchive())void refreshBroadcast();
}
function arrowSvg(uci){
  if(!uci)return '';
  const s=toIndex(uci.slice(0,2)),e=toIndex(uci.slice(2,4));
  const center=index=>({x:((flipped?7-index%8:index%8)+.5)*12.5,y:((flipped?7-Math.floor(index/8):Math.floor(index/8))+.5)*12.5});
  const a=center(s),b=center(e),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
  const ex=b.x-dx/d*5.4,ey=b.y-dy/d*5.4;
  return `<svg class="arrow-overlay" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="move-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#b14f2f"/></marker></defs><path d="M${a.x} ${a.y} L${ex} ${ey}" fill="none" stroke="#b14f2f" stroke-width="1.65" stroke-linecap="round" marker-end="url(#move-arrow)"/></svg>`;
}
function drawBoard(fen,arrow,interactive){
  const state=parseFen(fen),board=$('board');
  const hadKeyboardFocus=board.contains(document.activeElement);
  board.replaceChildren();
  board.classList.toggle('interactive',interactive);
  const legal=interactive?withSans(fen):[];
  const targets=originSquare?legal.filter(x=>x.uci.startsWith(originSquare)).map(x=>x.uci.slice(2,4)):[];
  for(let pos=0;pos<64;pos++){
    const squareIndex=flipped?63-pos:pos,row=Math.floor(pos/8),col=pos%8,square=toSquare(squareIndex);
    const cell=document.createElement('button');cell.type='button';cell.className=`square ${(row+col)%2?'dark':'light'}`;
    cell.dataset.square=square;cell.dataset.visual=String(pos);
    cell.tabIndex=pos===keyboardSquare?0:-1;
    const piece=state.board[squareIndex];
    cell.setAttribute('aria-label',`${square}${piece==='.'?' empty':` ${piece===piece.toUpperCase()?'white':'black'} ${pieceNames[piece.toUpperCase()]}`}`);
    cell.disabled=!interactive;
    if(originSquare===square)cell.classList.add('selected-origin');
    if(targets.includes(square))cell.classList.add('legal-target');
    if(arrow&&(arrow.slice(0,2)===square||arrow.slice(2,4)===square))cell.classList.add('highlight');
    if(piece!=='.'){
      const el=document.createElement('span');el.className=`piece ${piece===piece.toUpperCase()?'white':'black'}`;el.textContent=glyphs[piece];el.setAttribute('aria-hidden','true');cell.append(el);
    }
    if(row===7){const label=document.createElement('span');label.className='square-label file';label.textContent=square[0];cell.append(label);}
    if(col===0){const label=document.createElement('span');label.className='square-label rank';label.textContent=square[1];cell.append(label);}
    if(interactive)cell.addEventListener('click',()=>{
      if(!suppressBoardClick)boardClick(square,legal);
    });
    board.append(cell);
  }
  board.setAttribute('aria-label',`Position after ${currentIndex()} plies. ${state.side==='w'?'White':'Black'} to move.`);
  board.insertAdjacentHTML('beforeend',arrowSvg(arrow));
  if(hadKeyboardFocus&&interactive)
    board.querySelector(`button.square[data-visual="${keyboardSquare}"]`)?.focus({preventScroll:true});
}
function boardClick(square,legal){
  const i=currentIndex();
  if(isArchive()){
    if(!game()||i>=game().moves.length||revealedPly.has(i))return;
  }else if(!liveOpportunity().enabled||liveChoice())return;
  const fromChoices=originSquare?legal.filter(m=>
    m.uci.startsWith(originSquare)&&m.uci.slice(2,4)===square):[];
  if(fromChoices.length){
    const selected=fromChoices.find(m=>m.uci.length===4)||
      fromChoices.find(m=>m.uci.endsWith('q'))||fromChoices[0];
    originSquare=null;selectedArrow=selected.uci;
    if(!isArchive())lockLiveChoice(selected.uci);
    else{$('guess-select').value=selected.uci;render();}
    return;
  }
  originSquare=legal.some(m=>m.uci.startsWith(square))?square:null;
  selectedArrow=null;render();
}
/** One legal board move immediately records a per-tab, non-editable guess. */
function lockLiveChoice(uci){
  if(isArchive())return;
  const chance=liveOpportunity();
  if(!chance.enabled||liveChoice())return;
  try{
    spectatorSession.lock({game:selectedGame,ply:chance.ply,fen:chance.fen,uci});
    originSquare=null;selectedArrow=null;
    render();
  }catch(error){
    console.warn('Local prediction could not be locked:',error);
    setText('spectator-message','The prediction was not saved. Try the move list.');
  }
}
function renderPlayerNames(data){
  const white=data?.tags?.White||(isArchive()?archive?.white:'White player');
  const black=data?.tags?.Black||(isArchive()?archive?.black:'Black player');
  setText('top-player',flipped?white:black);setText('top-side',flipped?'WHITE':'BLACK');
  setText('bottom-player',flipped?black:white);setText('bottom-side',flipped?'BLACK':'WHITE');
}
function resultSummary(title,text){
  $('result-summary').innerHTML=`<span class="result-icon">◎</span><div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></div>`;
}
function decisionRow({label,subtitle,move,san,status,id,actual=false,matched=false}){
  return `<div class="decision ${actual?'played':''}" data-prediction="${escapeHtml(id||'')}" role="listitem"><span class="decision-badge ${actual?'actual':''}">${actual?'H':'M'}</span><span class="decision-info"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(subtitle)}</small></span><span class="decision-uci">${escapeHtml(san||move||'—')}</span><span class="decision-status ${matched?'hit':''}">${escapeHtml(status||'')}</span></div>`;
}
function setSourceStatus(){
  const a=$('source-url'),refresh=$('refresh-button');
  if(isArchive()){
    $('source-light').classList.add('connected');
    const selected=game();
    setText('source-status',selected?`Verified 2024 championship · Game ${selectedGame}/14 · ${selected.moves.length} half-moves · ${selected.date||'2024'}`:'Loading historical game…');
    a.href=selected?.source||archive?.source||'https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D';a.textContent='View original game ↗';refresh.hidden=true;
    return;
  }
  const round=roundInfo(selectedGame),data=game(),state=liveStatus.get(selectedGame)||{};
  const checked=state.checkedAt,error=state.error;
  a.href=round.url;a.textContent=`Official Game ${selectedGame} broadcast ↗`;refresh.hidden=false;
  $('source-light').classList.toggle('connected',Boolean(checked&&!error)||Boolean(data?.moves.length));
  if(error&&data?.moves.length)setText('source-status',`Game ${selectedGame} · ${data.moves.length} recorded moves · direct refresh unavailable · timing unverified`);
  else if(error)setText('source-status',`Game ${selectedGame} broadcast unavailable. Source is registered; retry later.`);
  else if(checked)setText('source-status',`Game ${selectedGame} · ${data?.moves.length||0} moves observed · checked ${checked.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'})} · not physical move times`);
  else if(selectedGame===1&&liveSnapshotAt)setText('source-status',`Game 1 · ${data?.moves.length||0} cached moves · checked ${liveSnapshotAt.toLocaleString()} · feed timing only`);
  else setText('source-status',`Game ${selectedGame} · broadcast scheduled ${new Date(round.startsAt).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}`);
}

function renderArchive(){
  const data=game();
  if(!data){
    setText('result-title','Preparing the archive');setText('result-description','Loading the recorded game.');$('decision-list').replaceChildren();$('guess-area').hidden=true;return;
  }
  const i=currentIndex(),next=data.moves[i]||null,prior=i?data.moves[i-1]:null;
  const revealed=revealedPly.has(i),guess=guesses.get(i)||null;
  $('guess-area').hidden=!next||revealed;
  $('reveal-button').hidden=false;
  $('decision-list').hidden=false;
  $('spectator-panel').hidden=true;
  setText('position-kicker','SINGAPORE · WORLD CHAMPIONSHIP 2024');
  setText('position-name',selectedGame===14&&i===108?'The move that changed history':`Game ${selectedGame} · ${humanMoveLabel(i)}`);
  setText('result-heading','PLAY THE HUMAN');setText('status-indicator','HISTORICAL · VERIFIED');
  const player=i%2===0?data.tags.White:data.tags.Black;
  setText('result-title',next?`What did ${player.split(' ')[0]} play?`:'The game is complete.');
  setText('result-description',next?'Choose a legal move and reveal the actual recorded choice. The same source is available move by move for all 14 games.':`Game ${selectedGame} finished ${data.tags.Result}. Navigate to replay its recorded positions.`);
  const rows=[];
  if(guess){
    const san=withSans(data.positions[i]).find(x=>x.uci===guess)?.san||guess;
    rows.push(decisionRow({label:'Your predicted move',subtitle:'Your local, retrospective guess',move:guess,san,status:revealed?(guess===next?.uci?'MATCH':'OTHER'):'LOCKED',id:'you',matched:revealed&&guess===next?.uci}));
  }
  if(next&&revealed)rows.push(decisionRow({label:player,subtitle:'Grandmaster’s recorded choice · 2024',move:next.uci,san:next.san,status:'PLAYED',actual:true}));
  if(!rows.length&&prior)rows.push(decisionRow({label:'Last recorded move',subtitle:'Move already played · navigate to continue',move:prior.uci,san:prior.san,status:'HISTORY',actual:true}));
  $('decision-list').innerHTML=rows.length?rows.join(''):'<div class="empty-row"><strong>A real grandmaster decision awaits.</strong><p>Select the move you expect. The actual choice stays concealed until you reveal it.</p></div>';
  const moveOptions=next?withSans(data.positions[i]).sort((a,b)=>a.san.localeCompare(b.san)):[];
  const select=$('guess-select');
  select.innerHTML='<option value="">Select a legal move…</option>'+moveOptions.map(x=>`<option value="${x.uci}">${escapeHtml(x.san)} · ${x.uci}</option>`).join('');
  if(selectedArrow&&moveOptions.some(x=>x.uci===selectedArrow))select.value=selectedArrow;
  else if(guess)select.value=guess;
  $('guess-button').disabled=!select.value||Boolean(guess);
  $('reveal-button').disabled=!next;
  $('reveal-button').textContent=guess?'Reveal the move →':'Skip prediction · reveal move →';
  const stats=Array.from(guesses).filter(([ply])=>revealedPly.has(ply)),matched=stats.filter(([ply,uci])=>data.moves[ply]?.uci===uci).length;
  $('score-line').hidden=!stats.length;setText('score-line',`${matched} exact matches in ${stats.length} revealed predictions · local session, not a model benchmark`);
  if(revealed){
    const matchedThis=guess===next?.uci;
    resultSummary(selectedGame===14&&next?.san=== 'Rf2'&&i===108?'The deciding mistake: 55.Rf2':matchedThis?'An exact prediction.':'The grandmaster chose '+next?.san,
      selectedGame===14&&i===108?'Ding’s rook exchange lost the drawn ending. The historical broadcast records 55.Rf2; independent analysis is linked in the source.':guess?(matchedThis?'Your guess matches the recorded move.':'An alternative legal move is not necessarily an inferior chess move.'):'This historical observation is recorded, not a live forecast.');
  }else resultSummary('The actual move is concealed.','Predict first, reveal second. In this archive the outcome is historical and already public.');
  setText('trace-text',`Historical moves: Lichess Game ${selectedGame} (${data.date}). Full match cross-checked against PGN Mentor. This is not a prospective model forecast.`);
  setText('bottom-source',`2024 MATCH · GAME ${selectedGame}/14 · VERIFIED SOURCE PGN`);
  drawBoard(data.positions[i],revealed?next?.uci:selectedArrow,Boolean(next&&!revealed));
}
function renderModelRoster(){
  const models=modelRoster?.models||[];
  const attempts=collectionIndex?.attempts||[];
  const unresolved=(collectionIndex?.reservations||[]).filter(x=>x.status==='unresolved');
  setText('model-attempt-total',attempts.length);
  if(modelRoster?.verifiedOn)setText('roster-date','PROVIDER IDS CHECKED '+modelRoster.verifiedOn);
  const grid=$('model-grid');
  if(!models.length){grid.textContent='The versioned model roster is currently unavailable.';return;}
  grid.innerHTML=models.map((m,i)=>{
    const record=attempts.filter(x=>x.model?.id===m.id);
    const pending=unresolved.filter(x=>x.model?.id===m.id);
    const completed=record.length?`${record.length} recorded API attempt${record.length===1?'':'s'}`:'No published call yet';
    const caption=pending.length?`${completed} · ${pending.length} unresolved reservation${pending.length===1?'':'s'}`:completed;
    return `<article class="model-card"><div class="model-card-meta"><span>${escapeHtml(m.provider.toUpperCase())}</span><span>0${i+1} / ${String(models.length).padStart(2,'0')}</span></div><h3>${escapeHtml(m.name)}</h3><div class="model-card-version">${escapeHtml(m.version)}</div><div class="model-card-foot"><span class="model-card-count">${escapeHtml(caption)}</span><a href="${escapeHtml(m.source)}" target="_blank" rel="noopener noreferrer">Official model docs ↗</a></div></article>`;
  }).join('');
}
function renderLive(){
  const data=game(),i=currentIndex(),before=data?.positions[i]||START_FEN;
  const observation=data?.moves[i]||null;
  const latest=Boolean(data?.moves.length&&i===data.moves.length);
  const lastMove=latest?data.moves.at(-1):null;
  const shownMove=observation||lastMove;
  const shownMoveLabel=shownMove?`${Math.ceil(shownMove.ply/2)}${shownMove.ply%2?'.':'…'}${shownMove.san}`:'';
  const relevant=matchData?.games?.find(x=>x.game===selectedGame);
  const forecastList=(relevant?.forecasts||[]).filter(f=>f.ply===i+1&&f.fen===before);
  const modelAttempts=(collectionIndex?.attempts||[]).filter(a=>a.game===selectedGame&&a.ply===i+1&&a.fen===before);
  const chance=liveOpportunity(),choice=liveChoice();
  const outcome=choice?liveOutcome(choice):null;
  const playable=chance.enabled&&!choice;
  const unresolved=(collectionIndex?.reservations||[]).filter(r=>r.game===selectedGame&&
    r.ply===i+1&&r.fen===before&&r.status==='unresolved');
  setText('position-kicker','GENEVA · WORLD CHAMPIONSHIP 2026');
  setText('position-name',data?.moves.length?`Game ${String(selectedGame).padStart(2,'0')} · ${i} moves played`:`Game ${String(selectedGame).padStart(2,'0')} · opening position`);
  setText('result-heading','CHAMPIONSHIP DECISIONS');
  setText('status-indicator',data?.moves.length?'SOURCED MOVES':'AWAITING PLAY');
  setText('result-title',shownMove?`Broadcast move · ${shownMoveLabel}`:(forecastList.length||modelAttempts.length)?'Forecast attempts recorded · timing not verified.':unresolved.length?'Request reserved · response not published.':'No verified model forecasts yet.');
  setText('result-description',latest?'The board displays the newest move available from the broadcast. Navigate back to inspect earlier decisions. Source-observation time differs from physical move time.':data?.moves.length?'The board is reconstructed from Lichess PGN. Model forecasts remain timing-unverified until separately corroborated.':`Game ${selectedGame} starts ${new Date(roundInfo(selectedGame).startsAt).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}. No moves have been observed for this round.`);
  const rows=forecastList.map(f=>{
    const san=withSans(before).find(x=>x.uci===f.prediction.uci)?.san||f.prediction.uci;
    return decisionRow({label:f.model.id,subtitle:`${f.model.version} · operator-submitted / timing unverified`,san,move:f.prediction.uci,id:f.model.id,status:observation?(observation.uci===f.prediction.uci?'MATCH':'OTHER'):'FORECAST',matched:Boolean(observation&&observation.uci===f.prediction.uci)});
  });
  for(const a of modelAttempts){
    const move=a.status==='valid'?withSans(before).find(x=>x.uci===a.predictedUci):null;
    rows.push(decisionRow({label:a.model.name||a.model.id,subtitle:`${a.model.version} · operator-recorded response · physical pre-move timing unverified`,san:move?.san||'—',move:a.predictedUci||null,id:a.model.id,status:a.status==='valid'?(a.comparison?(a.comparison.exact?'MATCH*':'OTHER*'):'RECORDED'):a.status==='invalid'?'INVALID':'FAILED'}));
  }
  if(choice){
    const yours=withSans(choice.fen).find(x=>x.uci===choice.uci);
    rows.unshift(decisionRow({label:'Your local move',subtitle:'Recreational, unverified local timestamp',
      san:yours?.san||choice.uci,move:choice.uci,id:'spectator',matched:outcome.kind==='match',
      status:outcome.kind==='match'?'MATCH':outcome.kind==='different'?'OTHER':
        outcome.kind==='source-conflict'?'CONFLICT':'LOCKED'}));
  }
  if(shownMove)rows.push(decisionRow({label:shownMove.ply%2===1?(data.tags.White||'White player'):(data.tags.Black||'Black player'),subtitle:latest?'Latest available move · Lichess broadcast':'Observed move · Lichess broadcast',san:shownMove.san,move:shownMove.uci,actual:true,status:latest?'LATEST':'PLAYED'}));
  $('decision-list').hidden=!rows.length&&chance.enabled;
  $('decision-list').innerHTML=rows.length?rows.join(''):'<div class="empty-row"><strong>Results have to be earned.</strong><p>Model comparisons appear only after real responses have been recorded and matched to a sourced chess position.</p></div>';
  $('guess-area').hidden=true;$('score-line').hidden=true;
  if(shownMove)resultSummary('Observed, not predicted.','The source identifies the played move. Its exact real-world playing time is not established by the moment the PGN was fetched.');
  else if(forecastList.length||modelAttempts.length)resultSummary('Submitted forecasts are provisional.','Displayed records have locally checked content. Public pre-move chronology and provider origin are still separate checks.');
  else if(unresolved.length)resultSummary('Reserved; no response recorded.','A request slot was published before inference. Its outcome is missing and this request will not be repeated automatically. No model prediction has been established.');
  else resultSummary('No manufactured leaderboard.','Public prediction accuracy is withheld until real provider responses, sourced moves, and credible pre-move publication evidence are available.');
  setText('trace-text',`Source: Lichess Game ${selectedGame}, round ${roundInfo(selectedGame).roundId}. Public feed observations are not physical move timestamps.`);
  setText('bottom-source','2026 MATCH · LICHESS PGN · NO VERIFIED MODEL SCORES');

  // Spectator guesses are local, unsigned, and excluded from the provider ledger.
  $('reveal-button').hidden=true;
  $('guess-area').hidden=!playable;
  $('spectator-panel').hidden=false;
  const legal=playable?withSans(chance.fen).sort((a,b)=>a.san.localeCompare(b.san)):[];
  const select=$('guess-select');
  select.innerHTML='<option value="">Choose a legal move…</option>'+
    legal.map(move=>`<option value="${move.uci}">${escapeHtml(move.san)} · ${move.uci}</option>`).join('');
  if(selectedArrow&&legal.some(m=>m.uci===selectedArrow))select.value=selectedArrow;
  $('guess-button').disabled=!select.value;
  $('guess-button').textContent='Lock this move';
  setText('spectator-guess-label',chance.kind==='opening'?
    'YOUR OPENING GUESS':'YOUR NEXT-MOVE GUESS');
  const all=spectatorSession.list().filter(c=>c.game===selectedGame);
  const complete=all.map(c=>liveOutcome(c)).filter(o=>['match','different'].includes(o.kind));
  const matched=complete.filter(o=>o.kind==='match').length;
  const pending=all.filter(c=>liveOutcome(c).kind==='pending').length;
  setText('spectator-stats',`${matched} matched / ${complete.length} resolved · ${pending} waiting · local to this tab`);
  $('spectator-share').hidden=!choice;
  $('spectator-next').hidden=!(choice&&outcome&&['match','different'].includes(outcome.kind)&&
    i<(data?.moves.length||0));
  if(choice){
    const san=withSans(choice.fen).find(x=>x.uci===choice.uci)?.san||choice.uci;
    const resultLabel=outcome.kind==='match'?'Exact match.':
      outcome.kind==='different'?`Grandmaster played ${outcome.actualSan}.`:
      outcome.kind==='source-conflict'?'Source history differs.':'Prediction locked.';
    const resultDetail=outcome.kind==='pending'?
      'Waiting for the next official Lichess move. Your move is locked in this tab.':
      outcome.kind==='source-conflict'?
      'The broadcast position disagrees with the recorded FEN. No result is scored.':
      'Compared against the sourced broadcast move. This local prediction has no independent timing proof.';
    setText('spectator-phase',outcome.kind==='pending'?'AWAITING THE BROADCAST':'REVEALED BY THE FEED');
    setText('spectator-message',`${san} · ${resultLabel}`);
    setText('spectator-detail',resultDetail);
    if(outcome.kind==='match'||outcome.kind==='different'){
      resultSummary(outcome.kind==='match'?'You anticipated the move.':'The grandmaster chose differently.',
        'A local spectator result, not a certified prospective claim or model benchmark.');
    }else if(outcome.kind==='source-conflict'){
      resultSummary('Local source conflict.','The saved guess is preserved, but this position cannot be scored.');
    }else{
      resultSummary('Your move is locked.','This tab will check the next validated broadcast move. The local clock is not evidence of physical move timing.');
    }
  }else{
    const pregame=chance.kind==='opening';
    setText('spectator-phase',pregame?'PREGAME · OPENING MOVE':
      chance.enabled?'LIVE · YOUR MOVE':'BROADCAST STATUS');
    setText('spectator-message',pregame?'How will White open?':
      chance.enabled?'What would you play here?':
      chance.kind==='history'?'Return to the latest position to predict.':
      'The next-move challenge is not open yet.');
    setText('spectator-detail',pregame?
      'Pick White’s first legal move before Game 1. Player colors await the official game feed.':
      chance.enabled?'Tap a piece, then its destination to lock your answer. A move list is available below.':
      'Browse the official moves or play the 2024 challenge. An unverified or finished game is never presented as live.');
  }
  if(spectatorSession.warning)
    setText('spectator-storage-note',spectatorSession.warning);
  else setText('spectator-storage-note','No account, analytics or model API calls. Local device time is not independently verified.');
  drawBoard(before,choice?.uci||selectedArrow||shownMove?.uci||null,playable);
}
function render(){
  renderModelRoster();
  const historical=isArchive(),data=game(),i=currentIndex();
  document.body.dataset.mode=mode;
  setText('lab-title',historical?'Behind the moves.':'Your next move.');
  setText('lab-subtitle',historical?
    'Replay the 2024 championship and inspect the sourced 2026 model experiment.':
    'Choose a legal move, lock your local prediction, then follow the official World Championship broadcast.');
  $('tab-live').classList.toggle('active',!historical);$('tab-archive').classList.toggle('active',historical);
  $('tab-live').setAttribute('aria-pressed',String(!historical));$('tab-archive').setAttribute('aria-pressed',String(historical));
  $('game-select').disabled=historical&&!historicalGames;$('game-select').value=String(selectedGame);
  setSourceStatus();
  const fen=data?.positions[i]||START_FEN,state=parseFen(fen);
  renderPlayerNames(data);
  setText('side-to-move',state.side==='w'?'WHITE TO MOVE':'BLACK TO MOVE');setText('move-count',`MOVE ${state.fullmove}${state.side==='b'?'…':''}`);
  if(historical)renderArchive();else renderLive();
  setText('nav-position',`${i} / ${data?.moves.length||0} PLIES`);
  $('nav-start').disabled=i<=0;$('nav-back').disabled=i<=0;
  $('nav-next').disabled=i>=(data?.moves.length||0);$('nav-end').disabled=i>=(data?.moves.length||0);
  setText('board-context',historical?'2024 match · use the board to make your guess · ◀ ▶ to replay':
    '2026 · Play a legal move to lock a local guess. Use ◀ ▶ to inspect received broadcast moves.');
}

function recordGuess(){
  if(!isArchive()){lockLiveChoice($('guess-select').value);return;}
  const data=game();
  if(!data)return;
  const i=currentIndex(),uci=$('guess-select').value;
  if(i>=data.moves.length||revealedPly.has(i)||guesses.has(i))return;
  if(!withSans(data.positions[i]).some(m=>m.uci===uci))return;
  guesses.set(i,uci);selectedArrow=uci;render();
}
function revealMove(){if(!isArchive()||!game()?.moves[currentIndex()])return;revealedPly.add(currentIndex());selectedArrow=null;originSquare=null;render();}

/** Retrieve the specific selected round; never infer the round from its ordinal URL.
 * Another user selection during the request must not redirect its result.
 */
async function refreshBroadcast(){
  if(requestRunning||isArchive())return;
  const targetGame=selectedGame,round=roundInfo(targetGame);
  requestRunning=true;lastDirectAttempt=Date.now();$('refresh-button').disabled=true;
  try{
    const response=await fetch(round.pgnUrl,{headers:{Accept:'application/x-chess-pgn'},cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const games=parsePgn(await response.text());
    const current=findChampionshipGame(games),previous=liveGames.get(targetGame);
    if(!current&&games.some(g=>g.moves.length))throw new Error('Unexpected player identities in broadcast');
    if(previous?.moves.length&&!current)throw new Error('Broadcast omitted previously observed moves');
    validateAppendOnly(previous,current);
    const latest=current||{tags:{},moves:[],positions:[START_FEN]};
    const before=previous?.moves.length||0;
    liveGames.set(targetGame,latest);liveStatus.set(targetGame,{checkedAt:new Date(),error:null});
    if(!userChangedMode&&latest.moves.length&&mode==='archive'){switchMode('live',false);}
    if(mode==='live'&&selectedGame===targetGame)focusNewSourceMove(targetGame,before,latest.moves.length);
  }catch(error){
    liveStatus.set(targetGame,{checkedAt:null,error:error instanceof Error?error.message:'unavailable'});
    console.warn('Lichess broadcast fetch failed:',error);
  }finally{requestRunning=false;$('refresh-button').disabled=false;render();}
}

/** Restore locally observed source positions as an outage fallback.
 * The observation file does not contain verified player colors or results.
 */
function applyPublishedObservations(index){
  for(const row of index.observedGames||[]){
    const record={schema:'observed-feed-v1',event:index.event,game:row.game,source:row.source,moves:row.moves};
    validateObservation(record);
    const previous=liveGames.get(row.game);
    if(previous?.moves.length>=row.moves.length)continue;
    let fen=START_FEN;
    const moves=[],positions=[fen];
    for(const m of row.moves){
      const played=play(fen,m.uci);
      moves.push({ply:m.ply,uci:m.uci,san:played.san,fenBefore:fen,fenAfter:played.fen});
      fen=played.fen;positions.push(fen);
    }
    if(previous)validateAppendOnly(previous,{moves});
    liveGames.set(row.game,{tags:{White:'White player',Black:'Black player',Result:'*'},moves,positions});
    focusNewSourceMove(row.game,previous?.moves.length||0,moves.length);
  }
}

/** Refresh the published attempt index independently of the PGN broadcast.
 * A site visitor staying on the live board sees new public model calls without
 * reloading. Failed requests preserve the last validated index.
 */
async function refreshPublishedIndex(){
  if(indexRequestRunning)return;
  indexRequestRunning=true;lastIndexAttempt=Date.now();
  try{
    const response=await fetch('./data/collection.json',{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const updated=await response.json();
    if(updated?.schema!=='collection-index-v1'||!Array.isArray(updated.attempts)||!Array.isArray(updated.observedMoves)||updated.source!==GAME_ONE_PGN)throw new Error('Unrecognized published evidence');
    if(updated.attempts.length>2000)throw new Error('Unexpected attempt count');
    if(updated.reservations!==undefined&&(!Array.isArray(updated.reservations)||updated.reservations.length>10000))
      throw new Error('Unexpected reservation evidence');
    const registered=new Set((modelRoster?.models||[]).map(m=>m.id));
    if(updated.attempts.some(a=>!registered.has(a.model?.id))||
       (updated.reservations||[]).some(c=>!registered.has(c.model?.id)||
         !['completed','unresolved'].includes(c.status)))
      throw new Error('Unregistered or invalid model record in public index');
    applyPublishedObservations(updated);
    collectionIndex=updated;
    if(mode==='live')render();
  }catch(error){console.warn('Public evidence refresh unavailable:',error);}
  finally{indexRequestRunning=false;}
}
for(let g=1;g<=14;g++){const o=document.createElement('option');o.value=String(g);o.textContent=String(g).padStart(2,'0');$('game-select').append(o);}
$('game-select').addEventListener('change',e=>{selectedGame=Number(e.target.value);selectedPly=isArchive()?0:(liveGames.get(selectedGame)?.moves.length||0);guesses.clear();revealedPly.clear();originSquare=null;selectedArrow=null;syncUrl();render();if(!isArchive())void refreshBroadcast();});
$('tab-live').addEventListener('click',()=>switchMode('live'));
$('tab-archive').addEventListener('click',()=>switchMode('archive'));
$('flip-button').addEventListener('click',()=>{flipped=!flipped;render();});
$('nav-start').addEventListener('click',()=>selectIndex(0));
$('nav-back').addEventListener('click',()=>selectIndex(currentIndex()-1));
$('nav-next').addEventListener('click',()=>selectIndex(currentIndex()+1));
$('nav-end').addEventListener('click',()=>selectIndex(game()?.moves.length||0));
$('guess-select').addEventListener('change',e=>{selectedArrow=e.target.value||null;originSquare=null;render();});
$('guess-button').addEventListener('click',recordGuess);
$('reveal-button').addEventListener('click',revealMove);
$('spectator-next').addEventListener('click',()=>selectIndex(game()?.moves.length||0));
$('spectator-share').addEventListener('click',async()=>{
  const choice=liveChoice();if(!choice)return;
  $('spectator-share-text').hidden=true;
  setText('spectator-share-status','');
  const text=spectatorShareText(choice,liveOutcome(choice));
  try{
    if(navigator.share)await navigator.share({text});
    else if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
    else throw new Error('Clipboard unavailable');
    setText('spectator-share-status','Your local result was shared or copied.');
  }catch{
    $('spectator-share-text').value=text;
    $('spectator-share-text').hidden=false;
    setText('spectator-share-status','Copy your local result from the text field.');
  }
});
// Arrow-key board navigation preserves a single keyboard tab stop.
$('board').addEventListener('keydown',event=>{
  const cell=event.target.closest('button.square');
  if(!cell||!['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(event.key))return;
  const current=Number(cell.dataset.visual),row=Math.floor(current/8),col=current%8;
  const target=event.key==='ArrowRight'&&col<7?current+1:
    event.key==='ArrowLeft'&&col>0?current-1:
    event.key==='ArrowUp'&&row>0?current-8:
    event.key==='ArrowDown'&&row<7?current+8:current;
  event.preventDefault();
  keyboardSquare=target;
  for(const square of $('board').querySelectorAll('button.square'))
    square.tabIndex=Number(square.dataset.visual)===target?0:-1;
  $('board').querySelector(`button.square[data-visual="${target}"]`)?.focus();
});
// Touch/pen/mouse drag selects exactly one legal move, using the same lock path
// as the tap and keyboard interfaces. No promotion is guessed beyond a queen.
$('board').addEventListener('pointerdown',event=>{
  const cell=event.target.closest('button.square');
  if(!cell||cell.disabled){dragStart=null;return;}
  dragStart={square:cell.dataset.square,x:event.clientX,y:event.clientY};
});
$('board').addEventListener('pointerup',event=>{
  const start=dragStart;dragStart=null;
  if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)<9)return;
  const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('#board button.square');
  if(!target||target.disabled)return;
  const fen=game()?.positions?.[currentIndex()]||START_FEN;
  const candidates=withSans(fen).filter(m=>m.uci.startsWith(start.square)&&
    m.uci.slice(2,4)===target.dataset.square);
  const chosen=candidates.find(m=>m.uci.length===4)||
    candidates.find(m=>m.uci.endsWith('q'))||candidates[0];
  if(!chosen)return;
  suppressBoardClick=true;
  if(isArchive()){
    selectedArrow=chosen.uci;originSquare=null;render();
  }else lockLiveChoice(chosen.uci);
  window.setTimeout(()=>{suppressBoardClick=false;},0);
});
$('refresh-button').addEventListener('click',refreshBroadcast);
$('share-button').addEventListener('click',async()=>{
  syncUrl();try{await navigator.clipboard.writeText(location.href);setText('share-button','Link copied ✓');}
  catch{window.prompt('Copy this link',location.href);}
  setTimeout(()=>setText('share-button','Share position ↗'),1800);
});
window.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement?.tagName))return;
  if(e.key==='ArrowLeft'){e.preventDefault();selectIndex(currentIndex()-1);}
  if(e.key==='ArrowRight'){e.preventDefault();selectIndex(currentIndex()+1);}
});
async function initialize(){
  try{
    const [historical,history,ledger,cached,roster,collection,roundRegistry]=await Promise.all([
      fetch('./data/archive-2024.json').then(r=>{if(!r.ok)throw Error(`archive HTTP ${r.status}`);return r.json();}),
      fetch('./data/championship-2024.json').then(r=>{if(!r.ok)throw Error(`historical match HTTP ${r.status}`);return r.json();}),
      fetch('./data/match.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`ledger HTTP ${r.status}`);return r.json();}),
      fetch('./data/live-game1.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`snapshot HTTP ${r.status}`);return r.json();}).catch(error=>{console.warn('Optional broadcast cache unavailable:',error);return null;}),
      fetch('./data/models.json').then(r=>{if(!r.ok)throw Error(`roster HTTP ${r.status}`);return r.json();}),
      fetch('./data/collection.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`collection HTTP ${r.status}`);return r.json();}),
      fetch('./data/broadcast-2026.json').then(r=>{if(!r.ok)throw Error(`broadcast registry HTTP ${r.status}`);return r.json();}),
    ]);
    if(historical.schema!=='historical-game-v1'||ledger.schema!=='match-v1'||roster.schema!=='model-roster-v1'||collection.schema!=='collection-index-v1')throw new Error('Unexpected data schema');
    validateRegistry(roundRegistry);
    const replay=replaySanMoves(historical.moves.trim().split(/\s+/));
    if(replay.moves.length!==116||replay.moves[108].san!=='Rf2')throw new Error('Unexpected archive moves');
    historicalGames=restoreHistoricalMatch(history);
    if(historicalGames[13].moves.some((move,index)=>move.uci!==replay.moves[index]?.uci))throw Error('Game 14 differs from original challenge');
    archive=historical;archiveReplay=replay;matchData=ledger;modelRoster=roster;collectionIndex=collection;
    applyPublishedObservations(collection);
    if ($('challenge-board')) mountChallenge(historical,replay);
    if(cached){
      try{const snap=restoreSnapshot(cached);if(snap){validateAppendOnly(liveGames.get(1),snap);if((liveGames.get(1)?.moves.length||0)<=snap.moves.length)liveGames.set(1,snap);}liveSnapshotAt=cached.fetchedAt?new Date(cached.fetchedAt):null;}
      catch(error){console.warn('Broadcast cache rejected:',error);}
    }
    const deepPly=Number(query.get('ply'));
    selectedPly=query.has('ply')&&Number.isInteger(deepPly)&&deepPly>=0?deepPly:isArchive()?(selectedGame===14?historical.highlightPly-1:0):(liveGames.get(selectedGame)?.moves.length||0);
    if(!userChangedMode&&Array.from(liveGames.values()).some(x=>x.moves.length)&&mode==='archive')switchMode('live',false);
  }catch(error){
    console.error('Cannot load recorded data:',error);
    setText('source-status','The game data could not be loaded. Refresh, or serve this site using a local web server.');
  }
  render();if(mode==='live')await refreshBroadcast();
}
render();initialize();
// Avoid polling Lichess for spectators of the offline archive. Active live viewers
// check at most every three minutes, or every five minutes after a failed request.
setInterval(()=>{
  const interval=liveStatus.get(selectedGame)?.error?300000:180000;
  if(!document.hidden&&mode==='live'){
    if(!indexRequestRunning&&Date.now()-lastIndexAttempt>=120000)refreshPublishedIndex();
    if(!requestRunning&&Date.now()-lastDirectAttempt>=interval)refreshBroadcast();
  }
},60000);
