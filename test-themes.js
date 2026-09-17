/* 8 主题逐个截图 + 主题弹层预览 */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), net = require('net'), crypto = require('crypto');
const { spawn } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const OUT = path.join(__dirname, 'shots', 'themes');
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

const THEMES = ['dark','light','pink-drink','pink-ice','green-gold','starbucks','coffee','midnight'];
const NAMES = { dark:'深空', light:'晨雾', 'pink-drink':'饮品粉', 'pink-ice':'草莓雪', 'green-gold':'咖啡绿金', starbucks:'星巴克', coffee:'咖啡棕', midnight:'暗夜' };

(async () => {
  const port = 9200 + Math.floor(Math.random() * 90);
  const profile = path.join(OUT, 'p-' + port);
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
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
  await ev(`(async()=>{
    const waitFor=async(fn,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(fn())return true;await new Promise(r=>setTimeout(r,50));}throw new Error('waitFor');};
    const seed=[['淘宝','13800001111','P@ss#2026!Aa','购物','',''],['工商银行','6212 2602 0000 1234','Bank#2026!Aa','金融','',''],['学校教务系统','22607010047','Str0ng#Pass!2026','学习','','']];
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
  /* 关掉动画便于观察 */
  await ev(`document.querySelectorAll('.aurora i').forEach(e=>{e.style.animation='none';});`);
  await sleep(200);

  console.log('=== 八主题逐个截图（390×844 @2x）===');
  for (const t of THEMES) {
    await ev(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(t)});`);
    await sleep(600);   /* 玻璃过渡 + 光场过渡 */
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, t + '.png'), Buffer.from(shot.result.data, 'base64'));
    console.log('  ' + (NAMES[t] || t).padEnd(8) + ' → ' + t + '.png');
  }

  /* 主题弹层（预览卡网格） */
  await ev(`document.documentElement.setAttribute('data-theme', 'dark');`);
  await sleep(400);
  await ev(`document.querySelector('#btnTheme').click()`);
  await sleep(500);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, '_theme-picker.png'), Buffer.from(shot.result.data, 'base64'));
  console.log('  主题弹层 → _theme-picker.png');

  /* 切换联动验证：点卡片后 data-theme 是否变化 */
  const sw = await ev(`(function(){
    var card = document.querySelector('.theme-card[data-t="pink-drink"]');
    card.click();
    return document.documentElement.getAttribute('data-theme');
  })()`);
  console.log('');
  console.log('点击「饮品粉」卡片后 data-theme =', sw, sw === 'pink-drink' ? '✅' : '❌');
  const swBack = await ev(`(function(){
    document.querySelector('.theme-card[data-t="dark"]').click();
    return document.documentElement.getAttribute('data-theme');
  })()`);
  console.log('点回「深空」后 data-theme =', swBack, swBack === 'dark' ? '✅' : '❌');

  cdp.close(); child.kill();
  await sleep(300);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  console.log('完成，截图在 ' + OUT);
})();
