'use strict';
const net = require('net');
const { execSync } = require('child_process');
function sh(c) {
  try { return execSync(c, { encoding: 'utf8', timeout: 20000, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); }
  catch (e) { return 'ERR: ' + ((((e.stdout || '') + (e.stderr || '')).trim().split('\n')[0]) || e.message).slice(0, 140); }
}
console.log('== git 代理配置 ==');
console.log('http.proxy :', sh('git config --global --get http.proxy') || '(未设)');
console.log('https.proxy:', sh('git config --global --get https.proxy') || '(未设)');
console.log('');
console.log('== 环境变量代理 ==');
console.log('HTTP_PROXY :', process.env.HTTP_PROXY || process.env.http_proxy || '(无)');
console.log('HTTPS_PROXY:', process.env.HTTPS_PROXY || process.env.https_proxy || '(无)');
console.log('');
console.log('== 常见本地代理端口探测 ==');
const ports = [7890, 7897, 7891, 10809, 10808, 1080, 8889, 2080, 33210, 4780];
(async () => {
  const found = [];
  for (const p of ports) {
    await new Promise(res => {
      const s = net.connect({ host: '127.0.0.1', port: p, timeout: 700 });
      s.on('connect', () => { console.log('  127.0.0.1:' + p + '  ✅ 有服务监听'); found.push(p); s.destroy(); res(); });
      s.on('error', () => res());
      s.on('timeout', () => { s.destroy(); res(); });
    });
  }
  if (!found.length) console.log('  （未发现常见代理端口）');
  console.log('');
  console.log('== GitHub 直连测试 ==');
  console.log('curl 443:', sh('curl -sI -m 12 https://github.com'));
  console.log('');
  console.log('== 若已有代理，尝试通过它访问 ==');
  for (const p of found) {
    const r = sh('curl -sI -m 10 -x http://127.0.0.1:' + p + ' https://github.com');
    console.log('  via 127.0.0.1:' + p + ' →', r.split('\n')[0] || '(无返回)');
  }
})();
