/* ============================================================
   背景光场 & 玻璃面 · 断层(banding)与透光度诊断
   ------------------------------------------------------------
   1) 背景断层：隐藏全部内容层，只留 .aurora，逐像素扫描亮度梯度。
      平滑渐变的相邻像素差应 < 1/255；出现成片跳变 = 可见色阶分界
      （也就是用户看到的"颜色断层"）。
   2) 玻璃透光度：同位置截两张 —— 有玻璃 / 无玻璃（纯背景）。
      计算两者的**皮尔逊相关系数**：
        相关高 → 背景的明暗起伏仍透过玻璃可见 → 有玻璃感
        相关低 → 玻璃把背景盖实了 → 看起来是块白板/灰板
      相关系数不受卡片内文字干扰（文字与背景不相关），比方差更稳。
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const THEME = process.argv[2] || 'dark';

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

/* 必须先种数据，否则页面停在锁屏，量不到任何卡片 */
const SEED = `
  const waitFor = async (fn, ms=5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise(r=>setTimeout(r,50)); }
    throw new Error('waitFor timeout');
  };
  const seed = [
    ['学校教务系统','22607010047','Str0ng#Pass!2026','学习','https://jw.wit.edu.cn','选课、查成绩。'],
    ['工商银行','6212 2602 0000 1234','Bank#2026!Aa','金融','https://icbc.com.cn',''],
    ['GitHub','guanhao@example.com','gh_Priv4te!Key','开发','https://github.com',''],
    ['淘宝','13800001111','taobao123','购物','https://taobao.com',''],
    ['校园 VPN','22607010047','Wit@Vpn#2026','学习','https://vpn.wit.edu.cn','']
  ];
  const set = (sel,v) => { const el=document.querySelector(sel); if(!el) throw new Error('missing '+sel);
    el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  for (let i=0;i<seed.length;i++){
    const s=seed[i];
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay') && !document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,120));
    set('#fName',s[0]); set('#fAccount',s[1]); set('#fPw',s[2]); set('#fCat',s[3]);
    if(document.querySelector('#fUrl')) set('#fUrl',s[4]);
    if(document.querySelector('#fDesc')) set('#fDesc',s[5]);
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden, 5000);
    await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1, 5000);
  }
`;

const lumAt = (img, x, y) => { const o = (y * img.width + x) * 4; return (0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]) / 255; };

/* 沿一串点扫描亮度，统计"跳变"（相邻像素亮度突变） */
function scanPath(img, pts) {
  let prev = null, maxStep = 0, maxAt = 0, jumps = 0, run = 0, maxRun = 0, lo = 1, hi = 0;
  const arr = [];
  for (const { x, y } of pts) {
    const v = lumAt(img, x, y);
    arr.push(v);
    if (v < lo) lo = v; if (v > hi) hi = v;
    if (prev !== null) {
      const d = Math.abs(v - prev) * 255;
      if (d > maxStep) { maxStep = d; maxAt = arr.length - 1; }
      if (d > 2) jumps++;
      if (d < 0.5) { run++; if (run > maxRun) maxRun = run; } else run = 0;
    }
    prev = v;
  }
  return { maxStep: +maxStep.toFixed(2), maxAt, jumps, maxRun, lo: +lo.toFixed(3), hi: +hi.toFixed(3) };
}

/* 皮尔逊相关系数 */
function corr(a, b) {
  const n = Math.min(a.length, b.length); if (n < 4) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sa = 0, sb = 0, sab = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sa += da * da; sb += db * db; sab += da * db; }
  if (sa < 1e-9 || sb < 1e-9) return 0;
  return sab / Math.sqrt(sa * sb);
}
const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const variance = a => { if (a.length < 2) return 0; const m = avg(a); return a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length; };
const span = a => { let lo = 1, hi = 0; a.forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; }); return hi - lo; };
function regionLum(img, r) {
  const a = [];
  const y1 = Math.min(r.y + r.h, img.height), x1 = Math.min(r.x + r.w, img.width);
  for (let y = Math.max(0, r.y); y < y1; y += 2) for (let x = Math.max(0, r.x); x < x1; x += 2) a.push(lumAt(img, x, y));
  return a;
}

(async () => {
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = path.join(__dirname, '.chrome-bg-' + Date.now());
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    try { const j = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list')); const t = j.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) { wsUrl = t.webSocketDebuggerUrl; break; } } catch (e) {}
    await sleep(250);
  }
  if (!wsUrl) { console.log('无法连接 Chrome'); child.kill(); return; }

  const cdp = await wsConnect(wsUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: THEME }] });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1800);

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  /* 解锁 + 种数据 */
  await ev(`(async()=>{
    const l1=document.querySelector('#lockPw'), l2=document.querySelector('#lockPw2');
    if(l1) l1.value='MasterPass123'; if(l2) l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b) b.click();
    await new Promise(r=>setTimeout(r,800));
  })()`);
  await sleep(600);
  const seedRes = await ev(`(async()=>{ ${SEED}; return 'seeded'; })()`);
  if (seedRes && seedRes.__err) console.log('SEED ERR: ' + String(seedRes.__err).split('\n')[0]);
  await sleep(400);

  /* 主题强制校正（setEmulatedMedia 偶发不生效） */
  await ev(`(async()=>{
    const want = ` + JSON.stringify(THEME) + `;
    for (let i=0;i<4;i++){
      if (document.documentElement.getAttribute('data-theme') === want) break;
      const b = document.querySelector('#btnTheme');
      if (b) b.click();
      await new Promise(r=>setTimeout(r,200));
    }
    return document.documentElement.getAttribute('data-theme');
  })()`);
  await sleep(900);
  await ev(`(async()=>{ const t=document.querySelector('#toast'); if(t) t.classList.remove('show'); await new Promise(r=>setTimeout(r,300)); })()`);
  await sleep(400);
  const themeNow = await ev("document.documentElement.getAttribute('data-theme')");
  await ev("document.querySelectorAll('.aurora i').forEach(e=>{e.style.animation='none';});");
  await sleep(300);

  /* 记录卡片位置（必须完整落在视口内才能采样） */
  const vh = await ev('window.innerHeight');
  await ev(`window.__regions = [...document.querySelectorAll('#mainList .card')].map(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};}).filter(r=>r.y>=0 && r.y+r.h<=${vh} && r.w>40);`);

  const grab = async (name) => {
    const s = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(s.result.data, 'base64');
    fs.writeFileSync(path.join(OUT, name + '.png'), buf);
    return PNG.sync.read(buf);
  };

  /* --- 四张图，用差分法隔离"背景透光率" ---
     难点：玻璃上还叠着卡片自己的高光图案（::before 径向渐变），
     它与背景无关，会污染任何直接统计。解法是做差：
       背景的变化   = 光场图 − 关掉光场图（无玻璃）
       透过的变化   = 光场图 − 关掉光场图（有玻璃）
     卡片自身图案在两次相减中恒定，自动抵消；
     两者的标准差之比就是玻璃的**透光率 k**（k≈0 表示盖实）。 */
  await ev(`document.querySelectorAll('#mainList .card > *').forEach(e=>{ e.style.visibility='hidden'; });`);
  await sleep(400);
  const glowOn = await grab('scan-glasyon-' + THEME);          /* 光场 + 玻璃 */
  await ev(`document.querySelector('.aurora').style.display='none';`);
  await sleep(350);
  const glowOff = await grab('scan-glowoff-' + THEME);         /* 纯底 + 玻璃 */
  await ev(`document.querySelector('.aurora').style.display='';`);
  await sleep(300);

  await ev(`document.querySelectorAll('#mainList .card').forEach(e=>{ e.style.visibility='hidden'; });`);
  await sleep(350);
  const bareOn = await grab('scan-bareon-' + THEME);           /* 光场 + 其它 UI，无玻璃 */
  await ev(`document.querySelector('.aurora').style.display='none';`);
  await sleep(350);
  const bareOff = await grab('scan-bareoff-' + THEME);         /* 纯底 + 其它 UI，无玻璃 */

  /* 再来一张"只有光场"：上面那些图里还留着顶栏/搜索框/底部统计，
     它们会把断层检测（【A】）污染成几百/255 的假跳变。 */
  await ev(`document.querySelector('.aurora').style.display='';`);
  await ev(`document.querySelectorAll('body > *').forEach(e=>{ if(!e.classList.contains('aurora')) e.style.display='none'; });`);
  await sleep(400);
  const bg = await grab('scan-bg-' + THEME);                   /* 只有光场 */

  const W = bg.width, H = bg.height;
  console.log('==================================================');
  console.log(' 主题: ' + themeNow + '   截图: ' + W + 'x' + H);
  console.log('==================================================');

  /* ---------- A. 背景渐变断层 ---------- */
  console.log('');
  console.log('【A】背景渐变 · 断层检测（阈值 2/255，平滑渐变应几乎无跳变）');
  const cols = [0.08, 0.3, 0.5, 0.7, 0.92].map(f => Math.round(W * f));
  let worstV = 0, totJumpsV = 0;
  for (const x of cols) {
    const pts = []; for (let y = 0; y < H; y++) pts.push({ x, y });
    const r = scanPath(bg, pts);
    worstV = Math.max(worstV, r.maxStep); totJumpsV += r.jumps;
    console.log(`  竖扫 x=${String(x).padStart(3)}  最大跳变 ${String(r.maxStep).padStart(5)}/255  @y=${r.maxAt}   跳变数 ${String(r.jumps).padStart(3)}   最长平坦 ${String(r.maxRun).padStart(3)}px   亮度域 ${r.lo}–${r.hi}`);
  }
  const rows = [0.06, 0.3, 0.5, 0.7, 0.94].map(f => Math.round(H * f));
  let worstH = 0, totJumpsH = 0;
  for (const y of rows) {
    const pts = []; for (let x = 0; x < W; x++) pts.push({ x, y });
    const r = scanPath(bg, pts);
    worstH = Math.max(worstH, r.maxStep); totJumpsH += r.jumps;
    console.log(`  横扫 y=${String(y).padStart(3)}  最大跳变 ${String(r.maxStep).padStart(5)}/255  @x=${r.maxAt}   跳变数 ${String(r.jumps).padStart(3)}   最长平坦 ${String(r.maxRun).padStart(3)}px   亮度域 ${r.lo}–${r.hi}`);
  }
  console.log(`  → 竖扫最大跳变 ${worstV.toFixed(2)}/255 · 累计跳变 ${totJumpsV}`);
  console.log(`  → 横扫最大跳变 ${worstH.toFixed(2)}/255 · 累计跳变 ${totJumpsH}`);

  /* ---------- B. 玻璃透光率（差分法） ---------- */
  console.log('');
  console.log('【B】玻璃透光率 · 差分法（已抵消卡片自身的高光图案）');
  console.log('    k = 背景变化透过玻璃后的强度 / 背景变化的强度');
  console.log('    k → 1 = 完全透明（真玻璃）    k → 0 = 完全盖实（均匀白板）');
  const regions = await ev('JSON.stringify(window.__regions)');
  let list = [];
  try { list = JSON.parse(regions); } catch (e) {}
  if (!list.length) console.log('  (没有完整落在视口内的卡片)');
  const std = a => Math.sqrt(variance(a));
  list.forEach((r, i) => {
    const A = regionLum(glowOn, r), B = regionLum(glowOff, r);
    const C = regionLum(bareOn, r), D = regionLum(bareOff, r);
    const ab = A.map((v, j) => v - B[j]);
    const cd = C.map((v, j) => v - D[j]);
    const sAB = std(ab), sCD = std(cd);
    const k = sCD > 1e-9 ? sAB / sCD : 0;
    console.log(`  卡片#${i + 1}  透光率 k = ${k.toFixed(3)}   后方背景变化 σ ${(sCD * 255).toFixed(1)}/255 (全幅 ${(span(C) * 255).toFixed(1)})   玻璃平均亮度 ${(avg(A) * 255).toFixed(0)}`);
  });

  /* ---------- C. 玻璃面自身的色阶台阶 ---------- */
  console.log('');
  console.log('【C】玻璃面内部 · 色阶台阶与背景台阶（已排除文字）');
  if (list.length) {
    const r = list[0];
    for (const f of [0.15, 0.45, 0.75]) {
      const y = Math.round(r.y + r.h * f);
      const pts = []; for (let x = r.x + 6; x < Math.min(r.x + r.w - 6, W); x++) pts.push({ x, y });
      const sg = scanPath(glowOn, pts), sb = scanPath(bareOn, pts);
      console.log(`  y=+${(r.h * f).toFixed(0)}px  玻璃: 跳变 ${String(sg.maxStep).padStart(4)}/255 平坦 ${String(sg.maxRun).padStart(3)}px  |  背景: 跳变 ${String(sb.maxStep).padStart(4)}/255 平坦 ${String(sb.maxRun).padStart(3)}px`);
    }
  }

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
})();
