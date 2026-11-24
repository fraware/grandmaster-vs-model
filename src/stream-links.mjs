import {selectHomepageRound} from './home-entry.mjs';
export const STREAM_ROOT='https://fraware.github.io/grandmaster-vs-model/';
export function streamRound(value,now=new Date(Date.now())){
  return /^(?:[1-9]|1[0-4])$/.test(value??'')?Number(value):selectHomepageRound(now).round.game;
}
export function streamLinks(game){
  if(!Number.isInteger(game)||game<1||game>14)throw new RangeError('Invalid game');
  const player=new URL('lab.html',STREAM_ROOT);
  player.searchParams.set('mode','live');player.searchParams.set('game',String(game));player.hash='experiment';
  const board=new URL(player);board.searchParams.set('embed','1');board.searchParams.set('broadcast','1');board.hash='';
  const overlay=new URL('stream.html',STREAM_ROOT);overlay.searchParams.set('game',String(game));overlay.searchParams.set('overlay','1');
  return {player:player.href,board:board.href,overlay:overlay.href};
}
