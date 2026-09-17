/* 存储容量实测：不同记录数下的加密体积与 localStorage 写入上限 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const m = url.match(/^ws:\/\/([^:/]+):(\d+)(\/.*)$/);
    const [, host, port, p] = m;
    const key = crypto.randomBytes(16).toString('base64');
    const sock = net.connect(Number(port), host, () => {
      sock.write(`GET ${p} HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let buf = Buffer.alloc(0), upgraded = false;
    const handlers = [];
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!upgraded) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; upgraded = true; buf = buf.slice(i + 4); resolve(api); }
      while (buf.length >= 2) {
        const b1 = buf[0], b2 = buf[1], op = b1 & 0x0f, len0 = b2 & 0x7f;
        let off = 2, len = len0;
        if (len0 === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if (len0 === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const masked = (b2 & 0x80) !== 0; let mask = null;
        if (masked) { if (buf.length < off + 4) break; mask = buf.slice(off, off + 4); off += 4; }
        if (buf.length < off + len) break;
        let payload = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (masked) { const c = Buffer.alloc(len); for (let i = 0; i < len; i++) c[i] = payload[i] ^ mask[i % 4]; payload = c; }
        if (op === 1) { try { handlers.forEach(h => h(JSON.parse(payload.toString('utf8')))); } catch (e) {} }
        else if (op === 8) sock.end();
      }
    });
    sock.on('error', reject);
    let id = 0; const pending = new Map();
    handlers.push(msg => { if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
    const api = {
      send(method, params) {
        const mid = ++id;
        const data = Buffer.from(JSON.stringify({ id: mid, method, params: params || {} }), 'utf8');
        const len = data.length; let header;
        if (len < 126) header = Buffer.from([0x81, 0x80 | len]);
        else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(len, 2); }
        else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(len), 2); }
        const mask = crypto.randomBytes(4), masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
        sock.write(Buffer.concat([header, mask, masked]));
        return new Promise(res => pending.set(mid, res));
      },
      close() { try { sock.end(); } catch (e) {} },
    };
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const httpGet = u => new Promise((res, rej) => { http.get(u, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res(s)); }).on('error', rej); });

(async () => {
  const port = 8200 + Math.floor(Math.random() * 80);
  const prof = path.join(OUT, 'cap-' + port);
  fs.mkdirSync(prof, { recursive: true });
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + prof, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { const j = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list')); const t = j.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) { ws = t.webSocketDebuggerUrl; break; } } catch (e) {}
  }
  const cdp = await wsConnect(ws);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1800);
  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await ev(`(async()=>{const l1=document.querySelector('#lockPw'),l2=document.querySelector('#lockPw2');
    if(l1)l1.value='MasterPass123'; if(l2)l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b)b.click(); await new Promise(r=>setTimeout(r,800));})()`);
  await sleep(600);

  console.log('=== 存储容量实测（AES-GCM 加密后写入 localStorage）===');
  console.log('');
  const result = await ev(`(async()=>{
    var out=[];
    var sizes=[1, 10, 100, 500, 1000, 3000, 5000];
    for (var k=0;k<sizes.length;k++){
      var N=sizes[k];
      var arr=[];
      for (var i=0;i<N;i++){
        arr.push({
          id:'cap-'+i+'-'+Math.random().toString(36).slice(2,10),
          name:'测试账号'+i, account:'user'+i+'@example.com',
          password:'P@ssw0rd#2026!Aa'+i, category:'测试分类',
          url:'https://example.com/'+i, desc:'这是一条用于容量测试的记录描述文本',
          pinned:false, createdAt:Date.now()-i*1000, updatedAt:Date.now()-i*1000
        });
      }
      var t0=performance.now();
      var blob;
      try { blob = await CRYPTO.encryptObj({ entries: arr }, 'MasterPass123'); }
      catch(e){ out.push({n:N, error:'加密失败:'+e.message}); continue; }
      var encMs=Math.round(performance.now()-t0);
      var json=JSON.stringify(blob);
      var bytes=json.length;
      var t1=performance.now();
      var writeOk=true, writeErr='';
      try{ localStorage.setItem('__cap_test__', json); localStorage.removeItem('__cap_test__'); }
      catch(e){ writeOk=false; writeErr=(e.name||'')+(e.message?(': '+e.message.slice(0,40)):''); }
      var wMs=Math.round(performance.now()-t1);
      out.push({ n:N, kb:+(bytes/1024).toFixed(1), perItem:+(bytes/N).toFixed(0), encMs:encMs, writeOk:writeOk, writeErr:writeErr, wMs:wMs });
    }
    return JSON.stringify(out);
  })()`);
  if (result && result.__err) { console.log('ERR: ' + result.__err); }
  else {
    const rows = JSON.parse(result);
    console.log('  记录数   加密后体积    单条均摊   加密耗时   写入localStorage');
    rows.forEach(r => {
      if (r.error) { console.log('  ' + String(r.n).padStart(6) + '   ' + r.error); return; }
      console.log('  ' + String(r.n).padStart(6) + '   ' + (r.kb + ' KB').padStart(10) + '   ' +
        (r.perItem + ' B').padStart(8) + '   ' + (r.encMs + 'ms').padStart(8) + '   ' +
        (r.writeOk ? ('成功 (' + r.wMs + 'ms)') : ('❌ ' + r.writeErr)));
    });
  }

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
})();
