# 把 classes.dex 注入 aapt2 生成的 APK（保留其他条目的原压缩方式；
# resources.arsc 强制 STORED —— targetSdk 30+ 要求它不压缩，zipalign 再做对齐）
import zipfile, sys, os

apk = sys.argv[1]
dex = sys.argv[2]

zin = zipfile.ZipFile(apk, 'r')
if 'classes.dex' in zin.namelist():
    print('classes.dex already present')
    sys.exit(0)

zout = zipfile.ZipFile(apk + '.tmp', 'w')
for item in zin.infolist():
    data = zin.read(item.filename)
    ct = zipfile.ZIP_STORED if item.filename == 'resources.arsc' else item.compress_type
    zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
    zi.compress_type = ct
    zi.external_attr = item.external_attr
    zout.writestr(zi, data)

zi = zipfile.ZipInfo('classes.dex', date_time=(2026, 1, 1, 0, 0, 0))
zi.compress_type = zipfile.ZIP_DEFLATED
zout.writestr(zi, open(dex, 'rb').read())

zout.close()
zin.close()
os.replace(apk + '.tmp', apk)
print('classes.dex injected:', len(open(dex, "rb").read()), 'bytes')
