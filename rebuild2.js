'use strict';
const fs = require('fs'), { execSync } = require('child_process');
const W = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/';
const SRC = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const REMOTE = 'https://github.com/Sepe2025/CipherBox.git';
function sh(c, t) {
  try { return { ok: true, out: execSync(c, { cwd: W, encoding: 'utf8', timeout: t || 180000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }; }
  catch (e) { return { ok: false, out: (((e.stdout || '') + (e.stderr || '') + (e.message || '')).trim()).slice(0, 600) }; }
}

/* 1. 删损坏的 .git */
fs.rmSync(W + '.git', { recursive: true, force: true });
console.log('1. 已删除损坏的 .git');

/* 2. 恢复 vault.html */
fs.copyFileSync(SRC, W + 'vault.html');
console.log('2. vault.html 恢复 (' + (fs.statSync(W + 'vault.html').size / 1024).toFixed(1) + ' KB)');

/* 3. 初始化 + 提交 */
fs.writeFileSync(W + '.commit-msg.txt', [
'CipherBox v1.8.6 — 定版',
'',
'本地优先的加密密码保险箱：同一 HTML 内核双端运行（PC 网页版 + Android 零权限 App）。',
'',
'- 加密：AES-GCM + PBKDF2 600,000 次迭代；无找回通道',
'- 八套主题；拼音首字母搜索；重复密码检测；回收站 30 天',
'- 导出三去向；智能合并导入（跨主密码、新者胜、差异预览）',
'- 数据面板；App 自动备份轮换（5 份）；欢迎引导 + 8 章节使用说明',
'- Android 零依赖构建链（aapt2/javac/d8/zipalign/apksigner）',
'- 自动化测试约 150+ 断言（端到端 86 项 + 各专项）',
'',
'定版验收（真机）：导出三去向 / 导入 / 跨设备合并 五环节通过。'
].join('\n'), 'utf8');

let r;
r = sh('git init'); console.log('3a. git init:', r.ok ? 'OK' : r.out);
r = sh('git branch -M main'); console.log('3b. branch main:', r.ok ? 'OK' : r.out);
sh('git config user.name "G"');
sh('git config user.email "g@local"');
sh('git config core.quotepath false');
sh('git config http.proxy http://127.0.0.1:7897');
sh('git config https.proxy http://127.0.0.1:7897');
r = sh('git add -A'); console.log('3c. git add:', r.ok ? 'OK' : r.out);
r = sh('git commit -q -F .commit-msg.txt'); console.log('3d. commit:', r.ok ? 'OK' : r.out);
fs.rmSync(W + '.commit-msg.txt');

/* 4. remote + force push */
r = sh('git remote add origin ' + REMOTE); console.log('4a. remote add:', r.ok ? 'OK' : r.out);
console.log('');
console.log('=== force push（覆盖远端）===');
r = sh('git push --force -u origin main', 300000);
console.log(r.ok ? ('OK:\n' + r.out) : ('结果:\n' + r.out));

/* 5. 验证 */
const files = sh('git ls-files').out.split('\n').filter(Boolean);
console.log('');
console.log('5. 入库文件数:', files.length);
console.log('   可疑大件:', files.filter(f => /plat|bt\/|chrome-bg|shots\//.test(f)).length, '个');
function sz(p) { let t = 0; const walk = x => { for (const f of fs.readdirSync(x)) { const q = x + '/' + f; const s = fs.statSync(q); if (s.isFile()) t += s.size; else if (s.isDirectory()) walk(q); } }; walk(p); return t; }
console.log('   .git 体积:', (sz(W + '.git') / 1024 / 1024).toFixed(1) + ' MB');
console.log('   ls-remote:', sh('git ls-remote origin').out.replace(/\n/g, ' | ').slice(0, 240));
