# -*- coding: utf-8 -*-
# CipherBox 图标 v2：G 提供的整卡片图 → 全套图标资源
from PIL import Image, ImageDraw
import os

SRC = r'C:/Users/30855/.workbuddy/clipboard-images/clipboard-2026-09-16T14-01-05-031Z-9d96cfae.png'
RES = r'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/android-build/app/res'
PREVIEW = r'C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/shots'

img = Image.open(SRC).convert('RGB')
w, h = img.size
print('source:', (w, h))
# 588×622 → 方形：垂直压缩 5.5%（肉眼不可辨，避免裁掉顶部绿星/卡片下缘）
sq = img.resize((w, w), Image.LANCZOS)
print('squared:', sq.size)

def rounded(im, ratio=0.18):
    size = im.size[0]
    m = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * ratio), fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out

# 1) legacy 五密度（圆角 18%）
DENS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dpi, size in DENS.items():
    d = os.path.join(RES, 'mipmap-' + dpi)
    os.makedirs(d, exist_ok=True)
    rounded(sq.resize((size, size), Image.LANCZOS)).save(os.path.join(d, 'ic_launcher.png'))
    print('mipmap-' + dpi + '/ic_launcher.png', size)

# 2) adaptive：前景 = 方图缩至 74%（完整含绿星）居中；背景 = 边缘浅色
dg = os.path.join(RES, 'drawable')
os.makedirs(dg, exist_ok=True)
fg = Image.new('RGBA', (432, 432), (244, 246, 245, 255))
inner = sq.resize((320, 320), Image.LANCZOS)
fg.paste(inner, ((432 - 320) // 2, (432 - 320) // 2))
fg.save(os.path.join(dg, 'ic_fg.png'))
open(os.path.join(dg, 'ic_bg.xml'), 'w').write(
'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#F4F6F5" android:pathData="M0,0h108v108h-108z"/>
</vector>''')
print('drawable/ic_fg.png 432（图 320 居中）/ ic_bg.xml #F4F6F5')

# 3) adaptive icon xml（已存在，重写确保）
av = os.path.join(RES, 'mipmap-anydpi-v26')
os.makedirs(av, exist_ok=True)
open(os.path.join(av, 'ic_launcher.xml'), 'w').write(
'''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_bg"/>
    <foreground android:drawable="@drawable/ic_fg"/>
</adaptive-icon>''')
print('mipmap-anydpi-v26/ic_launcher.xml')

# 4) 预览
os.makedirs(PREVIEW, exist_ok=True)
rounded(sq.resize((240, 240), Image.LANCZOS)).save(os.path.join(PREVIEW, 'icon-v2-preview.png'))
print('preview → shots/icon-v2-preview.png')
print('done')
