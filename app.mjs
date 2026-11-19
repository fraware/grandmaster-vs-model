/** Static, inspectable public dashboard: no external JavaScript or tracking. */
import {START_FEN,parseFen,play,toIndex,toSquare} from './src/chess.mjs';
const PREVIEW_MOVES=['d2d4','d7d5','c2c4','e7e6','b1c3','g8f6','c1g5','f8e7','e2e3','e8g8','g1f3','h7h6','g5h4','b7b6'];
let previewFen=START_FEN;
for(const uci of PREVIEW_MOVES)previewFen=play(previewFen,uci).fen;
const preview={fen:previewFen,actual:'c4d5',models:[{id:'sample-1',name:'Example A',move:'c4d5',subtitle:'Scripted choice · for interface preview'},{id:'sample-2',name:'Example B',move:'f1d3',subtitle:'Scripted choice · for interface preview'},{id:'sample-3',name:'Example C',move:'a1c1',subtitle:'Scripted choice · for interface preview'}]};
const $=id=>document.getElementById(id);
const glyphs={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
let mode='example',flipped=false,selection='actual',afterMove=false,matchData=null,selectedGame=1;
function setText(id,text){$(id).textContent=text;}
function esc(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function getLive(){
  const games=matchData?.games||[];const g=games.find(x=>x.game===selectedGame);
  const forecastList=g?.forecasts||[],outcomes=g?.outcomes||[];
  const ply=Math.max(0,...forecastList.map(x=>x.ply),...outcomes.map(x=>x.ply));
  const currentForecast=forecastList.find(x=>x.ply===ply);
  const currentOutcome=outcomes.find(x=>x.ply===ply);
  const fen=currentForecast?.fen||currentOutcome?.fen||START_FEN;
  return {fen,forecasts:forecastList.filter(x=>x.ply===ply&&x.fen===fen),outcome:currentOutcome?.fen===fen?currentOutcome:null};
}
function showMove(row,fen){
  if(!row?.move)return null;
  try{return play(fen,row.move).san;}catch{return row.move;}
}
function boardSvg(uci){
  if(!uci)return '';
  const start=toIndex(uci.slice(0,2)),end=toIndex(uci.slice(2,4));
  const box=index=>({x:((flipped?7-index%8:index%8)+.5)*12.5,y:((flipped?7-Math.floor(index/8):Math.floor(index/8))+.5)*12.5});
  const a=box(start),b=box(end),dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy)||1;
  const ex=b.x-dx/dist*5.3,ey=b.y-dy/dist*5.3;
  return `<svg class="arrow-overlay" viewBox="0 0 100 100" aria-hidden="true"><defs><marker id="arrow-tip" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#b14f2f"/></marker></defs><path d="M${a.x} ${a.y} L${ex} ${ey}" fill="none" stroke="#b14f2f" stroke-width="1.65" stroke-linecap="round" opacity=".92" marker-end="url(#arrow-tip)"/></svg>`;
}
function drawBoard(fen,selectedUci){
  const state=parseFen(fen),board=$('board');board.replaceChildren();
  const chosen=selectedUci ? [selectedUci.slice(0,2),selectedUci.slice(2,4)] : [];
  for(let position=0;position<64;position++){
    const squareIndex=flipped?63-position:position;
    const row=Math.floor(position/8),col=position%8,square=toSquare(squareIndex);
    const cell=document.createElement('div');cell.className=`square ${(row+col)%2?'dark':'light'}`;
    if(chosen.includes(square))cell.classList.add('highlight');
    const piece=state.board[squareIndex];
    if(piece!=='.'){
      const el=document.createElement('span');el.className=`piece ${piece===piece.toUpperCase()?'white':'black'}`;el.textContent=glyphs[piece];el.setAttribute('aria-hidden','true');cell.append(el);
    }
    if(row===7){const file=document.createElement('span');file.className='square-label file';file.textContent=square[0];cell.append(file);}
    if(col===0){const rank=document.createElement('span');rank.className='square-label rank';rank.textContent=square[1];cell.append(rank);}
    board.append(cell);
  }
  board.setAttribute('aria-label',`Chess position ${fen}. ${selectedUci?'Selected move '+selectedUci:''}`);
  board.insertAdjacentHTML('beforeend',boardSvg(selectedUci));
}
function decisionRow({id,name,move,subtitle},fen,actual=false,knownActual=null){
  const san=showMove({move},fen);
  const selected=selection===id;
  const hit=knownActual&&move===knownActual;
  return `<button type="button" class="decision ${selected?'selected':''}" data-choice="${esc(id)}" aria-pressed="${selected}"><span class="decision-badge ${actual?'actual':''}">${actual?'H':esc(name.split(' ').at(-1)[0])}</span><span class="decision-info"><strong>${esc(name)}</strong><small>${esc(subtitle)}</small></span><span class="decision-uci">${esc(san||'—')}</span><span class="decision-status ${hit?'hit':''}">${actual?'PLAYED':knownActual?(hit?'MATCH':'OTHER'):'FORECAST'}</span></button>`;
}
function render(){
  const inPreview=mode==='example';const data=inPreview?null:getLive();
  $('tab-example').classList.toggle('active',inPreview);$('tab-live').classList.toggle('active',!inPreview);
  $('tab-example').setAttribute('aria-pressed',String(inPreview));$('tab-live').setAttribute('aria-pressed',String(!inPreview));$('game-select').disabled=inPreview;
  let fen, choices=[],actual=null,title,desc,positionTitle,positionKicker,heading,status;
  if(inPreview){
    fen=preview.fen;actual=preview.actual;choices=preview.models;
    positionTitle='One position. Four decisions.';positionKicker='SCRIPTED EXHIBITION POSITION';
    heading='WHO PREDICTED THE MOVE?';status='ILLUSTRATION';
    title='The same board. Different instincts.';
    desc='This is a scripted interface demonstration. Example A, B and C are fictional labels, not actual model responses.';
  }else{
    fen=data.fen;actual=data.outcome?.actualUci||null;
    choices=data.forecasts.map(f=>({id:f.model.id,name:f.model.id,move:f.prediction.uci,subtitle:`${f.model.version} · operator-submitted`}));
    positionTitle=data.outcome||choices.length?`Game ${String(selectedGame).padStart(2,'0')} · recorded position`:`Game ${String(selectedGame).padStart(2,'0')} · awaiting first move`;
    positionKicker='FIDE WORLD CHAMPIONSHIP · 2026';
    heading='PROSPECTIVE PREDICTIONS';status='NOT LIVE';
    title=choices.length?'The recorded forecasts.':'The board is set.';
    desc=choices.length?'Forecasts below are operator-submitted records. Model-origin and publication chronology require independent validation.':'No model predictions or championship moves have been entered for this game. The opening board is shown below.';
  }
  setText('position-name',positionTitle);setText('position-kicker',positionKicker);
  setText('result-heading',heading);setText('status-indicator',status);
  setText('result-title',title);setText('result-description',desc);
  const state=parseFen(fen),moveLabel=`MOVE ${state.fullmove}${state.side==='b'?'…':''}`;
  setText('side-to-move',state.side==='w'?'WHITE TO MOVE':'BLACK TO MOVE');setText('move-count',moveLabel);
  if(flipped){setText('top-player','White pieces');setText('top-side','WHITE');setText('bottom-player','Black pieces');setText('bottom-side','BLACK');}
  else{setText('top-player','Black pieces');setText('top-side','BLACK');setText('bottom-player','White pieces');setText('bottom-side','WHITE');}
  const rows=[];
  if(choices.length)rows.push(...choices.map(x=>decisionRow(x,fen,false,actual)));
  if(actual)rows.push(decisionRow({id:'actual',name:inPreview?'Illustrative played move':'Grandmaster’s played move',move:actual,subtitle:inPreview?'Scripted outcome · not a championship move':data.outcome.sourceUrl},fen,true,actual));
  if(rows.length)$('decision-list').innerHTML=rows.join('');
  else $('decision-list').innerHTML='<div class="empty-row"><strong>No forecasts yet.</strong><p>Once a real position and audited predictions are published, this panel will show the model comparison.</p></div>';
  if(!choices.some(x=>x.id===selection)&&selection!=='actual')selection=actual?'actual':choices[0]?.id||null;
  if(selection==='actual'&&!actual)selection=choices[0]?.id||null;
  $('decision-list').querySelectorAll('[data-choice]').forEach(el=>el.addEventListener('click',()=>{selection=el.dataset.choice;afterMove=false;render();}));
  const selected=selection==='actual'?actual:choices.find(x=>x.id===selection)?.move||null;
  let renderedFen=fen;
  if(afterMove&&selected){try{renderedFen=play(fen,selected).fen;}catch{afterMove=false;}}
  drawBoard(renderedFen,afterMove?null:selected);
  const toggle=$('position-toggle');toggle.disabled=!selected;toggle.textContent=afterMove?'← Return to original position':'Show resulting position ↗';
  const summary=$('result-summary');
  if(inPreview){summary.innerHTML='<span class="result-icon">◎</span><div><strong>The experiment measures human prediction.</strong><p>Illustrative choice A coincides with the scripted outcome. This is not an empirical accuracy result.</p></div>';setText('trace-text','Example-only demonstration. No AI inference, engine evaluation, or real-game data.');}
  else if(choices.length){
    const exact=actual?choices.filter(x=>x.move===actual).length:null;
    summary.innerHTML=`<span class="result-icon">◎</span><div><strong>${actual?`${exact} of ${choices.length} operator forecasts match.`:'Forecasts awaiting an observed move.'}</strong><p>Local records are subject to separate integrity, time-priority, and provider-origin checks. No engine strength claims are made.</p></div>`;
    setText('trace-text','Git-backed publication chronology must be checked independently before treating results as prospective evidence.');
  }else{summary.innerHTML='<span class="result-icon">◎</span><div><strong>Prediction log is empty.</strong><p>Real model predictions will appear only when submitted. The project does not invent forecasts or performance statistics.</p></div>';setText('trace-text','Public source: FIDE schedule · Observed results: none yet.');}
}
for(let game=1;game<=14;game++){const option=document.createElement('option');option.value=String(game);option.textContent=String(game).padStart(2,'0');$('game-select').append(option);}
$('game-select').addEventListener('change',event=>{selectedGame=Number(event.target.value);selection=null;afterMove=false;render();});
$('tab-live').addEventListener('click',()=>{mode='live';selection=null;afterMove=false;render();});
$('tab-example').addEventListener('click',()=>{mode='example';selection='actual';afterMove=false;render();});
$('flip-button').addEventListener('click',()=>{flipped=!flipped;render();});
$('position-toggle').addEventListener('click',()=>{afterMove=!afterMove;render();});
async function loadData(){try{const response=await fetch('./data/match.json',{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);const json=await response.json();if(json.schema!=='match-v1')throw new Error('Unexpected data schema');matchData=json;}catch(error){console.error('Cannot load match ledger:',error);setText('trace-text','Cannot load match ledger; run the site from a local web server.');}render();}
render();loadData();
