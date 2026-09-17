'use strict';
const { execSync } = require('child_process');
const W = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/';
function sh(c, t) {
  try { return { ok: true, out: execSync(c, { cwd: W, encoding: 'utf8', timeout: t || 180000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }; }
  catch (e) { return { ok: false, out: (((e.stdout || '') + (e.stderr || '') + (e.message || '')).trim()).slice(0, 900) }; }
}
let r;
r = sh('git config http.proxy http://127.0.0.1:7897');
console.log('仓库级 http.proxy:', r.ok ? 'OK' : r.out);
r = sh('git config https.proxy http://127.0.0.1:7897');
console.log('仓库级 https.proxy:', r.ok ? 'OK' : r.out);
console.log('');
console.log('=== push（走 127.0.0.1:7897 代理；若弹出 GitHub 登录窗口请完成授权）===');
r = sh('git push -u origin main', 300000);
console.log(r.ok ? ('PUSH 成功:\n' + r.out) : ('PUSH 结果:\n' + r.out));
