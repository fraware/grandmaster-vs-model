/** Lightweight, offline-first entrance to the sourced historical challenge. */
import {replaySanMoves} from './pgn.mjs';
import {mountChallenge} from './challenge-ui.mjs';

async function initializeHome() {
  const response = await fetch('./data/archive-2024.json');
  if (!response.ok) throw new Error(`Historical game unavailable (HTTP ${response.status})`);
  const archive = await response.json();
  if (archive.schema !== 'historical-game-v1') throw new Error('Unexpected historical-game data');
  const replay = replaySanMoves(archive.moves.trim().split(/\s+/));
  mountChallenge(archive, replay);
}

// Preserve links shared before the challenge acquired a dedicated research page.
const parameters = new URLSearchParams(window.location.search);
const wantsLab = ['live', 'archive'].includes(parameters.get('mode')) ||
  ['#experiment', '#models', '#method'].includes(window.location.hash);
if (wantsLab) {
  const destination = new URL(`lab.html${window.location.search}${window.location.hash}`, window.location.href);
  window.location.replace(destination.href);
} else initializeHome().catch(() => {
  const area = document.querySelector('.challenge-right');
  if (!area) return;
  const alert = document.createElement('p');
  alert.setAttribute('role', 'alert');
  alert.className = 'challenge-error';
  alert.textContent = 'The verified game could not be loaded. Please refresh this page.';
  area.prepend(alert);
});
