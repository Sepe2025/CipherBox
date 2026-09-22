/* Offline Android build. Signing keys and passwords must stay outside this repository. */
'use strict';
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const BASE = __dirname;
const ROOT = path.resolve(BASE, '..');
const TOOLCHAIN = process.env.CIPHERBOX_ANDROID_TOOLS || BASE;
const BT = path.join(TOOLCHAIN, 'bt/android-14');
const PLAT = path.join(TOOLCHAIN, 'plat/android-34');
const APP = path.join(BASE, 'app');
const BUILD = path.join(APP, 'build');
const PY = process.env.CIPHERBOX_PYTHON || 'python';
const KS = process.env.CIPHERBOX_KEYSTORE;
const ALIAS = process.env.CIPHERBOX_KEY_ALIAS || 'cipherbox-prod';
const OLD_CERT = 'a9ce55416bc254d3b1877e33696df93c43d6ecf4592042773449ae6592028de5';
const manifest = fs.readFileSync(path.join(APP, 'AndroidManifest.xml'), 'utf8');
const VER = manifest.match(/android:versionName="([^"]+)"/)[1];
const OUT = path.join(ROOT, 'CipherBox-' + VER + '.apk');
function run(cmd, args, label) {
  console.log(label);
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 300000, stdio: ['ignore','pipe','pipe'] });
  } catch (error) {
    let detail = String(error.stderr || '');
    if (process.env.CIPHERBOX_STORE_PASSWORD)
      detail = detail.split(process.env.CIPHERBOX_STORE_PASSWORD).join('<REDACTED>');
    throw new Error(label + ' failed: ' + detail.slice(-1200));
  }
}
function files(dir, suffix) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir,e.name);
    return e.isDirectory() ? files(p,suffix) : (p.endsWith(suffix) ? [p] : []);
  });
}
function signTool(args,label) {
  return run('java', ['-jar',path.join(BT,'lib/apksigner.jar'), ...args],label);
}
function build() {
  // Fail before building: never silently generate a key or fall back to the exposed one.
  if (!KS || !process.env.CIPHERBOX_STORE_PASSWORD) throw new Error('Set CIPHERBOX_KEYSTORE and CIPHERBOX_STORE_PASSWORD using private local credentials.');
  const keyPath = fs.realpathSync(KS), rootPath = fs.realpathSync(ROOT);
  const rel = path.relative(rootPath,keyPath);
  if (!rel.startsWith('..' + path.sep) && !path.isAbsolute(rel)) throw new Error('Keystore must be outside the repository.');
  const keyInfo = run('keytool',['-J-Duser.language=en','-list','-v','-keystore',keyPath,'-alias',ALIAS,'-storepass:env','CIPHERBOX_STORE_PASSWORD'],'Verify private signing identity');
  if (keyInfo.replace(/:/g,'').toLowerCase().includes(OLD_CERT)) throw new Error('Refusing compromised signing key.');
  fs.mkdirSync(BUILD,{recursive:true});
  // Use a fresh build directory per run to avoid packaging stale compiled classes.
  const work = fs.mkdtempSync(path.join(BUILD,'secure-'));
  const gen=path.join(work,'gen'), classes=path.join(work,'classes');
  fs.mkdirSync(gen); fs.mkdirSync(classes);
  fs.copyFileSync(path.join(ROOT,'vault.html'),path.join(APP,'assets/vault.html'));
  const res=path.join(work,'res.zip'), base=path.join(work,'base.apk');
  run(path.join(BT,'aapt2.exe'),['compile','--dir',path.join(APP,'res'),'-o',res],'Compile resources');
  run(path.join(BT,'aapt2.exe'),['link','-o',base,'-I',path.join(PLAT,'android.jar'),'--manifest',path.join(APP,'AndroidManifest.xml'),'-A',path.join(APP,'assets'),'--java',gen,'--min-sdk-version','21','--target-sdk-version','34',res],'Link resources');
  run('javac',['--release','11','-classpath',path.join(PLAT,'android.jar'),'-d',classes,...files(gen,'.java'),...files(path.join(APP,'src'),'.java')],'Compile Java');
  const dexZip=path.join(work,'dex.zip'),dex=path.join(work,'classes.dex');
  run('java',['-Xmx1024M','-cp',path.join(TOOLCHAIN,'dl/r8-9.4.17.jar'),'com.android.tools.r8.D8','--release','--min-api','21','--lib',path.join(PLAT,'android.jar'),'--output',dexZip,...files(classes,'.class')],'Compile DEX');
  run(PY,[path.join(BASE,'unzip-dex.py'),dexZip,dex],'Extract DEX');
  run(PY,[path.join(BASE,'build-dex.py'),base,dex],'Package DEX');
  const aligned=path.join(work,'aligned.apk');
  run(path.join(BT,'zipalign.exe'),['-f','4',base,aligned],'Align APK');
  signTool(['sign','--ks',keyPath,'--ks-key-alias',ALIAS,'--ks-pass','env:CIPHERBOX_STORE_PASSWORD','--key-pass','env:CIPHERBOX_STORE_PASSWORD','--out',OUT,aligned],'Sign APK');
  const report=signTool(['verify','--verbose','--print-certs',OUT],'Verify APK');
  if (report.replace(/:/g,'').toLowerCase().includes(OLD_CERT)) throw new Error('Compromised APK certificate detected.');
  run(path.join(BT,'zipalign.exe'),['-c','4',OUT],'Verify alignment');
  console.log(report.trim());
  console.log('Built: '+OUT);
}
try { build(); } catch(error) { console.error(error.message); process.exitCode=1; }
