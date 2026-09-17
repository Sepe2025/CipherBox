/* 导出菜单验证：能力检测 / 三个去向 / 与旧功能回归 */
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
  const seed=[['淘宝','13800001111','P@ss#2026!Aa','购物','',''],['工商银行','6212 2602 0000 1234','P@ss#2026!Aa','金融','','']];
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

let pass = 0, failN = 0;
function check(label, cond) { console.log('  ' + (cond ? '✅' : '❌') + ' ' + label); cond ? pass++ : failN++; }

(async () => {
  const port = 9400 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'ex-' + port);
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

  console.log('=== 导出菜单验证 ===');
  console.log('');

  /* 打开导出弹层（走设置 → 导出） */
  const caps = await ev(`(async()=>{
    document.querySelector('#btnSettings').click();
    await new Promise(r=>setTimeout(r,300));
    document.querySelector('#btnExport').click();
    await new Promise(r=>setTimeout(r,300));
    var q = function(id){ var el=document.getElementById(id); return el ? !el.hidden : null; };
    var cap = function(id){ var el=document.getElementById(id); return el ? el.classList.contains('disabled') : null; };
    return JSON.stringify({
      settings: q('settingsOverlay'), exportOpen: q('exportOverlay'),
      pickerDisabled: cap('expPicker'), shareDisabled: cap('expShare'),
      hasPicker: !!window.showSaveFilePicker,
      hasShare: !!(navigator.canShare && navigator.canShare({files:[new File([''],'t.json',{type:'application/json'})]}))
    });
  })()`);
  const c = JSON.parse(caps);
  check('设置弹层已关闭', c.settings === false);
  check('导出弹层已打开', c.exportOpen === true);
  check('能力检测：picker 状态与实际一致', c.pickerDisabled === !c.hasPicker);
  check('能力检测：share 状态与实际一致', c.shareDisabled === !c.hasShare);
  console.log('  [环境] showSaveFilePicker=' + c.hasPicker + '  canShare(files)=' + c.hasShare);

  /* 截图（菜单外观） */
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, 'export-menu.png'), Buffer.from(shot.result.data, 'base64'));

  /* 点"保存到下载"，验证 afterExport 生效（exportNote 变"今天已导出"） */
  const after = await ev(`(async()=>{
    document.querySelector('#expDownload').click();
    await new Promise(r=>setTimeout(r,300));
    var note = document.getElementById('exportNote');
    return JSON.stringify({ note: note ? note.textContent : null, overlay: !document.getElementById('exportOverlay').hidden });
  })()`);
  const a = JSON.parse(after);
  check('下载去向执行后：备份时间更新为刚导出', !!a.note && a.note.indexOf('上次导出') === 0);
  check('执行后弹层已关闭', a.overlay === false);

  /* 关闭弹层路径 */
  await ev(`document.querySelector('#btnExport').click()`); await sleep(300);
  await ev(`document.querySelector('#exportClose').click()`); await sleep(200);
  const closed = await ev(`document.getElementById('exportOverlay').hidden`);
  check('右上角关闭可用', closed === true);

  /* 回归：拼音 + 重复 */
  console.log('');
  console.log('=== 既有功能回归 ===');
  await ev(`document.getElementById('exportOverlay').hidden = true;`);
  await ev(`document.getElementById('settingsOverlay').hidden = true;`);
  for (const [q, want] of [['tb', '淘宝'], ['gsyh', '工商银行']]) {
    const r = await ev(`(async()=>{
      var el=document.querySelector('#search'); el.value=${JSON.stringify(q)};
      el.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>setTimeout(r,120));
      return JSON.stringify([...document.querySelectorAll('#mainList .card-title')].map(n=>n.textContent));
    })()`);
    const list = JSON.parse(r);
    check('拼音 "' + q + '" → ' + want, list.indexOf(want) >= 0);
  }
  const dup = await ev(`JSON.stringify((function(){
    var q = document.querySelector('#search').value;
    var flags = [...document.querySelectorAll('#mainList .dup-flag')].map(function(f){return f.textContent.trim();});
    var titles = [...document.querySelectorAll('#mainList .card-title')].map(n=>n.textContent);
    var dupKeys = (typeof dupInfo === 'object') ? Object.keys(dupInfo) : null;
    return { q: q, titles: titles, flags: flags, dupKeys: dupKeys };
  })())`);
  console.log('  [调试] ' + dup);
  const dupArr = JSON.parse(dup).flags;
  /* 搜索过滤后列表只剩"工商银行"一张卡，所以是 1 个标记；计数"2 处"来自全量比对 */
  check('重复密码标记存在且计数正确', dupArr.length === 1 && dupArr[0].indexOf('2 处') >= 0);

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  console.log('');
  console.log('结果: PASS ' + pass + ' / FAIL ' + failN);
})();
