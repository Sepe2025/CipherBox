/* 锁定漏洞回归测试：弹层 + 明文残留 */
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

const SEED = `
  const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('waitFor');};
  const seed=[['工商银行','6212 2602 0000 1234','P@ss#2026!Aa','金融','','']];
  const set=(s,v)=>{const e=document.querySelector(s);if(!e)return;e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};
  for(let i=0;i<seed.length;i++){const s=seed[i];
    document.querySelector('#fab').click();
    await waitFor(()=>document.querySelector('#editOverlay')&&!document.querySelector('#editOverlay').hidden);
    await new Promise(r=>setTimeout(r,100));
    set('#fName',s[0]);set('#fAccount',s[1]);set('#fPw',s[2]);set('#fCat',s[3]);
    document.querySelector('#saveBtn').click();
    await waitFor(()=>document.querySelector('#editOverlay').hidden,5000);
    await waitFor(()=>document.querySelectorAll('#mainList .card').length===i+1,5000);}
`;

const state = `(function(){
  var g = function(id){ var el = document.getElementById(id); return el ? !el.hidden : null; };
  return JSON.stringify({
    mainScreen: g('mainScreen'), lockScreen: g('lockScreen'),
    edit: g('editOverlay'), settings: g('settingsOverlay'), chpw: g('chpwOverlay'),
    trash: g('trashOverlay'), more: g('moreOverlay'), confirm: g('confirmOverlay'), help: g('helpOverlay'),
    fPw: (document.getElementById('fPw')||{}).value,
    fAccount: (document.getElementById('fAccount')||{}).value,
    fName: (document.getElementById('fName')||{}).value,
    lockZ: getComputedStyle(document.getElementById('lockScreen')).zIndex,
    toastShown: (document.getElementById('toast')||{className:''}).className.indexOf('show')>=0,
    fxPaused: document.documentElement.className.indexOf('fx-paused')>=0,
    aps: (function(){ var e=document.querySelector('.aurora i'); return e?getComputedStyle(e).animationPlayState:'?'; })()
  });
})()`;

let pass = 0, failN = 0;
function check(label, cond) {
  console.log('  ' + (cond ? '✅' : '❌') + ' ' + label);
  cond ? pass++ : failN++;
}

(async () => {
  const port = 9450 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'lk-' + port);
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
  await ev(`(async()=>{const l1=document.querySelector('#lockPw'),l2=document.querySelector('#lockPw2');
    if(l1)l1.value='MasterPass123'; if(l2)l2.value='MasterPass123';
    const b=document.querySelector('#lockBtn'); if(b)b.click(); await new Promise(r=>setTimeout(r,800));})()`);
  await sleep(600);
  const sr = await ev(`(async()=>{ ${SEED}; return 'ok'; })()`);
  if (sr && sr.__err) console.log('SEED ERR: ' + String(sr.__err).split('\n')[0]);
  await sleep(500);

  const S = async () => { const r = await ev(state); return JSON.parse(r); };
  const lock = async () => { await ev(`document.querySelector('#btnLock').click()`); await sleep(500); };
  const unlock = async () => {
    await ev(`document.querySelector('#lockPw').value='MasterPass123';
      document.querySelector('#lockBtn').click()`);
    await sleep(700);
  };
  const openEdit = async () => {
    await ev(`document.querySelector('#fab').click()`); await sleep(500);
    /* ⚠️ Runtime.evaluate 按 classic script 解析，不支持顶层 await ——
       必须包成 async IIFE，否则整段静默不执行（第一次跑就栽在这） */
    await ev(`(async()=>{
      var f=document.querySelector('#fName'); f.value='测试记录';
      f.dispatchEvent(new Event('input',{bubbles:true}));
      var a=document.querySelector('#fAccount'); a.value='user@example.com';
      a.dispatchEvent(new Event('input',{bubbles:true}));
      var p=document.querySelector('#fPw'); p.value='Plaintext#Secret!99';
      p.dispatchEvent(new Event('input',{bubbles:true}));
      var eye=document.querySelector('#fPwEye'); if(eye) eye.click();
      await new Promise(r=>setTimeout(r,150));
    })()`);
    await sleep(300);
  };
  const openMore = async () => {
    await ev(`var c=document.querySelector('#mainList .card .icon-btn[data-more], #mainList .card [data-more]');
      if(c) c.click();`); await sleep(500);
  };
  const openTrash = async () => { await ev(`document.querySelector('#btnTrash').click()`); await sleep(500); };
  const openChPw = async () => {
    await ev(`document.querySelector('#btnSettings').click()`); await sleep(400);
    await ev(`document.querySelector('#btnChPw').click()`); await sleep(400);
  };

  console.log('=== 锁定漏洞回归 ===');
  console.log('');

  /* A. 最坏情况：编辑表单开着、密码正显示 */
  await openEdit();
  let st = await S();
  if (!(st.edit === true && st.fPw === 'Plaintext#Secret!99'))
    console.log('  [调试] A0 前置未成立: ' + JSON.stringify(st));
  check('A0 前置：编辑表单已打开且密码明文显示', st.edit === true && st.fPw === 'Plaintext#Secret!99');

  await lock();
  st = await S();
  check('A1 锁屏已显示', st.lockScreen === true && st.mainScreen === false);
  check('A2 编辑弹层已关闭', st.edit === false);
  check('A3 表单明文已清空（fPw）', st.fPw === '');
  check('A4 表单明文已清空（fAccount）', st.fAccount === '');
  check('A5 表单明文已清空（fName）', st.fName === '');
  check('A6 toast 已隐藏', st.toastShown === false);
  check('A6.5 锁屏时光场动画已暂停（fx-paused）', st.fxPaused === true && st.aps === 'paused');
  check('A7 锁屏 z-index = 600', st.lockZ === '600');
  const shotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'lock-edit.png'), Buffer.from(shotA.result.data, 'base64'));

  /* 解锁回来 */
  await unlock();

  /* B. 回收站开着时锁定 */
  await openTrash();
  await lock();
  st = await S();
  check('B1 回收站弹层已随锁定关闭', st.trash === false && st.lockScreen === true);
  await unlock();

  /* C. 修改主密码表单（产品行为：打开它时会替换掉设置层，不是嵌套） */
  await openChPw();
  st = await S();
  if (st.chpw !== true)
    console.log('  [调试] C0 前置未成立: ' + JSON.stringify(st));
  check('C0 前置：修改主密码弹层已打开', st.chpw === true);
  /* 填入明文，验证锁定时会清 */
  await ev(`(function(){
    var ins = document.querySelectorAll('#chpwOverlay input[type=password]');
    ins.forEach(function(o,i){ o.value = 'Old#Pw' + i; o.dispatchEvent(new Event('input',{bubbles:true})); });
  })()`);
  const before = await ev(`JSON.stringify([...document.querySelectorAll('#chpwOverlay input[type=password]')].map(function(o){return o.value;}))`);
  console.log('  [确认] 锁定前已填入: ' + before);
  await lock();
  st = await S();
  check('C1 修改主密码层已关', st.chpw === false);
  check('C2 设置层已关', st.settings === false);
  const chpwVal = await ev(`JSON.stringify([...document.querySelectorAll('#chpwOverlay input')].map(function(i){return i.value;}))`);
  check('C3 修改主密码表单明文已清空', !JSON.parse(chpwVal).some(function(v){ return v; }) ? true : (console.log('  [残留] ' + chpwVal), false));
  await unlock();

  /* D. 更多菜单 */
  await openMore();
  await lock();
  st = await S();
  check('D1 更多菜单已随锁定关闭', st.more === false);
  await unlock();

  /* E. 锁定后再解锁，编辑功能不受影响 */
  await openEdit();
  st = await S();
  check('E1 解锁后编辑表单可正常打开', st.edit === true);
  await ev(`document.querySelector('#editClose').click()`); await sleep(300);

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
