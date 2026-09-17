/* ============================================================
   Android 壳构建脚本（无 Gradle，命令行工具链）
   产出一个未上架、无网络权限的本地保险箱 APK。
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');

const BASE = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/android-build';
const BT = BASE + '/bt/android-14';
const PLAT = BASE + '/plat/android-34';
const APP = BASE + '/app';
const BUILD = APP + '/build';
const HTML = 'C:/Users/30855/Desktop/新建文件夹/账号密码管理_v2.html';
const NODE = 'C:/Users/30855/.workbuddy/binaries/node/versions/22.22.2-3/node.exe';
const PY = 'E:/Python/Py/python.exe';
const VER = (fs.readFileSync(APP + '/AndroidManifest.xml','utf8').match(/versionName="([^"]+)"/)||[])[1] || '1.0';
const OUT_APK = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/CipherBox-' + VER + '.apk';
const KS = BASE + '/vault.keystore';

const AAPT2 = BT + '/aapt2.exe';
const ZIPALIGN = BT + '/zipalign.exe';
const APKSIGNER = BT + '/apksigner.bat';
const D8 = BT + '/d8.bat';

function sh(cmd, args, label, opts) {
  console.log('» ' + label);
  try {
    const out = execFileSync(cmd, args, Object.assign({ encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'] }, opts || {}));
    if (out && out.trim()) console.log(out.trim().split('\n').slice(-6).map(l => '   ' + l).join('\n'));
    return out;
  } catch (e) {
    console.log('  ✗ FAIL: ' + (e.message || '').slice(0, 300));
    if (e.stdout) console.log('  stdout: ' + String(e.stdout).slice(-2000));
    if (e.stderr) console.log('  stderr: ' + String(e.stderr).slice(-2000));
    process.exit(1);
  }
}
function shBat(bat, args, label) {
  return sh('cmd.exe', ['/c', bat].concat(args), label);
}

console.log('=== Android 壳构建 ===');

/* 0. 准备目录与 assets（最新 HTML） */
[BUILD, BUILD + '/gen', BUILD + '/classes', APP + '/assets'].forEach(d => fs.mkdirSync(d, { recursive: true }));
fs.copyFileSync(HTML, APP + '/assets/vault.html');
console.log('» assets/vault.html ← 最新 HTML（' + (fs.statSync(HTML).size / 1024).toFixed(1) + ' KB）');

/* 1. aapt2 编译资源 */
sh(AAPT2, ['compile', '--dir', APP + '/res', '-o', BUILD + '/res.zip'], 'aapt2 compile');

/* 2. aapt2 链接：生成 base.apk（含 manifest/resources/assets）与 R.java */
sh(AAPT2, ['link', '-o', BUILD + '/base.apk', '-I', PLAT + '/android.jar',
  '--manifest', APP + '/AndroidManifest.xml', '-A', APP + '/assets',
  '--java', BUILD + '/gen', '--min-sdk-version', '21', '--target-sdk-version', '34',
  BUILD + '/res.zip'], 'aapt2 link');

/* 3. javac（--release 11；JDK 25 对 8 的支持已弃用） */
const classes = BUILD + '/classes';
/* ⚠️ 必须编译 src 下全部 .java：BackupProvider 只被 manifest 引用，
   javac 不会自动带上 —— 漏了它，manifest 就指向一个不存在的类，
   App 一启动实例化 provider 直接 ClassNotFoundException 闪退（v1.2 就是这么炸的） */
const srcFiles = [];
(function walkSrc(d) {
  for (const f of fs.readdirSync(d)) {
    const p = d + '/' + f;
    if (fs.statSync(p).isDirectory()) walkSrc(p);
    else if (f.endsWith('.java')) srcFiles.push(p);
  }
})(APP + '/src');
console.log('» javac（' + srcFiles.length + ' 个源文件）');
sh('javac', ['--release', '11', '-classpath', PLAT + '/android.jar', '-d', classes,
  BUILD + '/gen/com/g/vault/R.java'].concat(srcFiles), 'javac');

/* 4. d8 转 dex（枚举全部 class 文件） */
const classFiles = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = d + '/' + f;
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.class')) classFiles.push(p);
  }
})(classes);
console.log('» d8（' + classFiles.length + ' 个 class）');
/* ⚠️ 不走 d8.bat（cmd.exe 会吞尾斜杠导致 R8 NPE），直接 java 调 D8 主类。
   D8 对 --output 的要求：.zip/.jar 或【已存在的目录】—— 不能是 .dex 文件路径。
   目录写入路径在这版 R8 上有 NPE，所以输出为 zip，随后由 python 解出 classes.dex */
sh('java', ['-Xmx1024M', '-cp', BASE + '/dl/r8-9.4.17.jar', 'com.android.tools.r8.D8',
  '--release', '--min-api', '21', '--lib', PLAT + '/android.jar',
  '--output', BUILD + '/dexout.zip'].concat(classFiles), 'd8（java 直调 → zip）');
sh(PY, [BASE + '/unzip-dex.py', BUILD + '/dexout.zip', BUILD + '/classes.dex'], '解出 classes.dex');
if (!fs.existsSync(BUILD + '/classes.dex')) { console.log('✗ classes.dex 未生成'); process.exit(1); }

/* 5. 注入 classes.dex */
sh(PY, [BASE + '/build-dex.py', BUILD + '/base.apk', BUILD + '/classes.dex'], '注入 classes.dex');

/* 6. zipalign */
sh(ZIPALIGN, ['-f', '4', BUILD + '/base.apk', BUILD + '/aligned.apk'], 'zipalign');

/* 7. 签名（keystore 首次生成；密码是本地演示用，App 不上架） */
if (!fs.existsSync(KS)) {
  sh('keytool', ['-genkeypair', '-keystore', KS, '-alias', 'vault', '-keyalg', 'RSA',
    '-keysize', '2048', '-validity', '10950',
    '-storepass', 'vault2026', '-keypass', 'vault2026',
    '-dname', 'CN=Vault, OU=Local, O=G, C=CN'], '生成签名密钥（首次）');
}

/* 8. 签名 + 对齐确认 */
shBat(APKSIGNER, ['sign', '--ks', KS, '--ks-pass', 'pass:vault2026', '--key-pass', 'pass:vault2026',
  '--out', OUT_APK, BUILD + '/aligned.apk'], 'apksigner 签名');
shBat(APKSIGNER, ['verify', '--print-certs', OUT_APK], 'apksigner 验证');

const size = (fs.statSync(OUT_APK).size / 1024).toFixed(1);
console.log('');
console.log('✅ 构建完成: ' + OUT_APK);
console.log('   大小: ' + size + ' KB');
console.log('   权限: 无（manifest 未申请任何权限，包括 INTERNET）');
