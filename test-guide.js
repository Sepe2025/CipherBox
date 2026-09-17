/* 首次引导验证：首屏有指引可打开说明；解锁模式无指引 */
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

let pass = 0, failN = 0;
function check(label, cond) { console.log('  ' + (cond ? '✅' : '❌') + ' ' + label); cond ? pass++ : failN++; }

(async () => {
  const port = 8400 + Math.floor(Math.random() * 80);
  const prof = path.join(OUT, 'g-' + port);
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1800);
  const ev = async (e) => {
    const r = await cdp.send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  console.log('=== 首次（建立模式）===');
  const st1 = await ev(`JSON.stringify({
    firstWrap: !document.getElementById('lockFirstWrap').hidden,
    guideVisible: !!document.getElementById('firstGuideBtn') && document.getElementById('firstGuideBtn').offsetParent !== null,
    text: (document.getElementById('firstGuideBtn')||{}).textContent || ''
  })`);
  const s1 = JSON.parse(st1);
  check('建立模式：首次容器可见', s1.firstWrap === true);
  check('建立模式：引导按钮可见', s1.guideVisible === true);
  check('引导文案含「使用说明」', s1.text.indexOf('使用说明') >= 0);

  /* 点引导 → 打开说明（且盖在锁屏上）*/
  await ev(`document.getElementById('firstGuideBtn').click()`);
  await sleep(500);
  const st2 = await ev(`JSON.stringify({
    helpOpen: !document.getElementById('helpOverlay').hidden,
    zTop: document.getElementById('helpOverlay').classList.contains('z-top'),
    zIndex: getComputedStyle(document.getElementById('helpOverlay')).zIndex,
    lockZ: getComputedStyle(document.getElementById('lockScreen')).zIndex
  })`);
  const s2 = JSON.parse(st2);
  check('点引导打开使用说明', s2.helpOpen === true);
  check('说明层在锁屏之上（z-top）', s2.zTop === true && Number(s2.zIndex) > Number(s2.lockZ));

  const shot1 = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'first-guide-help.png'), Buffer.from(shot1.result.data, 'base64'));

  /* 关闭说明 → 回到建立界面（可继续注册）*/
  await ev(`document.getElementById('helpClose').click()`);
  await sleep(400);
  const st3 = await ev(`JSON.stringify({
    helpHidden: document.getElementById('helpOverlay').hidden,
    zTopRemoved: !document.getElementById('helpOverlay').classList.contains('z-top'),
    firstStill: !document.getElementById('lockFirstWrap').hidden
  })`);
  const s3 = JSON.parse(st3);
  check('关闭说明后回到建立界面', s3.helpHidden === true && s3.firstStill === true);
  check('z-top 已还原', s3.zTopRemoved === true);

  /* 完成注册 → 锁定 → 解锁模式 */
  await ev(`(async()=>{const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('w');};
    const set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
    set('#lockPw','MasterPass123'); set('#lockPw2','MasterPass123');
    document.querySelector('#lockBtn').click();
    await waitFor(()=>document.getElementById('mainScreen').hidden===false,6000); return 'ok';})()`);
  await sleep(400);
  await ev(`document.querySelector('#btnLock').click()`);
  await sleep(500);

  console.log('');
  console.log('=== 解锁模式（老用户）===');
  const st4 = await ev(`JSON.stringify({
    firstHidden: document.getElementById('lockFirstWrap').hidden,
    guideVisible: document.getElementById('firstGuideBtn').offsetParent !== null,
    title: document.getElementById('lockTitle').textContent
  })`);
  const s4 = JSON.parse(st4);
  check('解锁模式：首次容器隐藏', s4.firstHidden === true);
  check('解锁模式：引导按钮不显示', s4.guideVisible === false);
  check('标题为解锁模式', s4.title === 'CipherBox');

  /* 解锁模式点设置→使用说明仍可用 */
  await ev(`(async()=>{const set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
    set('#lockPw','MasterPass123'); document.querySelector('#lockBtn').click();
    await new Promise(r=>setTimeout(r,700));})()`);
  await sleep(400);
  await ev(`document.querySelector('#btnHelp').click()`);
  await sleep(400);
  const helpNormal = await ev(`!document.getElementById('helpOverlay').hidden`);
  check('解锁后设置里的使用说明仍可打开', helpNormal === true);
  await ev(`document.getElementById('helpClose').click()`);
  await sleep(200);

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(prof, { recursive: true, force: true }); } catch (e) {}
  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
