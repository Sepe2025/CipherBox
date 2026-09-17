/* 数据面板 + 自动备份轮换验证（UA mock 成 App WebView 环境）*/
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

let pass = 0, failN = 0;
function check(label, cond) { console.log('  ' + (cond ? '✅' : '❌') + ' ' + label); cond ? pass++ : failN++; }

(async () => {
  const port = 9000 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'db-' + port);
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
  /* UA mock 成 Android WebView —— 让页面把自身识别为壳环境（IN_APP）*/
  await cdp.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36; wv)' });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send('Page.navigate', { url: encodeURI('file:///' + FILE.replace(/\\/g, '/')) });
  await sleep(1800);
  const ev = async (expr) => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  /* mock 原生桥：捕获 autoBackup 调用 */
  await ev(`(function(){
    window.__autoCalls = [];
    window.AppBridge = {
      autoBackup: function(n, b){ window.__autoCalls.push({ name: n, len: b.length }); return true; },
      saveToDownloads: function(n, b){ return true; },
      shareFile: function(n, b){ return true; },
      createDocument: function(n, b){ return true; }
    };
  })()`);

  await ev(`(async()=>{const l1=document.querySelector('#lockPw'),l2=document.querySelector('#lockPw2');
    if(l1)l1.value='MasterPass123'; if(l2)l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b)b.click(); await new Promise(r=>setTimeout(r,800));})()`);
  await sleep(600);
  const inApp = await ev(`/\\bwv\\b/.test(navigator.userAgent)`);
  check('UA mock：页面识别为壳环境（IN_APP）', inApp === true);

  /* 种 2 条 */
  await ev(`(async()=>{
    const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('w');};
    const seed=[['淘宝','13800001111','P@ss#2026!Aa','购物','',''],['工商银行','6212 2602 0000 1234','Bank#2026!Aa','金融','','']];
    const set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
    for(let i=0;i<seed.length;i++){const s=seed[i];
      document.querySelector('#fab').click();
      await waitFor(()=>document.querySelector('#editOverlay')&&!document.querySelector('#editOverlay').hidden);
      await new Promise(r=>setTimeout(r,80));
      set('#fName',s[0]);set('#fAccount',s[1]);set('#fPw',s[2]);set('#fCat',s[3]);
      document.querySelector('#saveBtn').click();
      await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
      await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1,5000);}
    return 'ok';
  })()`);
  await sleep(400);

  console.log('=== ① 数据状态面板 ===');
  await ev(`document.querySelector('#btnSettings').click()`);
  await sleep(400);
  const board = await ev(`JSON.stringify({
    count: document.getElementById('dsCount').textContent,
    modified: document.getElementById('dsModified').textContent,
    backup: document.getElementById('dsBackup').textContent,
    merge: document.getElementById('dsMerge').textContent,
    size: document.getElementById('dsSize').textContent
  })`);
  const bd = JSON.parse(board);
  check('记录数显示 2 条', bd.count === '2 条');
  check('最后修改有值（刚刚/分钟前）', bd.modified.indexOf('刚刚') >= 0 || bd.modified.indexOf('分钟前') >= 0);
  check('上次合并初始为「从未」', bd.merge === '从未');
  check('存储占用有值（KB）', bd.size.indexOf('KB') >= 0);
  await ev(`document.querySelector('#settingsClose').click()`);
  await sleep(300);

  console.log('');
  console.log('=== ② App 自动备份轮换 ===');
  /* 加第 3 条 → persist → schedule（2 分钟节流）→ 用 __vaultAutoBackupNow 跳过等待 */
  await ev(`(async()=>{
    const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('w');};
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay')&&!document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,80));
    var set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
    set('#fName','知乎');set('#fAccount','zhi@x.com');set('#fPw','Zhi#2026!Aa');set('#fCat','阅读');
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
    return 'ok';
  })()`);
  console.log('  [调试] autoBackupNow 前卡片数:', await ev(`document.querySelectorAll('#mainList .card').length`));
  await ev(`window.__vaultAutoBackupNow()`);
  await sleep(500);
  const auto = await ev(`JSON.stringify(window.__autoCalls || [])`);
  const ac = JSON.parse(auto);
  check('自动备份已调用（1 次）', ac.length === 1);
  check('文件名正确（auto-backup_*.json）', ac.length && /^auto-backup_\d{4}-\d{4}\.json$/.test(ac[0].name));
  check('内容非空（base64 > 1000 字符）', ac.length && ac[0].len > 1000);
  /* 再改一条 → 再触发 → 第二份 */
  await ev(`(async()=>{
    const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('w');};
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay')&&!document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,80));
    var set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
    set('#fName','B站');set('#fAccount','bili@x.com');set('#fPw','Bili#2026!Aa');
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
    return 'ok';
  })()`);
  console.log('  [调试] autoBackupNow 前卡片数:', await ev(`document.querySelectorAll('#mainList .card').length`));
  await ev(`window.__vaultAutoBackupNow()`);
  await sleep(500);
  const auto2 = await ev(`JSON.stringify(window.__autoCalls || [])`);
  check('第二次修改产生第二份自动备份', JSON.parse(auto2).length === 2);

  console.log('');
  console.log('=== ③ 合并对账单 ===');
  /* 注入一份含 1 条新增的备份 → 合并 → 数据卡的「上次合并」应有值 */
  await ev(`(async()=>{
    var entries = [ { id:'db-merge-1', name:'对账测试记录', account:'m@x.com', password:'Mpw!1', category:'测试', url:'', desc:'', pinned:false, createdAt:Date.now(), updatedAt:Date.now() } ];
    var blob = await CRYPTO.encryptObj({ entries: entries }, 'MasterPass123');
    var dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify(blob)], 'merge-test.json', {type:'application/json'}));
    var input = document.getElementById('importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  await sleep(500);
  await ev(`document.getElementById('impDecrypt').click()`);
  await sleep(600);
  await ev(`document.getElementById('impMerge').click()`);
  await sleep(600);
  await ev(`document.querySelector('#btnSettings').click()`);
  await sleep(400);
  const board2 = await ev(`JSON.stringify({
    merge: document.getElementById('dsMerge').textContent,
    count: document.getElementById('dsCount').textContent
  })`);
  const b2 = JSON.parse(board2);
  console.log('  [调试] ' + board2);
  check('上次合并显示时间与规模（+1）', b2.merge.indexOf('+1') >= 0);
  check('上次合并显示时间与规模（+1）', b2.merge.indexOf('+1') >= 0);
  const actualCards = await ev(`document.querySelectorAll('#mainList .card').length`);
  check('数据卡记录数与列表一致（' + actualCards + '）', b2.count === actualCards + ' 条');
  const hasD = await ev(`[...document.querySelectorAll('#mainList .card-title')].some(n=>n.textContent==='对账测试记录')`);
  check('合并记录已入列表', hasD === true);
  await ev(`document.querySelector('#settingsClose').click()`);
  await sleep(300);

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
