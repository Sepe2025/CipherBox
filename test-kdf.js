/* KDF 升级验证：旧参数（150000）数据 → 解锁 → 自动重加密为 600000 */
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
      if (!upgraded) {
        const i = buf.indexOf('\r\n\r\n');
        if (i < 0) return;
        upgraded = true; buf = buf.slice(i + 4); resolve(api);
      }
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

/* 在页面里构造一份「旧版参数」的加密数据（模拟升级前的存量用户） */
const MAKE_OLD = `(async()=>{
  var salt = new Uint8Array(16); crypto.getRandomValues(salt);
  var iv = new Uint8Array(12); crypto.getRandomValues(iv);
  var km = await crypto.subtle.importKey('raw', new TextEncoder().encode('MasterPass123'), 'PBKDF2', false, ['deriveKey']);
  var key = await crypto.subtle.deriveKey({name:'PBKDF2', salt:salt, iterations:150000, hash:'SHA-256'}, km, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  var plain = new TextEncoder().encode(JSON.stringify({entries:[
    {id:'old1', name:'旧版迁移记录', account:'old@example.com', password:'OldPw!123', category:'测试', url:'', desc:'', pinned:false, createdAt:1, updatedAt:1}
  ]}));
  var ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv:iv}, key, plain));
  var b64 = function(u){ var s=''; for(var i=0;i<u.length;i++) s+=String.fromCharCode(u[i]); return btoa(s); };
  localStorage.setItem('apm.vault.v1', JSON.stringify({v:1, fmt:'wc', iters:150000, salt:b64(salt), iv:b64(iv), data:b64(ct)}));
  return 'seeded';
})()`;

let pass = 0, failN = 0;
function check(label, cond) { console.log('  ' + (cond ? '✅' : '❌') + ' ' + label); cond ? pass++ : failN++; }

(async () => {
  const port = 9500 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'kdf-' + port);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { const j = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list')); const t = j.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) { wsUrl = t.webSocketDebuggerUrl; break; } } catch (e) {}
  }
  const cdp = await wsConnect(wsUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1700);
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  console.log('=== KDF 迭代升级验证 ===');
  console.log('');

  /* 造一份旧参数数据 */
  const mk = await ev(MAKE_OLD);
  check('构造旧参数数据（iters=150000）', mk === 'seeded');

  /* reload 让页面重新读取 */
  await cdp.send('Page.reload'); await sleep(1800);

  /* 确认页面读到的是旧数据 */
  const iters0 = await ev(`(function(){ var v = JSON.parse(localStorage.getItem('apm.vault.v1')||'{}'); return v.iters || 0; })()`);
  check('解锁前 blob.iters = 150000', iters0 === 150000);

  /* 解锁 */
  await ev(`(function(){ document.querySelector('#lockPw').value='MasterPass123';
    document.querySelector('#lockBtn').click(); })()`);
  /* 600000 次 PBKDF2 在软件渲染下要几秒，给足时间 */
  await sleep(6000);

  const mainScreen = await ev(`!document.getElementById('mainScreen').hidden`);
  check('旧参数数据解锁成功（兼容性）', mainScreen === true);

  const names = await ev(`JSON.stringify([...document.querySelectorAll('#mainList .card-title')].map(n=>n.textContent))`);
  check('数据完整（旧记录仍在）', names.indexOf('旧版迁移记录') >= 0);

  /* 关键：解锁后应自动用 600000 重加密 */
  await sleep(2500);   /* persist 是 async，等它写完 */
  const iters1 = await ev(`(function(){ var v = JSON.parse(localStorage.getItem('apm.vault.v1')||'{}'); return v.iters || 0; })()`);
  check('解锁后 blob.iters 自动升到 600000', iters1 === 600000);

  /* 再锁一次 → 用新参数解一次，确认往返正常 */
  await ev(`document.querySelector('#btnLock').click()`); await sleep(500);
  await ev(`(function(){ document.querySelector('#lockPw').value='MasterPass123';
    document.querySelector('#lockBtn').click(); })()`);
  await sleep(6000);
  const mainScreen2 = await ev(`!document.getElementById('mainScreen').hidden`);
  check('新参数数据再次解锁正常', mainScreen2 === true);
  const names2 = await ev(`JSON.stringify([...document.querySelectorAll('#mainList .card-title')].map(n=>n.textContent))`);
  check('新参数下数据完整', names2.indexOf('旧版迁移记录') >= 0);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'kdf-after.png'), Buffer.from(shot.result.data, 'base64'));

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
