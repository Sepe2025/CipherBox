/* ============================================================
   添加抽屉打开时的帧率归因（对照实验）
   ------------------------------------------------------------
   逐个剥离可疑因素，看帧率变化 —— 用来定位"卡"的真正来源。
   A 基线 / B 关光场动画 / C 关 scrim 模糊 / D 关 sheet 模糊
   E 关噪点 / F 关卡片模糊 / G 全关
   注意：headless 无 GPU，绝对值不代表真机；**相对差异**才是结论。
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const THEME = process.argv[2] || 'light';

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

const SEED = `
  const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('waitFor');};
  const seed=[['学校教务系统','22607010047','Str0ng#Pass!2026','学习','',''],['工商银行','6212 2602 0000 1234','Bank#2026!Aa','金融','','']];
  const set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
  for(let i=0;i<seed.length;i++){const s=seed[i];
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay')&&!document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,120));
    set('#fName',s[0]);set('#fAccount',s[1]);set('#fPw',s[2]);set('#fCat',s[3]);
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
    await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1,5000);}
`;

/* 帧率采样：跑 n 帧，返回间隔的中位/p95 */
const MEASURE = `(async(n=90)=>{
  const gaps=[]; let last=performance.now();
  await new Promise(res=>{
    let i=0;
    const tick=()=>{ const t=performance.now(); if(i>0) gaps.push(t-last); last=t; i++;
      if(i>n) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  gaps.sort((a,b)=>a-b);
  const med=gaps[Math.floor(gaps.length/2)];
  const p95=gaps[Math.floor(gaps.length*0.95)];
  return JSON.stringify({ med:+med.toFixed(1), p95:+p95.toFixed(1), fps:+(1000/med).toFixed(1) });
})()`;

(async () => {
  const port = 9700 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'perf-' + port);
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
  /* 模拟真实手机：DPR 3 会让模糊的像素量大 9 倍，这是关键 */
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1800);
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await ev(`(async()=>{const l1=document.querySelector('#lockPw'),l2=document.querySelector('#lockPw2');
    if(l1)l1.value='MasterPass123'; if(l2)l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b)b.click(); await new Promise(r=>setTimeout(r,800));})()`);
  await sleep(600);
  const sr = await ev(`(async()=>{ ${SEED}; return 'ok'; })()`);
  if (sr && sr.__err) console.log('SEED ERR: ' + String(sr.__err).split('\n')[0]);
  await sleep(400);
  await ev(`(async()=>{const want=${JSON.stringify(THEME)};
    for(let i=0;i<4;i++){ if(document.documentElement.getAttribute('data-theme')===want) break;
      const b=document.querySelector('#btnTheme'); if(b)b.click(); await new Promise(r=>setTimeout(r,200)); }})()`);
  await sleep(900);

  /* 先测主界面（抽屉未打开）作对照 */
  {
    const r0 = await ev(MEASURE);
    const o = JSON.parse(r0);
    console.log('  主界面（抽屉未开）      中位 ' + String(o.med).padStart(6) + 'ms   p95 ' + String(o.p95).padStart(6) + 'ms   → ' + String(o.fps).padStart(5) + ' fps');
  }

  /* 打开添加抽屉 */
  await ev(`document.querySelector('#fab').click()`);
  await sleep(1000);

  const styles = {};
  const setStyle = async (key, css) => {
    styles[key] = css;
    const all = Object.entries(styles).map(([k, v]) => v).join('\n');
    await ev(`(()=>{ let s=document.getElementById('__perf'); if(!s){ s=document.createElement('style'); s.id='__perf'; document.head.appendChild(s);} s.textContent=${JSON.stringify(all)}; })()`);
    await sleep(700);
  };
  const clearStyle = async () => { await ev(`(()=>{const s=document.getElementById('__perf'); if(s) s.textContent='';})()`); await sleep(700); };

  console.log('=== 添加抽屉打开时 · 帧率归因 [' + THEME + ', DPR3, 390x844] ===');
  console.log('（headless 无 GPU，看相对差异，不看绝对值）');
  console.log('');

  const report = async (label) => {
    const r = await ev(MEASURE);
    if (r && r.__err) { console.log('  ' + label.padEnd(22) + 'ERR'); return; }
    const o = JSON.parse(r);
    console.log('  ' + label.padEnd(22) + '中位 ' + String(o.med).padStart(6) + 'ms   p95 ' + String(o.p95).padStart(6) + 'ms   → ' + String(o.fps).padStart(5) + ' fps');
    return o.fps;
  };

  const base = await report('A 基线（现状）');
  const base2 = await report('A2 基线复测');
  const base3 = await report('A3 基线复测');

  /* 决定性实验：关掉再恢复 —— 若恢复后重新变卡，说明该项是主因；
     若仍流畅，说明是"首次光栅化后就被缓存"的一次性效应。 */
  await setStyle('noAnim', '.aurora i{ animation:none !important; }');
  await report('B  关光场动画');
  await clearStyle();
  await report('B2 恢复光场动画');

  await setStyle('noScrim', '.scrim{ -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }');
  await report('C  关 scrim 模糊');
  await clearStyle();
  await report('C2 恢复 scrim 模糊');

  await setStyle('noSheet', '.sheet{ -webkit-backdrop-filter:none !important; backdrop-filter:none !important; }');
  await report('D  关 sheet 模糊');
  await clearStyle();
  await report('D2 恢复 sheet 模糊');

  await setStyle('noGrain', 'body::after{ display:none !important; }');
  await report('E  关全屏噪点');
  await clearStyle();
  await report('E2 恢复噪点');

  console.log('');
  console.log('=== 判定 ===');
  console.log('  若 B2 / C2 / D2 / E2 又回到 ~7fps → 该项是持续的稳态开销');
  console.log('  若全部维持 60fps         → 是"首次光栅化"的一次性效应（只影响打开瞬间）');

  /* ---------- 光斑参数扫描（找收益最大的那一个） ---------- */
  console.log('');
  console.log('=== 光斑参数扫描（都保留动画，只改参数）===');
  await clearStyle();

  await setStyle('glowBlur80', '.aurora i{ filter:blur(80px) !important; }');
  await report('blur 132 → 80px');

  await clearStyle();
  await setStyle('glowBlur56', '.aurora i{ filter:blur(56px) !important; }');
  await report('blur 132 → 56px');

  await clearStyle();
  await setStyle('glowTwo', '.aurora i:nth-child(3),.aurora i:nth-child(4){ display:none !important; }');
  await report('只留 2 个光斑');

  await clearStyle();
  await setStyle('glowNoWillChange', '.aurora i{ will-change:auto !important; }');
  await report('去掉 will-change');

  await clearStyle();
  await setStyle('glowSmall', '.aurora i{ width:78vw !important; height:78vw !important; filter:blur(80px) !important; }');
  await report('尺寸+模糊双降');

  await clearStyle();
  await setStyle('glassBlur16', ':root{ --glass-blur:16px !important; }');
  await report('玻璃模糊 28→16px');

  await clearStyle();

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
})();
