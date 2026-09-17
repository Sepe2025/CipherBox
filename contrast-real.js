/* ============================================================
   玻璃对比度实测 · 探针法
   为什么不能用简单采样：
   - 直方图众数 → 玻璃是渐变面，颜色被摊成许多窄色阶，众数不成立
   - "最接近文字色的像素" → 文字抗锯齿边缘本就是前景↔背景的渐变，
     会伪装成"极差背景"（假报 1.2:1）
   - padding 边缘条带 → 会把圆角外的画布、以及没被玻璃盖住的光斑算进来
   - 分位数 → 抗锯齿中间调的对比度低于真实背景，分位数也切不开

   解法：克隆元素样式但**不含文字**，覆盖在原位（原件先 visibility:hidden，
   让探针的 backdrop 取到原始底层），再采样探针 —— 必然是纯背景。
   ============================================================ */
const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
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
const httpGet = url => new Promise((res, rej) => { http.get(url, r => { let s = ''; r.on('data', d => s += d); r.on('end', () => res(s)); }).on('error', rej); });

const SEED = `
  const waitFor = async (fn, ms=5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (fn()) return true; await new Promise(r=>setTimeout(r,50)); }
    throw new Error('waitFor timeout');
  };
  const seed = [
    ['\u5b66\u6821\u6559\u52a1\u7cfb\u7edf','22607010047','Str0ng#Pass!2026','\u5b66\u4e60','https://jw.wit.edu.cn','\u9009\u8bfe\u3001\u67e5\u6210\u7ee9\u3002'],
    ['\u5de5\u5546\u94f6\u884c','6212 2602 0000 1234','Bank#2026!Aa','\u91d1\u878d','https://icbc.com.cn',''],
    ['GitHub','guanhao@example.com','gh_Priv4te!Key','\u5f00\u53d1','https://github.com','']
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
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden, 5000);
    await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1, 5000);
  }
`;

const PROBE_FN = `
window.__probes = [];
/* 第三项是可选的采样区（相对 rect 的 x0,x1,y0,y1 比例）。
   用于绕开元素内部的其它部件 —— 例如 .card-meta 内含 badge，
   采样它会把 badge 的残留边缘当成背景，报出假的低对比度。 */
window.__probeTargets = [
  ['.brand-name','\u5e94\u7528\u540d'],
  ['.brand-status','\u9876\u90e8\u72b6\u6001'],
  ['.chip.on','\u5206\u7c7b chip \u9009\u4e2d'],
  ['.chip:not(.on)','\u5206\u7c7b chip \u672a\u9009'],
  ['.card-title','\u5361\u7247\u6807\u9898'],
  ['.card-meta','\u5361\u7247\u5143\u4fe1\u606f',[0.62,0.99,0.15,0.85]],
  ['.card-meta .badge','\u5206\u7c7b\u5fbd\u7ae0'],
  ['.secret-label','\u8d26\u53f7/\u5bc6\u7801\u6807\u7b7e'],
  ['.secret-val.masked','\u8131\u654f\u503c'],
  ['.act','\u5361\u7247\u52a8\u4f5c\u6309\u94ae'],
  ['.group-head','\u5206\u7ec4\u6807\u9898'],
  ['.fab','FAB \u56fe\u6807'],
  ['.avatar','\u9996\u5b57\u6bcd\u5fbd\u7ae0']
];
window.__makeProbes = function(){
  const _c = document.createElement('canvas'); _c.width = _c.height = 1;
  const _x = _c.getContext('2d', {willReadFrequently:true});
  const toRgb = s => { _x.clearRect(0,0,1,1); _x.fillStyle='#000000'; _x.fillStyle=String(s);
    _x.fillRect(0,0,1,1); const d=_x.getImageData(0,0,1,1).data; return d[3]<8?null:[d[0],d[1],d[2]]; };

  const jobs = [];
  const toHide = [];
  /* 第一遍：收集所有目标 */
  for (const pair of window.__probeTargets){
    const sel = pair[0], label = pair[1];
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    if (r.bottom < 0 || r.top > window.innerHeight) continue;
    const cs = getComputedStyle(el);
    const fg = toRgb(cs.color);
    if (!fg) continue;
    jobs.push({
      label, el, fg, cs,
      fs: parseFloat(cs.fontSize),
      bold: parseInt(cs.fontWeight,10) >= 700,
      br: parseFloat(cs.borderTopLeftRadius) || 0,
      zone: pair[2] || null,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height }
    });
    toHide.push(el);
  }

  /* 第二遍：先统一隐藏**所有**目标元素。
     必须全部隐藏后再插探针 —— 否则探针的 backdrop-filter 会把相邻元素的
     文字模糊着透出来，污染采样（实测会假报 2.66:1）。 */
  toHide.forEach(e => { e.style.visibility = 'hidden'; });

  /* 第三遍：插探针 */
  for (const j of jobs){
    const cs = j.cs;
    const r = j.rect;
    const p = document.createElement('div');
    const props = ['background','background-image','background-color','backdrop-filter',
      '-webkit-backdrop-filter','border-radius','border-color','border-width','border-style',
      'box-shadow','opacity'];
    props.forEach(k => {
      const v = cs.getPropertyValue(k);
      if (v && v !== 'none' && v !== 'normal' && v !== 'auto') {
        try { p.style.setProperty(k, v); } catch(e){}
      }
    });
    p.style.position = 'fixed';
    p.style.left = r.x + 'px';
    p.style.top = r.y + 'px';
    p.style.width = r.w + 'px';
    p.style.height = r.h + 'px';
    p.style.zIndex = '2147483000';
    p.style.pointerEvents = 'none';
    p.style.margin = '0';
    p.style.padding = '0';
    p.setAttribute('data-probe', j.label);
    document.body.appendChild(p);
    window.__probes.push(p);
  }

  return JSON.stringify(jobs.map(j => ({
    label: j.label, fg: j.fg, fs: j.fs, bold: j.bold, br: j.br, zone: j.zone, rect: j.rect
  })));
};
'ready';
`;

(async () => {
  const theme = process.argv[2] || 'dark';
  const port = 9700 + Math.floor(Math.random() * 300);
  const profile = path.join(OUT, 'ct-' + port);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=390,844', 'about:blank'],
    { stdio: ['ignore', 'pipe', 'pipe'] });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    try {
      const list = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list'));
      const pg = list.find(t => t.type === 'page');
      if (pg && pg.webSocketDebuggerUrl) { wsUrl = pg.webSocketDebuggerUrl; break; }
    } catch (e) {}
  }
  if (!wsUrl) { console.log('attach failed'); child.kill(); process.exit(1); }
  const cdp = await wsConnect(wsUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: theme === 'light' ? 'light' : 'dark' }],
  });

  const fileUrl = 'file:///' + FILE.split('/').map((x, i) => i === 0 ? x : encodeURIComponent(x)).join('/');
  await cdp.send('Page.navigate', { url: fileUrl });
  await sleep(1300);

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      return { __err: (d.exception && d.exception.description) || d.text };
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await ev(`(async()=>{
    const l1=document.querySelector('#lockPw'), l2=document.querySelector('#lockPw2');
    if(l1) l1.value='MasterPass123'; if(l2) l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b) b.click();
    await new Promise(r=>setTimeout(r,800));
  })()`);
  await sleep(600);
  const seedRes = await ev(`(async()=>{ ${SEED}; return 'seeded'; })()`);
  if (seedRes && seedRes.__err) console.log('SEED ERR: ' + seedRes.__err.split('\n')[0]);
  /* 主题选择弹层化之后，btnTheme 不再循环切换主题 ——
     直接设 data-theme（CSS 变量即时响应，含新增的自定义主题）并关掉全部弹层，
     保证探针测的是干净的主界面。v1.4 起旧逻辑会卡在弹层上测出伪值。 */
  await ev(`(function(){
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
    document.querySelectorAll('.scrim').forEach(function(s){ s.hidden = true; });
    document.documentElement.classList.remove('scrim-open');
    return document.documentElement.getAttribute('data-theme');
  })()`);
  await sleep(900);
  /* 停掉光斑漂移动画 —— 否则每次截图的背景都不同，测量结果会来回漂，
     上一轮就吃过这个亏：同一份文件两次跑出 11 项 FAIL 和 8 项 FAIL。 */
  await ev(`document.querySelectorAll('.aurora i').forEach(e=>{ e.style.animation='none'; });`);
  await sleep(300);
  await ev(`(async()=>{ const t=document.querySelector('#toast'); if(t) t.classList.remove('show'); await new Promise(r=>setTimeout(r,400)); })()`);
  await sleep(500);

  await ev(PROBE_FN);
  const jobsRaw = await ev(`window.__makeProbes()`);
  if (jobsRaw && jobsRaw.__err) console.log('PROBE ERR: ' + String(jobsRaw.__err).split('\n')[0]);
  const jobs = JSON.parse(jobsRaw);
  await sleep(400);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const b64 = shot.result && shot.result.data;
  if (!b64) { console.log('screenshot failed'); child.kill(); process.exit(1); }

  const analyze = `
(async()=>{
  const JOBS = ${JSON.stringify(jobs)};
  const BASE64 = ${JSON.stringify(b64)};
  const bin = atob(BASE64);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
  const bmp = await createImageBitmap(new Blob([arr], {type:'image/png'}));
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = cv.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  const W = bmp.width, H = bmp.height;
  const img = ctx.getImageData(0, 0, W, H).data;
  const dpr = window.devicePixelRatio || 1;

  const srgb = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const lum = c => 0.2126*srgb(c[0]) + 0.7152*srgb(c[1]) + 0.0722*srgb(c[2]);
  const ratio = (a,b) => { const L1=lum(a), L2=lum(b); const hi=Math.max(L1,L2), lo=Math.min(L1,L2); return (hi+0.05)/(lo+0.05); };

  const out = [];
  for (const j of JOBS){
    const r = j.rect;
    /* 采样区：优先用显式 zone，否则按圆角半径内缩以避开圆角外的画布 */
    let rx0, rx1, ry0, ry1;
    if (j.zone){
      rx0 = r.x + r.w * j.zone[0];
      rx1 = r.x + r.w * j.zone[1];
      ry0 = r.y + r.h * j.zone[2];
      ry1 = r.y + r.h * j.zone[3];
    } else {
      const m = Math.min(r.w, r.h);
      const inset = Math.max(3, Math.min(Math.max((j.br || 0) + 2, m * 0.25), m * 0.35));
      rx0 = r.x + inset; rx1 = r.x + r.w - inset;
      ry0 = r.y + inset; ry1 = r.y + r.h - inset;
    }
    const x0 = Math.max(0, Math.floor(rx0 * dpr));
    const x1 = Math.min(W, Math.ceil(rx1 * dpr));
    const y0 = Math.max(0, Math.floor(ry0 * dpr));
    const y1 = Math.min(H, Math.ceil(ry1 * dpr));
    if (x1 - x0 < 2 || y1 - y0 < 2){ out.push({label:j.label, skip:'inset too large'}); continue; }
    let sr=0, sg=0, sb=0, n=0, worst=null, worstR=Infinity, wpos=null;
    /* 第一遍：收集中位数定位（玻璃背景是平滑的，局部突变必是杂质） */
    const lumHist = [];
    const buf = [];
    for (let y=y0; y<y1; y++){
      for (let x=x0; x<x1; x++){
        const o = (y*W + x)*4;
        if (img[o+3] < 250) continue;
        buf.push(o);
        lumHist.push(lum([img[o], img[o+1], img[o+2]]));
      }
    }
    if (!buf.length){ out.push({label:j.label, skip:'no px'}); continue; }
    lumHist.sort((a,b) => a-b);
    const medL = lumHist[Math.floor(lumHist.length/2)];
    /* 第二遍：剔除与中位亮度差超过 0.055 的像素（残留文字/装饰元素的锐边），
       再用剩下的纯背景像素算均值与最坏值 */
    let dropped = 0;
    for (const o of buf){
      const c = [img[o], img[o+1], img[o+2]];
      if (Math.abs(lum(c) - medL) > 0.055){ dropped++; continue; }
      sr+=c[0]; sg+=c[1]; sb+=c[2]; n++;
      const rr = ratio(c, j.fg);
      if (rr < worstR){ worstR = rr; worst = c; wpos = [ +((o/4)%W/dpr - r.x).toFixed(1), +(Math.floor(o/4/W)/dpr - r.y).toFixed(1) ]; }
    }
    if (!n){ out.push({label:j.label, skip:'all dropped'}); continue; }
    const avg = [sr/n, sg/n, sb/n];
    out.push({
      label: j.label,
      fg: 'rgb(' + j.fg.map(Math.round).join(',') + ')',
      avg: 'rgb(' + avg.map(Math.round).join(',') + ')',
      avgR: +ratio(avg, j.fg).toFixed(2),
      worstBg: 'rgb(' + worst.map(Math.round).join(',') + ')',
      worst: +worstR.toFixed(2),
      worstPos: wpos,
      dropped,
      box: [ +r.w.toFixed(1), +r.h.toFixed(1) ],
      px: n,
      fontSize: j.fs, bold: j.bold
    });
  }
  return JSON.stringify({ viewport: W+'x'+H, theme: document.documentElement.getAttribute('data-theme'), items: out });
})()
  `;

  const res = await ev(analyze);
  if (res && res.__err) { console.log('ANALYZE ERR: ' + String(res.__err).split('\n').slice(0,3).join(' | ')); }
  else {
    const data = JSON.parse(res);
    console.log('=== 玻璃对比度实测（探针法） · ' + data.theme + ' · ' + data.viewport + ' ===');
    console.log('');
    let fails = 0, checks = 0;
    data.items.forEach(it => {
      if (it.skip) { console.log('  SKIP  ' + it.label + '  (' + it.skip + ')'); return; }
      const isLarge = it.fontSize >= 24 || (it.fontSize >= 18.66 && it.bold);
      const min = isLarge ? 3.0 : 4.5;
      const pass = it.worst >= min;
      checks++; if (!pass) fails++;
      console.log('  ' + (pass ? 'PASS  ' : 'FAIL  ') + it.label.padEnd(15) +
        '\u5747 ' + String(it.avgR).padStart(5) + ':1   \u6700\u574f ' + String(it.worst).padStart(5) + ':1   \u9700 ' + min + ':1');
      console.log('        fg=' + it.fg + '  \u5747bg=' + it.avg + '  \u6700\u574fbg=' + it.worstBg);
      console.log('        \u5143\u7d20 ' + it.box[0] + 'x' + it.box[1] + 'px  \u6700\u574f\u70b9\u504f\u79fb ' +
        (it.worstPos ? it.worstPos[0] + ',' + it.worstPos[1] : '-') + '  ' + it.fontSize.toFixed(1) + 'px');
    });
    console.log('');
    console.log(fails === 0 ? ('\u5168\u90e8\u901a\u8fc7 (' + checks + ' \u9879)') : (fails + ' / ' + checks + ' \u9879\u4e0d\u8fbe\u6807'));
  }
  cdp.close(); child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.stack); process.exit(1); });
