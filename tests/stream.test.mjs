import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import qrcode from '../src/vendor/qrcode.mjs';
import {streamRound,streamLinks} from '../src/stream-links.mjs';

test('streamer links bind all fourteen rounds without tracking or prediction state',()=>{
  for(let game=1;game<=14;game++){
    const {player,board,overlay}=streamLinks(game);
    for(const link of [player,board,overlay]){
      const url=new URL(link);
      assert.equal(url.origin,'https://fraware.github.io');
      assert.equal(url.searchParams.get('game'),String(game));
      assert.equal(url.searchParams.has('ply'),false);
    }
    assert.equal(new URL(board).searchParams.get('broadcast'),'1');
    assert.equal(new URL(board).searchParams.get('embed'),'1');
    assert.equal(new URL(player).searchParams.has('broadcast'),false);
    assert.equal(new URL(player).searchParams.has('embed'),false);
    assert.equal(new URL(overlay).searchParams.get('overlay'),'1');
    const qr=qrcode(0,'M');qr.addData(player,'Byte');qr.make();
    assert.ok(qr.getModuleCount()>20);
    assert.equal(qr.isDark(0,0),true);
    assert.equal(qr.isDark(1,1),false);
  }
  for(const value of [0,15,'1',null,NaN])assert.throws(()=>streamLinks(value),RangeError);
});

test('explicit valid round wins; malformed values follow the pinned schedule',()=>{
  const now=new Date('2026-12-04T14:20:00Z');
  assert.equal(streamRound('1',now),1);
  for(const invalid of [null,'0','15','01','1e0','1&overlay=1','<script>'])assert.equal(streamRound(invalid,now),9);
});

test('streamer page is included in static deployment and uses local QR generation',async()=>{
  const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
  const [page,script,pages,app,notice]=await Promise.all(['stream.html','src/stream.mjs','.github/workflows/pages.yml','app.mjs','assets/qrcode-LICENSE.txt'].map(read));
  assert.match(page,/src="src\/stream\.mjs"/);
  assert.match(page,/referrerpolicy="no-referrer"/);
  assert.match(script,/import qrcode from '\.\/vendor\/qrcode\.mjs'/);
  assert.match(script,/quiet=4/);
  assert.match(pages,/stream\.html stream\.css _site\//);
  assert.match(app,/if\(isArchive\(\)\|\|broadcastOnly\)return/);
  assert.match(notice,/Copyright \(c\) 2009 Kazuhiko Arase/);
});
