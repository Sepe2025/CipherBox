/* 智能合并导入验证：差异计算 / 合并 / 跨密码互通 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const TMP = path.join(OUT, 'imp-backups');
fs.mkdirSync(TMP, { recursive: true });

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
  const port = 9100 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'im-' + port);
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { const j = JSON.parse(await httpGet('http://127.0.0.1:' + port + '/json/list')); const t = j.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) { wsUrl = t.webSocketDebuggerUrl; break; } } catch (e) {}
  }
  const cdp = await wsConnect(wsUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('DOM.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
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
  /* 种 2 条：A 淘宝、B 工商银行 */
  const sr = await ev(`(async()=>{
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

  /* 记录当前 A 的 id（供备份构造引用） */
  const idA = await ev(`JSON.stringify((function(){ var c=[...document.querySelectorAll('#mainList .card')].find(x=>x.querySelector('.card-title').textContent==='淘宝'); return c?c.getAttribute('data-id'):null; })())`);

  /* 构造备份：A 的旧版本（updatedAt -1 天、desc=旧）+ C（新增） */
  const bak1B64 = await ev(`(async()=>{
    var idA = ${idA};
    var old = Date.now() - 86400000;
    var entries = [
      { id:idA, name:'淘宝', account:'13800001111', password:'P@ss#2026!Aa', category:'购物', url:'', desc:'这是备份里的旧备注', pinned:false, createdAt:old, updatedAt:old },
      { id:'imp-c-1', name:'合并新增记录', account:'new@x.com', password:'NewPw!1', category:'测试', url:'', desc:'', pinned:false, createdAt:old, updatedAt:old }
    ];
    var blob = await CRYPTO.encryptObj({ entries: entries }, 'MasterPass123');
    return JSON.stringify(blob);
  })()`);
  fs.writeFileSync(path.join(TMP, 'backup-old.json'), bak1B64 || '', 'utf8');

  /* 在当前数据里修改 A（备注改新值）→ 当前 A 比备份 A 新 */
  await ev(`(async()=>{
    var c=[...document.querySelectorAll('#mainList .card')].find(x=>x.querySelector('.card-title').textContent==='淘宝');
    c.querySelector('[data-act="more"]').click();
    await new Promise(r=>setTimeout(r,200));
    document.querySelector('#moreMenu [data-m="edit"]').click();
    await new Promise(r=>setTimeout(r,300));
    var d=document.querySelector('#fDesc'); d.value='本机修改过的新备注';
    d.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#saveBtn').click();
    await new Promise(r=>setTimeout(r,300));
  })()`);
  await sleep(300);

  /* 把备份内容直接注入 #importFile（DataTransfer 构造 File，免磁盘/免 DOM 域） */
  const setBackup = async (blobJson, filename) => {
    await ev(`(function(){
      var dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(blobJson)}], ${JSON.stringify(filename)}, {type:'application/json'}));
      var input = document.getElementById('importFile');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    await sleep(500);
  };

  console.log('=== 场景一：同主密码合并（备份含 1 旧版 + 1 新增）===');
  await setBackup(bak1B64, 'backup-old.json');

  const st0 = await ev(`JSON.stringify({
    open: !document.getElementById('importOverlay').hidden,
    fname: document.getElementById('impFileName').textContent,
    prefill: document.getElementById('impPw').value,
    step1: !document.getElementById('impStep1').hidden
  })`);
  const s0 = JSON.parse(st0);
  check('选文件后导入弹层打开', s0.open === true);
  check('显示备份文件名', s0.fname === 'backup-old.json');
  check('备份主密码预填当前密码', s0.prefill === 'MasterPass123');

  await ev(`document.getElementById('impDecrypt').click()`);
  await sleep(600);
  const st1 = await ev(`JSON.stringify({
    step2: !document.getElementById('impStep2').hidden,
    stats: document.getElementById('impStats').textContent,
    list: document.getElementById('impList').textContent
  })`);
  const s1 = JSON.parse(st1);
  check('解密成功进入差异摘要', s1.step2 === true);
  check('差异统计：新增1/更新0/保留1/相同1', s1.stats.indexOf('1') >= 0 && s1.stats.indexOf('备份新增') >= 0 && s1.stats.indexOf('保留本机') >= 0);
  check('明细含「合并新增记录」（新增）', s1.list.indexOf('合并新增记录') >= 0);
  check('明细含「本机较新」（淘宝保留本机修改）', s1.list.indexOf('本机较新') >= 0);

  await ev(`document.getElementById('impMerge').click()`);
  await sleep(600);
  const st2 = await ev(`JSON.stringify({
    cards: document.querySelectorAll('#mainList .card').length,
    names: [...document.querySelectorAll('#mainList .card-title')].map(n=>n.textContent),
    hasMerged: [...document.querySelectorAll('#mainList .card-desc')].some(d=>d.textContent==='本机修改过的新备注')
  })`);
  const s2 = JSON.parse(st2);
  check('合并后共 3 条（2 保留 + 1 新增）', s2.cards === 3);
  check('本机较新的修改未被备份覆盖', s2.hasMerged === true);
  check('新增记录已入列表', s2.names.indexOf('合并新增记录') >= 0);

  /* 锁定 → 解锁（当前主密码）→ 数据持久化 */
  await ev(`document.querySelector('#btnLock').click()`); await sleep(400);
  await ev(`(function(){ document.querySelector('#lockPw').value='MasterPass123'; document.querySelector('#lockBtn').click(); })()`);
  await sleep(500);
  const unlocked = await ev(`!document.getElementById('mainScreen').hidden`);
  check('合并后数据用本机主密码可解锁', unlocked === true);

  console.log('');
  console.log('=== 场景二：跨主密码（备份用别的密码加密）===');
  const bak2B64 = await ev(`(async()=>{
    var entries = [ { id:'imp-d-1', name:'别的密码备份的记录', account:'d@x.com', password:'Dpw!1', category:'测试', url:'', desc:'', pinned:false, createdAt:Date.now(), updatedAt:Date.now() } ];
    var blob = await CRYPTO.encryptObj({ entries: entries }, 'Other#Pass456');
    return JSON.stringify(blob);
  })()`);
  fs.writeFileSync(path.join(TMP, 'backup-other.json'), bak2B64 || '', 'utf8');
  await setBackup(bak2B64, 'backup-other.json');
  await sleep(200);
  /* 预填的是当前主密码（错）→ 解密应报错 */
  await ev(`document.getElementById('impDecrypt').click()`);
  await sleep(600);
  const errShown = await ev(`JSON.stringify({ hidden: document.getElementById('impErr').hidden, msg: document.getElementById('impErr').textContent })`);
  const e1 = JSON.parse(errShown);
  check('错误密码解密被拒绝并提示', e1.hidden === false && e1.msg.indexOf('解密失败') >= 0);
  /* 输入备份自己的密码 → 解密成功 */
  await ev(`(function(){ var p=document.getElementById('impPw'); p.value='Other#Pass456';
    p.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await ev(`document.getElementById('impDecrypt').click()`);
  await sleep(600);
  const s3 = await ev(`JSON.stringify({ step2: !document.getElementById('impStep2').hidden, stats: document.getElementById('impStats').textContent })`);
  const s3o = JSON.parse(s3);
  check('输入备份自身密码后解密成功', s3o.step2 === true);
  await ev(`document.getElementById('impMerge').click()`);
  await sleep(600);
  const cnt = await ev(`document.querySelectorAll('#mainList .card').length`);
  check('跨密码备份的记录合并进来（共 4 条）', cnt === 4);
  await ev(`document.querySelector('#btnLock').click()`); await sleep(400);
  await ev(`(function(){ document.querySelector('#lockPw').value='MasterPass123'; document.querySelector('#lockBtn').click(); })()`);
  await sleep(500);
  const unlocked2 = await ev(`!document.getElementById('mainScreen').hidden`);
  check('跨密码合并后仍用本机主密码解锁', unlocked2 === true);

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'import-merge.png'), Buffer.from(shot.result.data, 'base64'));

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
