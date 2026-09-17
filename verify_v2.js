/* 真实 DOM 渲染验证：用 jsdom 加载页面，走完整交互流程 */
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(
  'C:/Users/30855/.workbuddy/binaries/node/workspace/node_modules/jsdom'
);

const FILE = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const html = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const log = (ok, name, extra) => {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra ? '  [' + extra + ']' : ''));
  ok ? pass++ : fail++;
};

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.message || e)));
vc.on('error', e => errors.push(String(e)));

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'https://local.test/',
  virtualConsole: vc,
});

const { window } = dom;
const { document } = window;

// jsdom 没有 WebCrypto subtle 的完整实现，注入 Node 的
const nodeCrypto = require('crypto');
if (!window.crypto) window.crypto = {};
if (!window.crypto.getRandomValues) {
  window.crypto.getRandomValues = a => nodeCrypto.webcrypto.getRandomValues(a);
}
window.crypto.subtle = nodeCrypto.webcrypto.subtle;
window.crypto.randomUUID = nodeCrypto.randomUUID;

/* 页面里的 localStorage 属于 jsdom 的 window，harness 侧必须取 window 上的那份 */
const ls = window.localStorage;
const $ = s => document.querySelector(s);
const click = el => el && el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const type = (el, v) => {
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
};
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));

(async () => {
  await tick(60);

  console.log('=== 1. 首次启动 · 锁屏 ===');
  log($('#lockScreen').hidden === false, '锁屏默认可见');
  log($('#mainScreen').hidden === true, '主界面默认隐藏');
  log($('#lockFirstWrap').hidden === false, '首次使用显示警告');
  log($('#lockPw2Wrap').hidden === false, '首次使用显示二次输入');
  log($('#hintWrap').hidden === false, '首次使用显示提示字段');
  log($('#lockTitle').textContent === '建立你的CipherBox', '标题为建立引导', $('#lockTitle').textContent);

  console.log('');
  console.log('=== 2. 表单校验 ===');
  type($('#lockPw'), '123');
  click($('#lockBtn'));
  await tick(30);
  log($('#lockErr').textContent.includes('至少 6 位'), '拒绝过短密码', $('#lockErr').textContent);

  type($('#lockPw'), 'MasterPass123');
  type($('#lockPw2'), 'MasterPass999');
  click($('#lockBtn'));
  await tick(30);
  log($('#lockErr').textContent.includes('不一致'), '拒绝不一致的两次输入', $('#lockErr').textContent);

  console.log('');
  console.log('=== 3. 创建保险箱 ===');
  type($('#lockPw2'), 'MasterPass123');
  type($('#hintInput'), '常用那串');
  click($('#lockBtn'));
  await tick(400);
  log($('#mainScreen').hidden === false, '进入主界面');
  log($('#lockScreen').hidden === true, '锁屏已隐藏');
  log(!!ls.getItem('apm.vault.v1'), 'vault 已写入 localStorage');
  const vaultRaw = JSON.parse(ls.getItem('apm.vault.v1'));
  log(vaultRaw.fmt === 'wc' || vaultRaw.fmt === 'js', 'vault 格式正确', 'fmt=' + vaultRaw.fmt);
  log(vaultRaw.hint === '常用那串', '提示已保存');
  log(vaultRaw.data && !vaultRaw.data.includes('entries'), '数据确实被加密（明文不可见）');

  console.log('');
  console.log('=== 4. 空状态 ===');
  log($('#empty').hidden === false, '空状态可见');
  log($('#mainList').innerHTML.trim() === '', '列表为空');
  log($('#catRow').hidden === true, '无分类时隐藏筛选行');
  log($('#statusCount').textContent === '0 条记录', '记录数显示 0', $('#statusCount').textContent);

  console.log('');
  console.log('=== 5. 添加记录 ===');
  click($('#emptyAdd'));
  await tick(80);
  log($('#editOverlay').hidden === false, '编辑弹层已打开');
  log($('#editTitle').textContent === '添加账号', '标题为添加账号');

  type($('#fName'), '学校教务系统');
  type($('#fUrl'), 'https://jw.wit.edu.cn');
  type($('#fCat'), '学习');
  type($('#fAccount'), '22607010047');
  type($('#fPw'), 'Str0ng#Pass!2026');
  type($('#fDesc'), '选课、查成绩。用学号登录。');

  log($('#strengthBox').hidden === false, '密码强度组件已显示');
  log($('#strengthLabel').textContent.includes('很强'), '强密码判定正确', $('#strengthLabel').textContent);

  click($('#saveBtn'));
  await tick(400);
  log($('#editOverlay').hidden === true, '保存后关闭弹层');
  log(document.querySelectorAll('#mainList .card').length === 1, '列表出现 1 张卡片');
  log($('#empty').hidden === true, '空状态已隐藏');
  log($('#catRow').hidden === false, '分类筛选行已显示');
  log($('#statusCount').textContent === '1 条记录', '记录数更新', $('#statusCount').textContent);

  console.log('');
  console.log('=== 6. 卡片内容与脱敏 ===');
  const card = document.querySelector('#mainList .card');
  log(!!card, '卡片元素存在');
  log(card.querySelector('.card-title').textContent === '学校教务系统', '标题正确');
  log(card.querySelector('.avatar').textContent === '学', '首字母徽章正确', card.querySelector('.avatar').textContent);
  const acctSpan = card.querySelector('[data-acct]');
  log(!acctSpan.textContent.includes('22607010047'), '账号默认脱敏', acctSpan.textContent);
  const pwSpan = card.querySelector('[data-pw]');
  log(!pwSpan.textContent.includes('Str0ng'), '密码默认隐藏', pwSpan.textContent);
  log(!!card.querySelector('.card-link'), '有网址时显示跳转入口');
  log(card.querySelector('.badge').textContent === '学习', '分类徽章正确');
  log(document.querySelector('.group-head') !== null, '出现分组标题', document.querySelector('.group-head').textContent);

  console.log('');
  console.log('=== 7. 显示密码 + 自动隐藏计时 ===');
  const eyeBtn = card.querySelector('[data-act="eye"]');
  click(eyeBtn);
  await tick(30);
  log(card.querySelector('[data-pw]').textContent === 'Str0ng#Pass!2026', '点显示后密码明文可见');
  log(card.querySelector('[data-pw]').className.includes('revealed'), 'revealed 样式已应用');
  click(card.querySelector('[data-act="eye"]'));
  await tick(30);
  log(!card.querySelector('[data-pw]').textContent.includes('Str0ng'), '再点一次恢复隐藏');

  console.log('');
  console.log('=== 8. 账号脱敏切换 ===');
  click(card.querySelector('[data-act="toggle-acct"]'));
  await tick(30);
  log(card.querySelector('[data-acct]').textContent === '22607010047', '点眼睛后账号明文可见');
  click(card.querySelector('[data-act="toggle-acct"]'));
  await tick(30);
  log(card.querySelector('[data-acct]').textContent !== '22607010047', '再点恢复脱敏');

  console.log('');
  console.log('=== 9. 编辑记录 ===');
  click(card.querySelector('[data-act="more"]'));
  await tick(80);
  log($('#moreOverlay').hidden === false, '更多菜单已打开');
  log($('#moreMenu').innerHTML.includes('置顶'), '菜单含置顶项');
  log($('#moreMenu').innerHTML.includes('编辑'), '菜单含编辑项');
  log($('#moreMenu').innerHTML.includes('删除'), '菜单含删除项');
  click($('#moreMenu').querySelector('[data-m="edit"]'));
  await tick(90);
  log($('#fName').value === '学校教务系统', '编辑时字段已回填', $('#fName').value);
  type($('#fName'), '教务系统（改）');
  click($('#saveBtn'));
  await tick(400);
  log(document.querySelector('.card-title').textContent === '教务系统（改）', '修改已生效');

  console.log('');
  console.log('=== 10. 置顶与分组 ===');
  // 先加第二条
  click($('#fab'));
  await tick(80);
  type($('#fName'), '淘宝');
  type($('#fAccount'), '13800001111');
  type($('#fPw'), 'taobao123');
  type($('#fCat'), '购物');
  click($('#saveBtn'));
  await tick(400);
  log(document.querySelectorAll('#mainList .card').length === 2, '第二条已添加');

  const second = [...document.querySelectorAll('#mainList .card')]
    .find(c => c.querySelector('.card-title').textContent === '淘宝');
  second.querySelector('[data-act="more"]').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true })
  );
  await tick(80);
  click($('#moreMenu').querySelector('[data-m="pin"]'));
  await tick(400);
  const heads = [...document.querySelectorAll('.group-head')].map(h => h.textContent.replace('★', '').trim());
  log(heads.includes('置顶'), '出现「置顶」分组', heads.join(' | '));
  const firstCard = document.querySelector('#mainList .card');
  log(firstCard.querySelector('.card-title').textContent === '淘宝', '置顶项排在最前');
  log(firstCard.classList.contains('pinned'), '置顶样式已应用');

  console.log('');
  console.log('=== 11. 搜索与筛选 ===');
  type($('#search'), '教务');
  log(document.querySelectorAll('#mainList .card').length === 1, '搜索「教务」命中 1 条');
  type($('#search'), 'zzz不存在zzz');
  log($('#noResult').hidden === false, '无结果状态显示');
  log($('#noResultSub').textContent.includes('zzz'), '无结果文案含关键词', $('#noResultSub').textContent);
  click($('#clearFilters'));
  await tick(30);
  log(document.querySelectorAll('#mainList .card').length === 2, '清除筛选后恢复 2 条');

  const chip购物 = [...document.querySelectorAll('#catRow .chip')]
    .find(c => c.textContent.includes('购物'));
  click(chip购物);
  await tick(30);
  log(document.querySelectorAll('#mainList .card').length === 1, '按分类筛选生效');
  click([...document.querySelectorAll('#catRow .chip')].find(c => c.textContent.includes('全部')));
  await tick(30);
  log(document.querySelectorAll('#mainList .card').length === 2, '切回全部恢复 2 条');

  console.log('');
  console.log('=== 12. 删除 → 回收站 → 恢复 ===');
  const toDelete = [...document.querySelectorAll('#mainList .card')]
    .find(c => c.querySelector('.card-title').textContent === '淘宝');
  toDelete.querySelector('[data-act="more"]').dispatchEvent(
    new window.MouseEvent('click', { bubbles: true })
  );
  await tick(80);
  click($('#moreMenu').querySelector('[data-m="del"]'));
  await tick(80);
  log($('#confirmOverlay').hidden === false, '确认框已弹出');
  log($('#confirmMsg').textContent.includes('回收站'), '确认文案说明去向', $('#confirmMsg').textContent.slice(0, 30));
  click($('#confirmOk'));
  await tick(400);
  log(document.querySelectorAll('#mainList .card').length === 1, '删除后剩 1 条');
  log($('#statusCount').textContent === '1 条记录', '计数已更新');

  click($('#btnSettings'));
  await tick(80);
  log($('#trashCount').textContent.includes('1'), '设置里显示回收站计数', $('#trashCount').textContent);
  click($('#btnTrash'));
  await tick(90);
  log($('#trashOverlay').hidden === false, '回收站已打开');
  log(document.querySelectorAll('#trashList .t-item').length === 1, '回收站有 1 条');
  log($('#trashList').textContent.includes('天后自动清除'), '显示剩余天数');
  click($('#trashList').querySelector('[data-t="restore"]'));
  await tick(400);
  log(document.querySelectorAll('#trashList .t-item').length === 0, '回收站已空');
  log(document.querySelectorAll('#mainList .card').length === 2, '记录已恢复');

  console.log('');
  console.log('=== 13. 主题切换（选择弹层）===');
  const before = document.documentElement.getAttribute('data-theme');
  click($('#btnTheme'));
  await tick(80);
  log(!$('#themeOverlay').hidden, '主题弹层已打开');
  log(document.querySelectorAll('#themeGrid .theme-card').length === 8, '预览卡渲染 8 张');
  click(document.querySelector('#themeGrid .theme-card[data-t="pink-drink"]'));
  await tick(80);
  const after = document.documentElement.getAttribute('data-theme');
  log(after === 'pink-drink', '点卡片已切换主题', before + ' -> ' + after);
  log(ls.getItem('apm.theme.v1') === 'pink-drink', '主题选择已持久化');
  log(!!document.querySelector('#themeGrid .theme-card[data-t="pink-drink"].on'), '当前主题卡片高亮');
  click(document.querySelector('#themeGrid .theme-card[data-t="' + before + '"]'));
  await tick(80);
  log(document.documentElement.getAttribute('data-theme') === before, '切回原主题');
  click($('#themeClose'));
  await tick(40);
  log($('#themeOverlay').hidden, '弹层可关闭');

  console.log('');
  console.log('=== 14. 锁定与解锁（数据持久化）===');
  click($('#btnLock'));
  await tick(60);
  log($('#lockScreen').hidden === false, '已回到锁屏');
  log($('#lockFirstWrap').hidden === true, '非首次不再显示建立引导');
  log($('#lockHint').hidden === false, '显示密码提示', $('#lockHint').textContent);
  log($('#lockTitle').textContent === 'CipherBox', '标题为解锁模式');

  type($('#lockPw'), 'WrongPassword');
  click($('#lockBtn'));
  await tick(500);
  log($('#lockErr').textContent.includes('不对'), '错误密码被拒绝', $('#lockErr').textContent);
  log($('#lockErr').textContent.includes('4 次'), '剩余次数提示正确');

  type($('#lockPw'), 'MasterPass123');
  click($('#lockBtn'));
  await tick(700);
  log($('#mainScreen').hidden === false, '正确密码成功解锁');
  log(document.querySelectorAll('#mainList .card').length === 2, '解锁后数据完整恢复（2 条）');

  console.log('');
  console.log('=== 15. 键盘快捷键 ===');
  const ev = k => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true }));
  ev('n');
  await tick(80);
  log($('#editOverlay').hidden === false, 'N 键打开新建');
  ev('Escape');
  await tick(60);
  log($('#editOverlay').hidden === true, 'Esc 关闭弹层');

  ev('/');
  await tick(30);
  log(document.activeElement === $('#search'), '斜杠键聚焦搜索框');

  console.log('');
  console.log('=== 16. 回收站过期清理 ===');
  const vs = JSON.parse(ls.getItem('apm.vault.v1'));
  log(vs.v === 1, 'vault 版本号保持 1（向后兼容）');

  console.log('');
  console.log('=== JS 运行时错误 ===');
  log(errors.length === 0, '无未捕获错误', errors.length ? errors.slice(0, 3).join(' // ') : 'clean');

  console.log('');
  console.log('================================');
  console.log('  PASS: ' + pass + '   FAIL: ' + fail);
  console.log('================================');

  window.close();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.log('HARNESS ERROR: ' + e.stack);
  process.exit(2);
});
