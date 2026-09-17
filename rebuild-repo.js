'use strict';
const fs = require('fs'), { execSync } = require('child_process');
const W = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/';

/* 1. 删旧 .git（含垃圾历史的）*/
fs.rmSync(W + '.git', { recursive: true, force: true });
console.log('1. 已删除旧 .git（垃圾历史）');

/* 2. 删 Chrome 测试残留 */
let n = 0;
for (const f of fs.readdirSync(W)) {
  if (f.startsWith('.chrome-bg-')) { fs.rmSync(W + f, { recursive: true, force: true }); n++; }
}
console.log('2. 已删除 Chrome 测试残留: ' + n + ' 个');

/* 3. .gitignore 补 android-build/plat/ */
let gi = fs.readFileSync(W + '.gitignore', 'utf8');
if (gi.indexOf('android-build/plat/') < 0) {
  gi = gi.replace('android-build/bt/', 'android-build/bt/\nandroid-build/plat/');
  fs.writeFileSync(W + '.gitignore', gi);
  console.log('3. .gitignore 已加 android-build/plat/');
}

/* 4. 提交 */
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

function sh(c) { return execSync(c, { cwd: W, encoding: 'utf8', timeout: 180000, stdio: ['pipe', 'pipe', 'pipe'] }); }
sh('git init');
sh('git config user.name "G"');
sh('git config user.email "g@local"');
sh('git config core.quotepath false');
sh('git add -A');
sh('git commit -q -F .commit-msg.txt');
fs.rmSync(W + '.commit-msg.txt');
console.log('4. 仓库已重建并提交');

/* 5. 验证 */
const files = sh('git ls-files').trim().split('\n');
console.log('5. 入库文件数: ' + files.length);
const dirs = {};
files.forEach(f => { const d = f.split('/').slice(0, -1).join('/') || '(根)'; dirs[d] = (dirs[d] || 0) + 1; });
Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([d, c]) => console.log('   ' + d.padEnd(42) + c + ' 个'));
function sz(p) { let t = 0; const walk = x => { for (const f of fs.readdirSync(x)) { const q = x + '/' + f; const s = fs.statSync(q); if (s.isFile()) t += s.size; else if (s.isDirectory()) walk(q); } }; walk(p); return t; }
console.log('.git 体积: ' + (sz(W + '.git') / 1024 / 1024).toFixed(1) + ' MB');
console.log('git log: ' + sh('git log --oneline').trim());
