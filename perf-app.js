/* 光场动画的渲染负载量化（帧间隔对比）*/
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots');

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

(async () => {
  const port = 8900 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'pf-' + port);
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
  /* DPR3 + 手机尺寸：接近真机的像素负载 */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(2000);
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await ev(`(async()=>{const l1=document.querySelector('#lockPw'),l2=document.querySelector('#lockPw2');
    if(l1)l1.value='MasterPass123'; if(l2)l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b)b.click(); await new Promise(r=>setTimeout(r,800));})()`);
  await sleep(500);

  /* 帧间隔采样：ms/帧（越高 = 每帧渲染越久 = GPU 越吃紧）*/
  const MEASURE = `(async(n=60)=>{
    var gaps=[], last=performance.now();
    await new Promise(function(res){ var i=0;
      function tick(){ var t=performance.now(); if(i>0) gaps.push(t-last); last=t; i++;
        if(i>=n) res(); else requestAnimationFrame(tick); }
      requestAnimationFrame(tick); });
    gaps.sort(function(a,b){return a-b;});
    var med=gaps[Math.floor(gaps.length/2)], p90=gaps[Math.floor(gaps.length*0.9)];
    return JSON.stringify({ med:+med.toFixed(1), p90:+p90.toFixed(1) });
  })()`;
  const measure = async (label) => {
    const r = await ev(MEASURE);
    if (r && r.__err) { console.log('  ' + label.padEnd(30) + 'ERR'); return; }
    const o = JSON.parse(r);
    console.log('  ' + label.padEnd(30) + '中位 ' + String(o.med).padStart(6) + 'ms/帧   p90 ' + String(o.p90).padStart(6) + 'ms');
    return o.med;
  };

  console.log('=== 光场渲染负载量化（DPR3 · 390x844）===');
  console.log('');

  const a = await measure('A 现状（132px blur × 4 动画）');
  await ev(`document.querySelectorAll('.aurora i').forEach(function(e){ e.style.animationPlayState='paused'; });`);
  await sleep(300);
  const b = await measure('B 光场暂停（锁屏/后台场景）');
  await ev(`document.querySelectorAll('.aurora i').forEach(function(e){ e.style.filter='blur(64px)'; });`);
  await sleep(300);
  const c = await measure('C blur 132→64（动画恢复）');
  await ev(`document.querySelectorAll('.aurora i').forEach(function(e){ e.style.filter='blur(132px)'; e.style.animationPlayState='running'; });`);
  await sleep(300);
  await ev(`document.querySelectorAll('.aurora i').forEach(function(e){ e.style.filter='blur(132px)'; e.style.width='100vw'; e.style.height='100vw'; });
    document.querySelector('.aurora i:nth-child(1)').style.cssText='';`);
  await sleep(300);
  /* 尺寸测试用 class 级覆盖 */
  await ev(`(function(){ var st=document.createElement('style'); st.id='__sz';
    st.textContent='.aurora i{ width:100vw !important; height:100vw !important; }';
    document.head.appendChild(st); })()`);
  await sleep(300);
  const d = await measure('D 光斑尺寸 155vw→100vw');
  await ev(`document.getElementById('__sz').remove()`);
  await sleep(300);
  await ev(`document.querySelectorAll('.aurora').forEach(function(e){ e.style.display='none'; });`);
  await sleep(300);
  const e2 = await measure('E 光场整体隐藏（基线）');
  await ev(`document.querySelectorAll('.aurora').forEach(function(e){ e.style.display=''; });`);
  await sleep(300);
  const f = await measure('F 恢复现状（对照）');

  console.log('');
  if (a && f) console.log('现状复测一致性: ' + (Math.abs(a - f) < 30 ? 'OK' : '注意'));

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
})();
