# 从 d8 输出的 zip 中解出 classes.dex
import zipfile, sys, os

src = sys.argv[1]
dst = sys.argv[2]
with zipfile.ZipFile(src, 'r') as z:
    names = [n for n in z.namelist() if n.endswith('.dex')]
    if not names:
        print('no dex in zip'); sys.exit(1)
    data = z.read(names[0])
open(dst, 'wb').write(data)
print('classes.dex extracted:', len(data), 'bytes')
