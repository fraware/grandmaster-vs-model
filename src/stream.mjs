import qrcode from './vendor/qrcode.mjs';
import {streamRound,streamLinks} from './stream-links.mjs';
const params=new URLSearchParams(location.search);
const overlay=params.get('overlay')==='1';
if(overlay)document.documentElement.classList.add('overlay');
const $=id=>document.getElementById(id);
let game=streamRound(params.get('game'));
let links;
for(let n=1;n<=14;n++){
  const option=document.createElement('option');option.value=String(n);option.textContent='Game '+n;$('round').append(option);
}
function update(){
  links=streamLinks(game);
  $('round').value=String(game);
  $('round-label').textContent='WORLD CHAMPIONSHIP · GAME '+String(game).padStart(2,'0');
  // Same-origin during local testing; published QR/link always uses canonical HTTPS.
  const board=new URL(links.board);
  $('broadcast-board').src='lab.html'+board.search;
  $('viewer-link').href=links.player;
  $('obs-url').value=links.overlay;
  $('open-overlay').href=links.overlay;
  const qr=qrcode(0,'M');qr.addData(links.player,'Byte');qr.make();
  const modules=qr.getModuleCount(), quiet=4, size=modules+2*quiet;
  let path='';
  for(let y=0;y<modules;y++)for(let x=0;x<modules;x++)if(qr.isDark(y,x))path+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><path fill="white" d="M0 0h${size}v${size}H0z"/><path fill="black" d="${path}"/></svg>`;
  $('viewer-qr').src='data:image/svg+xml,'+encodeURIComponent(svg);
}
$('round').addEventListener('change',()=>{
  game=streamRound($('round').value);update();
  const url=new URL(location.href);url.searchParams.set('game',String(game));history.replaceState(null,'',url);
});
async function copy(text){
  try{await navigator.clipboard.writeText(text);$('copy-status').textContent='Copied.';}
  catch{$('obs-url').value=text;$('obs-url').focus();$('obs-url').select();$('copy-status').textContent='Copy the selected URL manually.';}
}
$('copy-obs').addEventListener('click',()=>copy(links.overlay));
$('copy-viewer').addEventListener('click',()=>copy(links.player));
update();
