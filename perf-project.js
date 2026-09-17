/* 项目实际帧率：加载真实页面 → 解锁 → 造数据 → 滚动采样 */
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
  const waitFor = async (fn, ms=5000) => { const t0=Date.now();
    while (Date.now()-t0<ms){ if(fn()) return true; await new Promise(r=>setTimeout(r,50)); }
    throw new Error('timeout'); };
  const names=[['\u5b66\u6821\u6559\u52a1\u7cfb\u7edf','22607010047','Str0ng#Pass!2026','\u5b66\u4e60'],
    ['\u5de5\u5546\u94f6\u884c','6212260200001234','Bank#2026!Aa','\u91d1\u878d'],
    ['GitHub','guanhao@example.com','gh_Priv4te!Key','\u5f00\u53d1'],
    ['\u6dd8\u5b9d','13800001111','taobao123','\u8d2d\u7269'],
    ['\u6821\u56ed VPN','22607010047','Wit@Vpn#2026','\u5b66\u4e60'],
    ['\u5fae\u4fe1','13800001111','Wx#2026!Pass','\u793e\u4ea4'],
    ['\u767e\u5ea6\u7f51\u76d8','guanhao','Bd#2026!Disk','\u5de5\u5177'],
    ['\u652f\u4ed8\u5b9d','13800001111','Ali#2026!Pay','\u91d1\u878d']];
  const set=(sel,v)=>{const el=document.querySelector(sel); if(!el) throw new Error('missing '+sel);
    el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));};
  for(let i=0;i<names.length;i++){
    const s=names[i];
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay') && !document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,110));
    set('#fName',s[0]); set('#fAccount',s[1]); set('#fPw',s[2]); set('#fCat',s[3]);
    if(document.querySelector('#fUrl')) set('#fUrl','https://example.com');
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
    await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1,5000);
  }
`;

(async () => {
  const port = 9950 + Math.floor(Math.random() * 40);
  const profile = path.join(OUT, 'pf-' + port);
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
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });

  const fileUrl = 'file:///' + FILE.split('/').map((x, i) => i === 0 ? x : encodeURIComponent(x)).join('/');
  await cdp.send('Page.navigate', { url: fileUrl });
  await sleep(1400);

  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) {
      const d = r.result.exceptionDetails;
      return { __err: (d.exception && d.exception.description) || d.text };
    }
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await ev(`(async()=>{ const a=document.querySelector('#lockPw'),b=document.querySelector('#lockPw2');
    if(a)a.value='MasterPass123'; if(b)b.value='MasterPass123';
    const c=document.querySelector('#lockBtn'); if(c)c.click(); await new Promise(r=>setTimeout(r,800)); })()`);
  await sleep(600);
  const seeded = await ev(`(async()=>{ ${SEED}; return 'ok'; })()`);
  if (seeded && seeded.__err) console.log('SEED ERR: ' + String(seeded.__err).split('\n')[0]);
  await sleep(900);

  /* 滚动采样：分别测「折射开启」与「折射关闭」两种状态 */
  const measure = async (disable) => {
    await ev(`(async()=>{
      document.documentElement.classList.toggle('lg-off', ${disable ? 'true' : 'false'});
      window.scrollTo(0,0);
      await new Promise(r=>setTimeout(r,400));
    })()`);
    const r = await ev(`(async()=>{
      const deltas=[]; let last=performance.now(), stop=false;
      const tick=(now)=>{ if(stop) return; deltas.push(now-last); last=now;
        window.scrollBy(0,36);
        if(window.scrollY+window.innerHeight>=document.documentElement.scrollHeight-4) window.scrollTo(0,0);
        requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      await new Promise(r=>setTimeout(r,2600)); stop=true;
      deltas.shift(); deltas.sort((a,b)=>a-b);
      const med=deltas[Math.floor(deltas.length/2)]||0;
      const p95=deltas[Math.floor(deltas.length*0.95)]||0;
      const cards=document.querySelectorAll('#mainList .card').length;
      return JSON.stringify({ cards, median:+med.toFixed(2), p95:+p95.toFixed(2), fps: med?+(1000/med).toFixed(1):0 });
    })()`);
    return r && r.__err ? { err: String(r.__err).split('\n')[0] } : JSON.parse(r);
  };

  /* 先注入一个用于对照的"关闭折射"开关 */
  await ev(`(async()=>{
    const st=document.createElement('style');
    st.textContent='.lg-off .topbar::before,.lg-off .fab::before,.lg-off .sheet::before,.lg-off .lock-card::before,.lg-off #toast::before{content:none !important;}';
    document.head.appendChild(st);
  })()`);

  const withLg = await measure(false);
  const noLg = await measure(true);

  console.log('=== 项目实测 · 8 张卡 + 40 个按钮 ===');
  console.log('  折射开启 : ' + JSON.stringify(withLg));
  console.log('  折射关闭 : ' + JSON.stringify(noLg));
  if (withLg.fps && noLg.fps) {
    console.log('  折损     : ' + ((withLg.median / noLg.median - 1) * 100).toFixed(1) + '%');
  }

  cdp.close(); child.kill();
  await sleep(300);
  process.exit(0);
})().catch(e => { console.log('ERR ' + e.stack); process.exit(1); });
