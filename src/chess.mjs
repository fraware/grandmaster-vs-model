/**
 * Dependency-free standard-chess rules for public forecast validation and replay.
 * Board indices use a8=0, h1=63. No variants or Chess960 are supported.
 * Implementation is deliberately isolated and independently perft-tested.
 */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
const PIECES = 'pnbrqkPNBRQK';
const dirs = {
  n: [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]],
  k: [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  b: [[-1,-1],[-1,1],[1,-1],[1,1]],
  r: [[-1,0],[0,-1],[0,1],[1,0]],
};
const queenDirs = [...dirs.b, ...dirs.r];
const inBounds = (r, f) => r >= 0 && r < 8 && f >= 0 && f < 8;
const at = (r, f) => r*8+f;
const color = p => p === '.' ? null : p === p.toUpperCase() ? 'w' : 'b';
const enemy = side => side === 'w' ? 'b' : 'w';
const isDigit = s => /^\d+$/.test(s);
export function toIndex(square) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error(`Invalid square: ${square}`);
  return at(8-Number(square[1]), FILES.indexOf(square[0]));
}
export function toSquare(i) {
  if (!Number.isInteger(i) || i<0 || i>63) throw new Error(`Invalid board index ${i}`);
  return FILES[i%8] + (8-Math.floor(i/8));
}
export function parseFen(fen) {
  if (typeof fen !== 'string') throw new Error('FEN must be a string');
  const parts = fen.trim().split(/\s+/);
  if (parts.length !== 6) throw new Error('FEN needs six fields');
  const [placement, side, castle, enpassant, halfText, fullText] = parts;
  const ranks = placement.split('/');
  if (ranks.length !== 8) throw new Error('FEN needs eight ranks');
  const board=[];
  for (const rank of ranks) {
    let count=0;
    for(const p of rank){
      if (/^[1-8]$/.test(p)) {const n=Number(p);for(let j=0;j<n;j++)board.push('.'); count+=n;}
      else if(PIECES.includes(p)){board.push(p); count++;}
      else throw new Error(`Invalid FEN piece ${p}`);
    }
    if(count!==8) throw new Error('Every FEN rank must contain eight squares');
  }
  if (side !== 'w' && side !== 'b') throw new Error('Invalid side to move');
  if (!/^(?:-|K?Q?k?q?)$/.test(castle) || castle === '') throw new Error('Invalid castling rights');
  if (enpassant !== '-' && !/^[a-h][36]$/.test(enpassant)) throw new Error('Invalid en-passant target');
  if (enpassant !== '-' && (side === 'w' ? enpassant[1] !== '6' : enpassant[1] !== '3')) throw new Error('En-passant target inconsistent with side to move');
  if (!isDigit(halfText)||!isDigit(fullText)||Number(fullText)<1||!Number.isSafeInteger(Number(halfText))||!Number.isSafeInteger(Number(fullText))) throw new Error('Invalid move counters');
  if(board.filter(x=>x==='K').length!==1||board.filter(x=>x==='k').length!==1) throw new Error('FEN needs one king per side');
  if (board.slice(0,8).concat(board.slice(56)).some(p=>p==='p'||p==='P')) throw new Error('Pawn on final rank');
  const whiteKing = board.indexOf('K'), blackKing=board.indexOf('k');
  if(Math.abs(Math.floor(whiteKing/8)-Math.floor(blackKing/8))<=1 && Math.abs(whiteKing%8-blackKing%8)<=1) throw new Error('Kings cannot be adjacent');
  return {board,side,castle:castle==='-'?'':castle,ep:enpassant,halfmove:Number(halfText),fullmove:Number(fullText)};
}
export function serializeFen(state) {
  const ranks=[];
  for(let r=0;r<8;r++){
    let out='',empties=0;
    for(let f=0;f<8;f++){
      const p=state.board[at(r,f)];
      if(p==='.') empties++;
      else {if(empties){out+=empties;empties=0;} out+=p;}
    }
    if(empties) out+=empties;
    ranks.push(out);
  }
  return `${ranks.join('/')} ${state.side} ${state.castle||'-'} ${state.ep} ${state.halfmove} ${state.fullmove}`;
}
function isAttacked(state, target, by) {
  const b=state.board,r=Math.floor(target/8),f=target%8;
  const pawn=by==='w'?'P':'p';
  const pawnRow=r+(by==='w'?1:-1);
  for(const df of [-1,1])if(inBounds(pawnRow,f+df)&&b[at(pawnRow,f+df)]===pawn)return true;
  for(const [dr,df] of dirs.n){const rr=r+dr,ff=f+df;if(inBounds(rr,ff)&&b[at(rr,ff)]===(by==='w'?'N':'n'))return true;}
  for(const [dr,df] of dirs.k){const rr=r+dr,ff=f+df;if(inBounds(rr,ff)&&b[at(rr,ff)]===(by==='w'?'K':'k'))return true;}
  for(const [dr,df] of queenDirs){
    let rr=r+dr,ff=f+df;
    while(inBounds(rr,ff)){
      const piece=b[at(rr,ff)];
      if(piece!=='.'){
        if(color(piece)===by){const p=piece.toLowerCase();if(p==='q'||(p==='b'&&dr!==0&&df!==0)||(p==='r'&&(dr===0||df===0)))return true;}
        break;
      }
      rr+=dr;ff+=df;
    }
  }
  return false;
}
export function isCheck(state, side=state.side) {
  return isAttacked(state,state.board.indexOf(side==='w'?'K':'k'),enemy(side));
}
function pseudoMoves(state) {
  const out=[],b=state.board,us=state.side;
  const push=(from,to,extra={}) => {if(b[to]!=='.' && b[to].toLowerCase()==='k')return;out.push({from,to,...extra});};
  for(let from=0;from<64;from++){
    const piece=b[from];if(color(piece)!==us)continue;
    const p=piece.toLowerCase(),r=Math.floor(from/8),f=from%8;
    if(p==='p'){
      const step=us==='w'?-1:1,final=us==='w'?0:7,initial=us==='w'?6:1;
      const addPawn=(to,extra={})=> {if(Math.floor(to/8)===final){for(const promotion of ['q','r','b','n'])push(from,to,{...extra,promotion});}else push(from,to,extra);};
      if(inBounds(r+step,f)&&b[at(r+step,f)]==='.'){
        addPawn(at(r+step,f));
        if(r===initial&&b[at(r+2*step,f)]==='.')push(from,at(r+2*step,f),{doublePawn:true});
      }
      for(const df of [-1,1]){
        if(!inBounds(r+step,f+df))continue;
        const to=at(r+step,f+df);
        if(b[to]!=='.'&&color(b[to])===enemy(us))addPawn(to,{capture:true});
        else if(state.ep!=='-'&&to===toIndex(state.ep)&&b[at(r,f+df)]===(us==='w'?'p':'P'))push(from,to,{ep:true,capture:true});
      }
    } else if(p==='n'||p==='k') {
      for(const [dr,df] of dirs[p]){
        const rr=r+dr,ff=f+df;if(!inBounds(rr,ff))continue;
        const to=at(rr,ff);if(color(b[to])!==us)push(from,to,{capture:b[to]!=='.'});
      }
      if(p==='k'&&!isCheck(state,us)){
        const home=us==='w'?60:4, rook=us==='w'?'R':'r';
        if(from===home){
          if(state.castle.includes(us==='w'?'K':'k')&&b[home+3]===rook&&b[home+1]==='.'&&b[home+2]==='.'&&!isAttacked(state,home+1,enemy(us))&&!isAttacked(state,home+2,enemy(us)))push(from,home+2,{castle:'K'});
          if(state.castle.includes(us==='w'?'Q':'q')&&b[home-4]===rook&&b[home-1]==='.'&&b[home-2]==='.'&&b[home-3]==='.'&&!isAttacked(state,home-1,enemy(us))&&!isAttacked(state,home-2,enemy(us)))push(from,home-2,{castle:'Q'});
        }
      }
    } else {
      const vector=p==='b'?dirs.b:p==='r'?dirs.r:queenDirs;
      for(const [dr,df] of vector){
        let rr=r+dr,ff=f+df;
        while(inBounds(rr,ff)){
          const to=at(rr,ff);if(color(b[to])===us)break;
          push(from,to,{capture:b[to]!=='.'});
          if(b[to]!=='.')break;
          rr+=dr;ff+=df;
        }
      }
    }
  }
  return out;
}
function applyUnchecked(state,move) {
  const b=[...state.board], piece=b[move.from], us=state.side;
  const captured=b[move.to];
  b[move.from]='.';
  b[move.to]=move.promotion?(us==='w'?move.promotion.toUpperCase():move.promotion):piece;
  if(move.ep)b[move.to+(us==='w'?8:-8)]='.';
  if(move.castle){
    const home=us==='w'?60:4;
    const rookFrom=move.castle==='K'?home+3:home-4;
    const rookTo=move.castle==='K'?home+1:home-1;
    b[rookTo]=b[rookFrom];b[rookFrom]='.';
  }
  let castle=state.castle;
  if(piece==='K')castle=castle.replace(/[KQ]/g,'');
  if(piece==='k')castle=castle.replace(/[kq]/g,'');
  for(const [sq,letter] of [[63,'K'],[56,'Q'],[7,'k'],[0,'q']]){
    if(move.from===sq||move.to===sq)castle=castle.replace(letter,'');
  }
  const ep=move.doublePawn?toSquare((move.from+move.to)/2):'-';
  const halfmove=(piece.toLowerCase()==='p'||captured!=='.'||move.ep)?0:state.halfmove+1;
  return {board:b,side:enemy(us),castle,ep,halfmove,fullmove:state.fullmove+(us==='b'?1:0)};
}
export function legalMoves(stateOrFen) {
  const state=typeof stateOrFen==='string'?parseFen(stateOrFen):stateOrFen;
  return pseudoMoves(state).filter(move=>!isCheck(applyUnchecked(state,move),state.side));
}
export const moveToUci = move => toSquare(move.from)+toSquare(move.to)+(move.promotion||'');
function sanFor(state,move,legal) {
  const piece=state.board[move.from],kind=piece.toUpperCase();
  let san='';
  if(move.castle)san=move.castle==='K'?'O-O':'O-O-O';
  else {
    if(kind!=='P'){
      san+=kind;
      const others=legal.filter(m=>m.to===move.to&&m.from!==move.from&&state.board[m.from].toUpperCase()===kind);
      if(others.length){
        const sameFile=others.some(m=>m.from%8===move.from%8),sameRank=others.some(m=>Math.floor(m.from/8)===Math.floor(move.from/8));
        if(!sameFile)san+=FILES[move.from%8];
        else if(!sameRank)san+=(8-Math.floor(move.from/8));
        else san+=toSquare(move.from);
      }
    }else if(move.capture)san+=FILES[move.from%8];
    if(move.capture)san+='x';
    san+=toSquare(move.to);
    if(move.promotion)san+='='+move.promotion.toUpperCase();
  }
  const next=applyUnchecked(state,move);
  if(isCheck(next,next.side))san+=legalMoves(next).length===0?'#':'+';
  return san;
}
export function play(fen,uci){
  if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error(`Invalid UCI move: ${uci}`);
  const state=parseFen(fen), legal=legalMoves(state);
  const move=legal.find(m=>moveToUci(m)===uci);
  if(!move)throw new Error(`Illegal move ${uci} in position ${fen}`);
  return {fen:serializeFen(applyUnchecked(state,move)),san:sanFor(state,move,legal),uci,from:toSquare(move.from),to:toSquare(move.to),piece:state.board[move.from]};
}
export function withSans(fen){
  const s=parseFen(fen),moves=legalMoves(s);
  return moves.map(m=>({uci:moveToUci(m),san:sanFor(s,m,moves)}));
}
export function isGameOver(fen) {const s=parseFen(fen);return legalMoves(s).length===0;}
