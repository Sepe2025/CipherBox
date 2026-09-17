/* ============================================================
   生成紧凑拼音首字母表
   ------------------------------------------------------------
   思路：不内联整个拼音库（pinyin-pro 完整版上百 KB），
   只导出「汉字 → 声母首字母」的映射，按首字母分组存成 20 个字符串。
   覆盖范围：GB2312 一级+二级汉字区（6763 字，日常用字全覆盖）。
   预计体积：约 20 KB 源码（汉字本身占大头）。
   ============================================================ */
'use strict';
const fs = require('fs');
const { pinyin } = require('pinyin-pro');

/* GB2312 汉字区：0xB0A1 - 0xF7FE（一级 3755 + 二级 3008）
   Node 原生不支持 'gb2312'，用 TextDecoder('gbk') 解码 */
const dec = new TextDecoder('gbk');
const chars = [];
for (let hi = 0xB0; hi <= 0xF7; hi++) {
  for (let lo = 0xA1; lo <= 0xFE; lo++) {
    const s = dec.decode(Buffer.from([hi, lo]));
    if (s.length === 1 && /[\u4e00-\u9fa5]/.test(s)) chars.push(s);
  }
}
console.log('GB2312 汉字数:', chars.length);

/* 求每个字的拼音首字母 */
const groups = {};   // 首字母 -> 汉字串
let miss = 0;
for (const ch of chars) {
  let py;
  try { py = pinyin(ch, { toneType: 'none', type: 'array' })[0] || ''; } catch (e) { py = ''; }
  if (!py) { miss++; continue; }
  const ini = py[0].toLowerCase();
  if (!/^[a-z]$/.test(ini)) { miss++; continue; }
  groups[ini] = (groups[ini] || '') + ch;
}
console.log('未取到拼音:', miss);

const keys = Object.keys(groups).sort();
let total = 0;
keys.forEach(k => { total += groups[k].length; });
console.log('首字母分组:', keys.join(' '));
console.log('覆盖汉字:', total, ' 源码体积约', (total * 3 / 1024).toFixed(1), 'KB（UTF-8 汉字 3 字节）');

/* 输出成 JS 片段 */
const lines = keys.map(k => '  ' + k + ':' + JSON.stringify(groups[k])).join(',\n');
const js = 'var PY_GROUPS={\n' + lines + '\n};';
fs.writeFileSync('pinyin-data.js', js, 'utf8');
console.log('已写出 pinyin-data.js，大小', (fs.statSync('pinyin-data.js').size / 1024).toFixed(1), 'KB');

/* 自检 */
const probe = ['淘', '宝', '招', '商', '银', '行', '学', '校', '教', '务', '系', '统', '工', '密', '码', '管', '理'];
console.log('');
console.log('自检：');
probe.forEach(ch => {
  const hit = keys.find(k => groups[k].indexOf(ch) >= 0);
  console.log('  ' + ch + ' → ' + (hit || '未收录'));
});
