'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/android-build';
const AAPT2 = BASE + '/bt/android-14/aapt2.exe';
const PY = 'E:/Python/Py/python.exe';
const files = fs.readdirSync('C:/Users/30855/WorkBuddy/2026-09-15-16-07-08').filter(f=>/(保险箱|CipherBox)-[\d.]+\.apk$/.test(f));
const APK = 'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/' + files.sort().pop();

console.log('=== aapt2 dump badging ===');
const badging = execFileSync(AAPT2, ['dump', 'badging', APK], { encoding: 'utf8' });
badging.split('\n').forEach(l => {
  if (/^package|^application-label|^sdkVersion|^targetSdkVersion|^uses-permission|^launchable/.test(l)) console.log('  ' + l);
});

console.log('');
console.log('=== APK 内容检查 ===');
fs.writeFileSync(BASE + '/check-apk.py', `
import zipfile
z = zipfile.ZipFile(r"${APK}")
names = z.namelist()
print("zip entries:", len(names))
print("classes.dex:", "classes.dex" in names)
print("AndroidManifest.xml:", "AndroidManifest.xml" in names)
print("assets/vault.html:", "assets/vault.html" in names)
h = z.read("assets/vault.html").decode("utf8")
print("html bytes:", len(h))
print("html complete:", h.strip().endswith("</html>"))
print("html has pinyin:", "PY_GROUPS" in h)
print("html has dup-flag:", ".dup-flag" in h)
print("html has export menu:", "exportOverlay" in h)
print("html has kdf 600k:", "KDF_ITERS_WC = 600000" in h)
print("html has lock close:", "closeAllScrims" in h)
`);
console.log(execFileSync(PY, [BASE + '/check-apk.py'], { encoding: 'utf8' }));
