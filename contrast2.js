/* 对比度复检：亮色主题改版后重新验 WCAG AA */
const fs = require('fs');
const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const src = fs.readFileSync(FILE, 'utf8');

function hex2rgb(h) {
  h = h.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function lum(rgb) {
  const a = rgb.map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}
function ratio(fg, bg) {
  const L1 = lum(hex2rgb(fg)), L2 = lum(hex2rgb(bg));
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}

/* 从文件里抽变量 */
function vars(blockStart) {
  const i = src.indexOf(blockStart);
  const j = src.indexOf('}', i);
  const body = src.slice(i, j);
  const out = {};
  body.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g, (m, k, v) => { out[k] = v; });
  return out;
}
const darkVars = (() => {
  const i = src.indexOf(':root{');
  const j = src.indexOf('\n}', i);
  const body = src.slice(i, j);
  const o = {};
  body.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g, (m, k, v) => { o[k] = v; });
  return o;
})();
const lightVars = (() => {
  const i = src.indexOf('html[data-theme="light"]{');
  const j = src.indexOf('\n}', i);
  const body = src.slice(i, j);
  const o = {};
  // 先抓 hex
  body.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g, (m, k, v) => { o[k] = v; });
  // 再解析 var(--x) 别名，回溯到原语层
  const prim = (() => {
    const pi = src.indexOf(':root{');
    const pj = src.indexOf('\n}', pi);
    const pb = src.slice(pi, pj);
    const p = {};
    pb.replace(/(--[\w-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g, (m, k, v) => { p[k] = v; });
    return p;
  })();
  const alias = {};
  body.replace(/(--[\w-]+)\s*:\s*var\((--[\w-]+)\)\s*;/g, (m, k, v) => { alias[k] = v; });
  Object.keys(alias).forEach(k => { if (prim[alias[k]]) o[k] = prim[alias[k]]; });
  return o;
})();

console.log('=== 亮色主题变量 ===');
const need = ['--bg-canvas','--bg-surface','--bg-inset','--text-primary','--text-secondary','--text-tertiary','--accent','--danger','--success','--focus','--brand'];
need.forEach(k => console.log('  ', k, '=', lightVars[k] || '(未在 light 块内)'));
console.log('');
console.log('=== 亮色 · 对比度复检（新增/改动项）===');

const L = lightVars;
const checks = [
  ['--text-primary on canvas',   L['--text-primary'],  L['--bg-canvas'],  4.5],
  ['--text-primary on surface',  L['--text-primary'],  L['--bg-surface'], 4.5],
  ['--text-secondary on canvas', L['--text-secondary'],L['--bg-canvas'],  4.5],
  ['--text-secondary on surface',L['--text-secondary'],L['--bg-surface'], 4.5],
  ['--text-tertiary on canvas',  L['--text-tertiary'], L['--bg-canvas'],  4.5],
  ['--text-tertiary on surface', L['--text-tertiary'], L['--bg-surface'], 4.5],
  ['--text-tertiary on inset',   L['--text-tertiary'], L['--bg-inset'],   4.5],
  ['--text-secondary on inset',  L['--text-secondary'],L['--bg-inset'],   4.5],
  ['--accent on canvas',         L['--accent'],        L['--bg-canvas'],  4.5],
  ['--accent on surface',        L['--accent'],        L['--bg-surface'], 4.5],
  ['--danger on surface',        L['--danger'],        L['--bg-surface'], 4.5],
  ['--success on surface',       L['--success'],       L['--bg-surface'], 4.5],
  ['--brand on canvas',          L['--brand'],         L['--bg-canvas'],  4.5],
  ['--focus ring on canvas',     L['--focus'],         L['--bg-canvas'],  3.0],
  ['--focus ring on surface',    L['--focus'],         L['--bg-surface'], 3.0],
  /* 控件边界（WCAG 1.4.11 Non-text Contrast 适用范围） */
  ['--line-control on canvas',   L['--line-control'],  L['--bg-canvas'],  3.0],
  ['--line-control on surface',  L['--line-control'],  L['--bg-surface'], 3.0],
  ['--line-control on inset',    L['--line-control'],  L['--bg-inset'],   3.0],
  ['white ink on --accent',      '#FFFFFF',            L['--accent'],     4.5],
  ['white ink on --brand',       '#FFFFFF',            L['--brand'],      4.5],
];

/* 装饰性分隔线不属 WCAG 1.4.11（信息由间距/分组标题独立表达），只做记录不判失败 */
const decorative = [
  ['--line-soft on canvas（装饰）',   L['--line-soft'],   L['--bg-canvas']],
  ['--line-strong on canvas（装饰）', L['--line-strong'], L['--bg-canvas']],
];
let fail = 0;
checks.forEach(([n, fg, bg, min]) => {
  if (!fg || !bg) { console.log('  SKIP  ' + n + ' (缺变量)'); return; }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log('  ' + (ok ? 'PASS  ' : 'FAIL  ') + n.padEnd(30) + r.toFixed(2) + ':1  (需 ' + min + ')');
});

console.log('');
console.log('=== 装饰性分隔线（不适用 1.4.11，仅记录）===');
decorative.forEach(([n, fg, bg]) => {
  if (!fg || !bg) { console.log('  SKIP  ' + n); return; }
  console.log('  note  ' + n.padEnd(34) + ratio(fg, bg).toFixed(2) + ':1');
});

console.log('');
console.log('=== 暗色主题 · 回归复检 ===');
const D = { ...darkVars, ...Object.fromEntries(Object.entries(L).map(([k,v])=>[k,v])) };
// 暗色直接用 :root 里定义的原语 + 语义层（语义层可能与 light 同名）
function darkVal(name){
  // 优先 :root 块里的定义
  if (darkVars[name]) return darkVars[name];
  return null;
}
const dchk = [
  ['dark text-primary on vault-700', darkVars['--paper-100'], darkVars['--vault-700'] ?? '#2A3632', 4.5],
  ['dark text-secondary',            darkVars['--paper-500'], darkVars['--vault-700'] ?? '#2A3632', 4.5],
  ['dark text-tertiary',             darkVars['--paper-600'], darkVars['--vault-700'] ?? '#2A3632', 4.5],
];
dchk.forEach(([n,fg,bg,min])=>{
  if(!fg||!bg){ console.log('  SKIP  '+n); return; }
  const r=ratio(fg,bg); const ok=r>=min; if(!ok) fail++;
  console.log('  '+(ok?'PASS  ':'FAIL  ')+n.padEnd(30)+r.toFixed(2)+':1  (需 '+min+')');
});

console.log('');
console.log(fail === 0 ? 'ALL CONTRAST CHECKS PASS' : (fail + ' CONTRAST CHECKS FAILED'));
process.exit(fail ? 1 : 0);
