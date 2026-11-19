/** Public chess dashboard. Historical moves are sourced; 2026 moves use Lichess PGN.
 * Browser API calls do not use credentials, trackers, cookies, or model inference.
 */
import {START_FEN,parseFen,play,toIndex,toSquare,withSans} from './src/chess.mjs';
import {replaySanMoves,parsePgn,findChampionshipGame,GAME_ONE_BROADCAST,GAME_ONE_PGN} from './src/pgn.mjs';
import {restoreSnapshot,validateAppendOnly} from './src/broadcast.mjs';
const $=id=>document.getElementById(id);
const glyphs={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const pieceNames={K:'king',Q:'queen',R:'rook',B:'bishop',N:'knight',P:'pawn'};
const query=new URLSearchParams(location.search);
const requestedMode=query.get('mode');
let mode=requestedMode==='live'?'live':'archive',userChangedMode=requestedMode==='live'||requestedMode==='archive';
let matchData=null,modelRoster=null,collectionIndex=null,archive=null,archiveReplay=null,liveGame=null,liveCheckedAt=null,liveSnapshotAt=null,liveError=null;
let selectedGame=Number(query.get('game'))||1;if(selectedGame<1||selectedGame>14)selectedGame=1;
let selectedPly=null,flipped=false,originSquare=null,guesses=new Map(),revealedPly=new Set(),selectedArrow=null;
let requestRunning=false,lastDirectAttempt=0;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const setText=(id,text)=>{$(id).textContent=String(text)};
const humanMoveLabel=(ply)=>`Move ${Math.floor(ply/2)+1}${ply%2===0?' (White)':' (Black)'}`;
const isArchive=()=>mode==='archive';

function game(){
  if(isArchive())return archiveReplay;
  return selectedGame===1?liveGame:null;
}
function currentIndex(){const data=game();return Math.max(0,Math.min(selectedPly??data?.moves?.length??0,data?.moves?.length??0));}
function selectIndex(n){
  selectedPly=Math.max(0,Math.min(n,game()?.moves?.length||0));
  originSquare=null;selectedArrow=null;syncUrl();render();
}
function syncUrl(){
  const url=new URL(location.href);
  url.searchParams.set('mode',mode);
  if(!isArchive())url.searchParams.set('game',String(selectedGame));else url.searchParams.delete('game');
  if(selectedPly!==null)url.searchParams.set('ply',String(selectedPly));else url.searchParams.delete('ply');
  history.replaceState(null,'',url);
}
function switchMode(next,manual=true){
  mode=next;
  if(manual)userChangedMode=true;
  selectedPly=isArchive()?(archive?.highlightPly||1)-1:(liveGame?.moves.length??0);
  originSquare=null;selectedArrow=null;
  syncUrl();render();
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
  const state=parseFen(fen),board=$('board');board.replaceChildren();
  board.classList.toggle('interactive',interactive);
  const legal=interactive?withSans(fen):[];
  const targets=originSquare?legal.filter(x=>x.uci.startsWith(originSquare)).map(x=>x.uci.slice(2,4)):[];
  for(let pos=0;pos<64;pos++){
    const squareIndex=flipped?63-pos:pos,row=Math.floor(pos/8),col=pos%8,square=toSquare(squareIndex);
    const cell=document.createElement('button');cell.type='button';cell.className=`square ${(row+col)%2?'dark':'light'}`;
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
    if(interactive)cell.addEventListener('click',()=>boardClick(square,legal));
    board.append(cell);
  }
  board.setAttribute('aria-label',`Position after ${currentIndex()} plies. ${state.side==='w'?'White':'Black'} to move.`);
  board.insertAdjacentHTML('beforeend',arrowSvg(arrow));
}
function boardClick(square,legal){
  if(!isArchive()||currentIndex()>=archiveReplay.moves.length||revealedPly.has(currentIndex()))return;
  const fromChoices=originSquare?legal.filter(m=>m.uci.startsWith(originSquare)&&m.uci.slice(2,4)===square):[];
  if(fromChoices.length){
    const selected=fromChoices.find(m=>m.uci.length===4)||fromChoices.find(m=>m.uci.endsWith('q'))||fromChoices[0];
    $('guess-select').value=selected.uci;originSquare=null;selectedArrow=selected.uci;render();return;
  }
  originSquare=legal.some(m=>m.uci.startsWith(square))?square:null;
  selectedArrow=null;render();
}
function renderPlayerNames(data){
  const white=isArchive()?archive?.white:(data?.tags?.White||'White player');
  const black=isArchive()?archive?.black:(data?.tags?.Black||'Black player');
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
    setText('source-status',archive?`Verified 2024 championship archive · ${archiveReplay.moves.length/2} moves · 12 Dec 2024`:'Loading historic game…');
    a.href=archive?.source||'https://lichess.org/broadcast/fide-world-championship-2024/game-14/LtsCRK9D';a.textContent='View original game ↗';refresh.hidden=true;
  }else{
    a.href=GAME_ONE_BROADCAST;a.textContent='Original broadcast ↗';refresh.hidden=selectedGame!==1;
    $('source-light').classList.toggle('connected',Boolean(liveCheckedAt&&!liveError)||Boolean(liveGame?.moves.length));
    if(selectedGame!==1)setText('source-status',`Game ${selectedGame}: a verified broadcast source has not yet been assigned. No moves are inferred.`);
    else if(liveError&&liveGame?.moves.length)setText('source-status',`${liveGame.moves.length} cached broadcast moves · direct refresh unavailable (${liveError}) · not the physical move time`);
    else if(liveError)setText('source-status',`Broadcast unavailable (${liveError}). The historical challenge is still available.`);
    else if(liveCheckedAt)setText('source-status',`${liveGame?.moves.length||0} observed moves · Lichess checked ${liveCheckedAt.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',timeZoneName:'short'})} · feed timestamps ≠ move timestamps`);
    else if(liveSnapshotAt)setText('source-status',`${liveGame?.moves.length||0} cached broadcast moves · snapshot fetched ${liveSnapshotAt.toLocaleString()} · not the physical move time`);
    else setText('source-status','Connecting to the Game 1 Lichess broadcast…');
  }
}
function renderArchive(){
  if(!archive||!archiveReplay){
    setText('result-title','Preparing the archive');setText('result-description','Loading the recorded game.');$('decision-list').replaceChildren();$('guess-area').hidden=true;return;
  }
  const i=currentIndex(),next=archiveReplay.moves[i]||null,prior=i?archiveReplay.moves[i-1]:null;
  const revealed=revealedPly.has(i),guess=guesses.get(i)||null;
  $('guess-area').hidden=!next||revealed;
  setText('position-kicker','SINGAPORE · WORLD CHAMPIONSHIP 2024');
  setText('position-name',i===108?'The move that changed history':`Game 14 · ${humanMoveLabel(i)}`);
  setText('result-heading','PLAY THE HUMAN');setText('status-indicator','HISTORICAL · VERIFIED');
  setText('result-title',next?`What did ${i%2===0?'Ding':'Gukesh'} play?`:'The game is complete.');
  setText('result-description',next?'Select a legal move, or choose a piece and destination on the board. Commit your choice to compare it with the historical move.':'Ding resigned after move 58…Ke5. Gukesh won the 2024 World Championship.');
  const rows=[];
  if(guess){
    const san=withSans(archiveReplay.positions[i]).find(x=>x.uci===guess)?.san||guess;
    rows.push(decisionRow({label:'Your predicted move',subtitle:'Your local, retrospective guess',move:guess,san,status:revealed?(guess===next?.uci?'MATCH':'OTHER'):'LOCKED',id:'you',matched:revealed&&guess===next?.uci}));
  }
  if(next&&revealed)rows.push(decisionRow({label:i%2===0?archive.white:archive.black,subtitle:'Grandmaster’s recorded choice · 2024',move:next.uci,san:next.san,status:'PLAYED',actual:true}));
  if(!rows.length&&prior)rows.push(decisionRow({label:'Last recorded move',subtitle:'Move already played · navigate to continue',move:prior.uci,san:prior.san,status:'HISTORY',actual:true}));
  $('decision-list').innerHTML=rows.length?rows.join(''):'<div class="empty-row"><strong>A real grandmaster decision awaits.</strong><p>Select the move you expect. The actual choice stays concealed until you reveal it.</p></div>';
  const moveOptions=next?withSans(archiveReplay.positions[i]).sort((a,b)=>a.san.localeCompare(b.san)):[];
  const select=$('guess-select');
  select.innerHTML='<option value="">Select a legal move…</option>'+moveOptions.map(x=>`<option value="${x.uci}">${escapeHtml(x.san)} · ${x.uci}</option>`).join('');
  if(selectedArrow&&moveOptions.some(x=>x.uci===selectedArrow))select.value=selectedArrow;
  else if(guess)select.value=guess;
  $('guess-button').disabled=!select.value||Boolean(guess);
  $('reveal-button').disabled=!next;
  $('reveal-button').textContent=guess?'Reveal the move →':'Skip prediction · reveal move →';
  const stats=Array.from(guesses).filter(([ply])=>revealedPly.has(ply)),matched=stats.filter(([ply,uci])=>archiveReplay.moves[ply]?.uci===uci).length;
  $('score-line').hidden=!stats.length;setText('score-line',`${matched} exact matches in ${stats.length} revealed predictions · local session, not a model benchmark`);
  if(revealed){
    const matchedThis=guess===next?.uci;
    resultSummary(next?.san=== 'Rf2'&&i===108?'The deciding mistake: 55.Rf2':matchedThis?'An exact prediction.':'The grandmaster chose '+next?.san,
      i===108?'Ding’s rook exchange lost the drawn ending. The historical broadcast records 55.Rf2; independent analysis is linked in the source.':guess?(matchedThis?'Your guess matches the recorded move.':'An alternative legal move is not necessarily an inferior chess move.'):'This historical observation is recorded, not a live forecast.');
  }else resultSummary('The actual move is concealed.','Predict first, reveal second. In this archive the outcome is historical and already public.');
  setText('trace-text','Historical moves: Lichess Game 14 (12 December 2024). No model inference or prospective claims.');
  setText('bottom-source','HISTORICAL GAME · LICHESS · 2024');
  drawBoard(archiveReplay.positions[i],revealed?next?.uci:selectedArrow,Boolean(next&&!revealed));
}
function renderModelRoster(){
  const models=modelRoster?.models||[];
  const attempts=collectionIndex?.attempts||[];
  setText('model-attempt-total',attempts.length);
  if(modelRoster?.verifiedOn)setText('roster-date','PROVIDER IDS CHECKED '+modelRoster.verifiedOn);
  const grid=$('model-grid');
  if(!models.length){grid.textContent='The versioned model roster is currently unavailable.';return;}
  grid.innerHTML=models.map((m,i)=>{
    const record=attempts.filter(x=>x.model?.id===m.id);
    const caption=record.length?`${record.length} recorded API attempt${record.length===1?'':'s'}`:'No published call yet';
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
  setText('position-kicker','GENEVA · WORLD CHAMPIONSHIP 2026');
  setText('position-name',data?.moves.length?`Game ${String(selectedGame).padStart(2,'0')} · ${i} moves played`:`Game ${String(selectedGame).padStart(2,'0')} · opening position`);
  setText('result-heading','CHAMPIONSHIP DECISIONS');
  setText('status-indicator',data?.moves.length?'SOURCED MOVES':'AWAITING PLAY');
  setText('result-title',shownMove?`Broadcast move · ${shownMoveLabel}`:(forecastList.length||modelAttempts.length)?'Forecast attempts recorded · timing not verified.':'No verified model forecasts yet.');
  setText('result-description',latest?'The board displays the newest move available from the broadcast. Navigate back to examine earlier decisions. Future model comparisons will need independently documented pre-move forecasts.':data?.moves.length?'The board is reconstructed from sourced PGN. The current panel shows the recorded choice at this position; a model forecast must precede that choice.':'The 2026 match opens on 24 November. There are no real championship moves to display yet. Try the 2024 grandmaster challenge for a working example with genuine game data.');
  const rows=forecastList.map(f=>{
    const san=withSans(before).find(x=>x.uci===f.prediction.uci)?.san||f.prediction.uci;
    return decisionRow({label:f.model.id,subtitle:`${f.model.version} · operator-submitted / timing unverified`,san,move:f.prediction.uci,id:f.model.id,status:observation?(observation.uci===f.prediction.uci?'MATCH':'OTHER'):'FORECAST',matched:Boolean(observation&&observation.uci===f.prediction.uci)});
  });
  for(const a of modelAttempts){
    const move=a.status==='valid'?withSans(before).find(x=>x.uci===a.predictedUci):null;
    rows.push(decisionRow({label:a.model.name||a.model.id,subtitle:`${a.model.version} · provider response locally recorded · chronology unverified`,san:move?.san||'—',move:a.predictedUci||null,id:a.model.id,status:a.status==='valid'?'RECORDED':a.status==='invalid'?'INVALID':'FAILED'}));
  }
  if(shownMove)rows.push(decisionRow({label:shownMove.ply%2===1?(data.tags.White||'White player'):(data.tags.Black||'Black player'),subtitle:latest?'Latest available move · Lichess broadcast':'Observed move · Lichess broadcast',san:shownMove.san,move:shownMove.uci,actual:true,status:latest?'LATEST':'PLAYED'}));
  $('decision-list').innerHTML=rows.length?rows.join(''):'<div class="empty-row"><strong>Results have to be earned.</strong><p>Model comparisons appear only after real responses have been recorded and matched to a sourced chess position.</p></div>';
  $('guess-area').hidden=true;$('score-line').hidden=true;
  if(shownMove)resultSummary('Observed, not predicted.','The source identifies the played move. Its exact real-world playing time is not established by the moment the PGN was fetched.');
  else if(forecastList.length||modelAttempts.length)resultSummary('Submitted forecasts are provisional.','Displayed records have locally checked content. Public pre-move chronology and provider origin are still separate checks.');
  else resultSummary('No manufactured leaderboard.','Public prediction accuracy is withheld until real provider responses, sourced moves, and credible pre-move publication evidence are available.');
  setText('trace-text',selectedGame===1?'Source: Lichess Game 1, round xLgOJ6cb. Live retrieval is best-effort and broadcast-delayed.':'Only Game 1 has a confirmed Lichess broadcast round; no source has been assigned to this game.');
  setText('bottom-source','2026 MATCH · LICHESS PGN · NO VERIFIED MODEL SCORES');
  drawBoard(before,shownMove?.uci||null,false);
}
function render(){
  renderModelRoster();
  const historical=isArchive(),data=game(),i=currentIndex();
  $('tab-live').classList.toggle('active',!historical);$('tab-archive').classList.toggle('active',historical);
  $('tab-live').setAttribute('aria-pressed',String(!historical));$('tab-archive').setAttribute('aria-pressed',String(historical));
  $('game-select').disabled=historical;$('game-select').value=String(selectedGame);
  setSourceStatus();
  const fen=data?.positions[i]||START_FEN,state=parseFen(fen);
  renderPlayerNames(data);
  setText('side-to-move',state.side==='w'?'WHITE TO MOVE':'BLACK TO MOVE');setText('move-count',`MOVE ${state.fullmove}${state.side==='b'?'…':''}`);
  if(historical)renderArchive();else renderLive();
  setText('nav-position',`${i} / ${data?.moves.length||0} PLIES`);
  $('nav-start').disabled=i<=0;$('nav-back').disabled=i<=0;
  $('nav-next').disabled=i>=(data?.moves.length||0);$('nav-end').disabled=i>=(data?.moves.length||0);
  setText('board-context',historical?'2024 match · use the board to make your guess · ◀ ▶ to replay':'2026 match · sourced PGN · ◀ ▶ to inspect observed moves');
}

function recordGuess(){
  if(!archiveReplay||!isArchive())return;
  const i=currentIndex(),uci=$('guess-select').value;
  if(i>=archiveReplay.moves.length||revealedPly.has(i)||guesses.has(i))return;
  if(!withSans(archiveReplay.positions[i]).some(m=>m.uci===uci))return;
  guesses.set(i,uci);selectedArrow=uci;render();
}
function revealMove(){if(!isArchive()||!archiveReplay?.moves[currentIndex()])return;revealedPly.add(currentIndex());selectedArrow=null;originSquare=null;render();}

/** Fetch fresh PGN directly from Lichess; this is not a model inference endpoint. */
async function refreshBroadcast(){
  if(requestRunning)return;
  requestRunning=true;lastDirectAttempt=Date.now();$('refresh-button').disabled=true;
  try{
    const response=await fetch(GAME_ONE_PGN,{headers:{Accept:'application/x-chess-pgn'},cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const games=parsePgn(await response.text());
    const current=findChampionshipGame(games);
    if(!current&&games.some(g=>g.moves.length))throw new Error('No Gukesh–Sindarov game in broadcast');
    // Reject source rewrites: a changed prefix needs manual investigation, never a silent history overwrite.
    if(liveGame?.moves.length&&!current)throw new Error('Broadcast no longer contains the previously observed game');
    validateAppendOnly(liveGame,current);
    const latest=current||{tags:{},moves:[],positions:[START_FEN]};
    const before=liveGame?.moves.length||0;
    liveGame=latest;liveCheckedAt=new Date();liveError=null;
    if(!userChangedMode&&latest.moves.length&&mode==='archive'){switchMode('live',false);}
    if(mode==='live'&&selectedGame===1&&(selectedPly===null||selectedPly>=before))selectedPly=latest.moves.length;
  }catch(error){
    liveError=error instanceof Error?error.message:'unavailable';
    console.warn('Lichess broadcast fetch failed:',error);
  }finally{requestRunning=false;$('refresh-button').disabled=false;render();}
}

for(let g=1;g<=14;g++){const o=document.createElement('option');o.value=String(g);o.textContent=String(g).padStart(2,'0');$('game-select').append(o);}
$('game-select').addEventListener('change',e=>{selectedGame=Number(e.target.value);selectedPly=selectedGame===1?(liveGame?.moves.length||0):0;syncUrl();render();});
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
    const [historical,ledger,cached,roster,collection]=await Promise.all([
      fetch('./data/archive-2024.json').then(r=>{if(!r.ok)throw Error(`archive HTTP ${r.status}`);return r.json();}),
      fetch('./data/match.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`ledger HTTP ${r.status}`);return r.json();}),
      fetch('./data/live-game1.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`snapshot HTTP ${r.status}`);return r.json();}).catch(error=>{console.warn('Optional broadcast cache unavailable:',error);return null;}),
      fetch('./data/models.json').then(r=>{if(!r.ok)throw Error(`roster HTTP ${r.status}`);return r.json();}),
      fetch('./data/collection.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`collection HTTP ${r.status}`);return r.json();}),
    ]);
    if(historical.schema!=='historical-game-v1'||ledger.schema!=='match-v1'||roster.schema!=='model-roster-v1'||collection.schema!=='collection-index-v1')throw new Error('Unexpected data schema');
    const replay=replaySanMoves(historical.moves.trim().split(/\s+/));
    if(replay.moves.length!==116||replay.moves[108].san!=='Rf2')throw new Error('Unexpected archive moves');
    archive=historical;archiveReplay=replay;matchData=ledger;modelRoster=roster;collectionIndex=collection;
    if(cached){
      try{liveGame=restoreSnapshot(cached);liveSnapshotAt=cached.fetchedAt?new Date(cached.fetchedAt):null;}
      catch(error){console.warn('Broadcast cache rejected:',error);}
    }
    const deepPly=Number(query.get('ply'));
    selectedPly=query.has('ply')&&Number.isInteger(deepPly)&&deepPly>=0?deepPly:isArchive()?historical.highlightPly-1:(liveGame?.moves.length||0);
    if(!userChangedMode&&liveGame?.moves.length&&mode==='archive')switchMode('live',false);
  }catch(error){
    console.error('Cannot load recorded data:',error);
    setText('source-status','The game data could not be loaded. Refresh, or serve this site using a local web server.');
  }
  render();await refreshBroadcast();
}
render();initialize();
// Avoid polling Lichess for spectators of the offline archive. Active live viewers
// check at most every three minutes, or every five minutes after a failed request.
setInterval(()=>{
  const interval=liveError?300000:180000;
  if(!document.hidden&&mode==='live'&&selectedGame===1&&!requestRunning&&Date.now()-lastDirectAttempt>=interval)refreshBroadcast();
},60000);
