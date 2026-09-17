'use strict';
const fs = require('fs'), { execSync } = require('child_process');
const W = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/';
const REMOTE = 'https://github.com/Sepe2025/CipherBox.git';

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

function sh(c, timeout) {
  try { return { ok: true, out: execSync(c, { cwd: W, encoding: 'utf8', timeout: timeout || 180000, stdio: ['pipe', 'pipe', 'pipe'] }).trim() }; }
  catch (e) { return { ok: false, out: (((e.stdout || '') + (e.stderr || '') + (e.message || '')).trim()).slice(0, 800) }; }
}

let r;
r = sh('git init'); console.log('git init:', r.ok ? 'OK' : r.out);
r = sh('git branch -M main'); console.log('branch → main:', r.ok ? 'OK' : r.out);
sh('git config user.name "G"');
sh('git config user.email "g@local"');
sh('git config core.quotepath false');
r = sh('git add -A'); console.log('git add:', r.ok ? 'OK' : r.out);
r = sh('git commit -q -F .commit-msg.txt'); console.log('commit:', r.ok ? 'OK' : r.out);
fs.rmSync(W + '.commit-msg.txt');
r = sh('git log --oneline'); console.log('log:', r.out);

r = sh('git remote add origin ' + REMOTE);
console.log('remote add:', r.ok ? 'OK' : r.out);
r = sh('git remote -v'); console.log(r.out.replace(/\n/g, ' | '));

console.log('');
console.log('=== push（如需 GitHub 认证，留意屏幕上的登录窗口）===');
r = sh('git push -u origin main', 300000);
console.log(r.ok ? ('PUSH 成功:\n' + r.out) : ('PUSH 结果:\n' + r.out));
