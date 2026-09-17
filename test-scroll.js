/* 弹层滚动隔离验证 */
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
  const port = 9300 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'sc-' + port);
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
  /* 种数据：页面要有足够高度，才能测「锁定时滚动位置是否保留」 */
  const sr = await ev(`(async()=>{
    const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('waitFor');};
    const seed=[
      ['淘宝','13800001111','P@ss#2026!Aa','购物','',''],['工商银行','6212 2602 0000 1234','Bank#2026!Aa','金融','',''],
      ['学校教务系统','22607010047','Str0ng#Pass!2026','学习','',''],['GitHub','guanhao@example.com','gh_Key','开发','',''],
      ['招商银行','6214 8300 0000 5678','Cmb#2026!Aa','金融','',''],['网易邮箱','mail@163.com','Net#2026!Aa','工作','',''],
      ['B站','bili@x.com','Bili#2026!Aa','娱乐','',''],['知乎','zhi@x.com','Zhi#2026!Aa','阅读','','']
    ];
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
  if (sr && sr.__err) console.log('SEED ERR: ' + String(sr.__err).split('\n')[0]);
  await sleep(500);

  console.log('=== 弹层滚动隔离验证 ===');
  console.log('');

  /* 打开编辑表单（长内容弹层） */
  await ev(`document.querySelector('#fab').click()`);
  await sleep(500);

  /* 把主界面滚到中间，再打开弹层后检查位置保留 */
  await ev(`window.scrollTo(0, 500);`);
  await sleep(200);

  const st0 = await ev(`JSON.stringify({
    y: window.scrollY, open: !!document.documentElement.className.match(/scrim-open/),
    overflow: getComputedStyle(document.documentElement).overflow
  })`);
  const s0 = JSON.parse(st0);
  check('弹层打开：html 有 scrim-open 类', s0.open === true);
  check('弹层打开：页面滚动锁住（overflow:hidden）', s0.overflow === 'hidden');
  check('弹层打开：滚动位置保留（不跳顶）', s0.y > 300);

  /* sheet 内滚到底 */
  const bottom = await ev(`(function(){
    var sh = document.querySelector('#editOverlay .sheet');
    sh.scrollTop = sh.scrollHeight;
    return sh.scrollTop;
  })()`);
  console.log('  [准备] sheet 已滚到底: scrollTop=' + bottom);

  /* 模拟在 sheet 上继续向上滑（会透传的旧场景） */
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 500, xDistance: 0, yDistance: -300, speed: 2000 });
  await sleep(300);
  const st1 = await ev(`JSON.stringify({ y: window.scrollY, sheetTop: document.querySelector('#editOverlay .sheet').scrollTop })`);
  const s1 = JSON.parse(st1);
  check('弹层内滑到底继续滑：主页面不跟着滚', Math.abs(s1.y - s0.y) < 2);
  check('弹层内滑到底继续滑：弹层停在底部', s1.sheetTop >= bottom - 2);

  /* 手势落在弹层外的遮罩上（顶部区域），主页也不滚 */
  await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 40, xDistance: 0, yDistance: -200, speed: 2000 });
  await sleep(300);
  const st2 = await ev(`JSON.stringify({ y: window.scrollY })`);
  const s2 = JSON.parse(st2);
  check('遮罩区域滑动：主页面不滚', Math.abs(s2.y - s0.y) < 2);

  /* 关闭弹层后滚动恢复 */
  await ev(`document.querySelector('#editClose').click()`);
  await sleep(300);
  const st3 = await ev(`JSON.stringify({
    y: window.scrollY, open: !!document.documentElement.className.match(/scrim-open/),
    overflow: getComputedStyle(document.documentElement).overflow
  })`);
  const s3 = JSON.parse(st3);
  check('关闭弹层：锁类已移除', s3.open === false);
  check('关闭弹层：页面滚动已恢复', s3.overflow !== 'hidden');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'scroll-lock.png'), Buffer.from(shot.result.data, 'base64'));

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
