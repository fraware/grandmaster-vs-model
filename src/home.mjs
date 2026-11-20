/** Lightweight, offline-first entrance to the sourced historical challenge. */
import {replaySanMoves} from './pgn.mjs';
import {mountChallenge} from './challenge-ui.mjs';
import {homepageInvite} from './home-entry.mjs';

/** Public, scheduled routing: no device analytics and no inference. */
function updateLiveInvite(){
  const data=homepageInvite(new Date(Date.now()));
  const set=(id,value)=>{
    const element=document.getElementById(id);
    if(element)element.textContent=value;
  };
  set('live-invite-status',data.status);
  set('live-invite-time',data.time);
  set('live-invite-title',data.title);
  set('live-invite-description',data.description);
  const link=document.getElementById('live-invite-link');
  if(link){
    link.href=data.href;
    const label=link.querySelector('span:first-child');
    if(label)label.textContent=data.action;
  }
  const heroLink=document.getElementById('live-hero-link');
  if(heroLink){
    heroLink.href=data.href;
    heroLink.firstChild.textContent=`GAME ${String(data.game).padStart(2,'0')} · PLAY 2026 `;
    heroLink.setAttribute('aria-label',`${data.status}. ${data.time}. ${data.action}.`);
  }
}


async function initializeHome() {
  const response = await fetch('./data/archive-2024.json');
  if (!response.ok) throw new Error(`Historical game unavailable (HTTP ${response.status})`);
  const archive = await response.json();
  if (archive.schema !== 'historical-game-v1') throw new Error('Unexpected historical-game data');
  const replay = replaySanMoves(archive.moves.trim().split(/\s+/));
  let retrospective = null;
  try {
    const modelResponse = await fetch('./data/retrospective-2024.json');
    if (modelResponse.ok) retrospective = await modelResponse.json();
  } catch { /* Historical challenge stays usable without the optional model record. */ }
  mountChallenge(archive, replay, retrospective);
}

// Preserve links shared before the challenge acquired a dedicated research page.
const parameters = new URLSearchParams(window.location.search);
const wantsLab = ['live', 'archive'].includes(parameters.get('mode')) ||
  ['#experiment', '#models', '#method'].includes(window.location.hash);
if (wantsLab) {
  const destination = new URL(`lab.html${window.location.search}${window.location.hash}`, window.location.href);
  window.location.replace(destination.href);
} else {
  try { updateLiveInvite(); }
  catch(error) { console.warn('The scheduled live round label is unavailable:',error); }
  // A tab restored from history or reactivated on another match day must not
  // keep pointing to yesterday's scheduled round.
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)updateLiveInvite();
  });
  window.addEventListener('pageshow',()=>updateLiveInvite());
  initializeHome().catch(() => {
    const area = document.querySelector('.challenge-right');
    if (!area) return;
    const alert = document.createElement('p');
    alert.setAttribute('role', 'alert');
    alert.className = 'challenge-error';
    alert.textContent = 'The verified game could not be loaded. Please refresh this page.';
    area.prepend(alert);
  });
}
