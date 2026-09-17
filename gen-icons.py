# -*- coding: utf-8 -*-
# CipherBox 图标生成：用户图 → legacy PNG（5 密度）+ adaptive（前景/背景）
from PIL import Image, ImageDraw
import os

SRC = r"E:/tengxun/xwechat_files/wxid_4fa5sxrbr1w222_2f3d/temp/RWTemp/2026-09/9e20f478899dc29eb19741386f9343c8/a8cc5ec51d65bb755caf1d208ac5b7a1.jpg"
RES = r"C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/android-build/app/res"

img = Image.open(SRC).convert('RGB')
w, h = img.size
side = min(w, h)
img = img.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
print('source:', img.size)

# 1) legacy：圆角方图 PNG（5 密度）
def rounded(im, ratio=0.18):
    size = im.size[0]
    m = Image.new('L', (size * 4, size * 4), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * ratio), fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out

DENS = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dpi, size in DENS.items():
    d = os.path.join(RES, 'mipmap-' + dpi)
    os.makedirs(d, exist_ok=True)
    rounded(img.resize((size, size), Image.LANCZOS)).save(os.path.join(d, 'ic_launcher.png'))
    print('mipmap-' + dpi + '/ic_launcher.png', size)

# 2) adaptive：前景（432 白底 + 图居中 66%）+ 背景 vector
fg = Image.new('RGBA', (432, 432), (253, 253, 253, 255))
inner = img.resize((286, 286), Image.LANCZOS)
fg.paste(inner, ((432 - 286) // 2, (432 - 286) // 2))
dg = os.path.join(RES, 'drawable')
os.makedirs(dg, exist_ok=True)
fg.save(os.path.join(dg, 'ic_fg.png'))
open(os.path.join(dg, 'ic_bg.xml'), 'w').write(
'''<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FDFDFD" android:pathData="M0,0h108v108h-108z"/>
</vector>''')
print('drawable/ic_fg.png 432 / ic_bg.xml')

# 3) adaptive icon xml
av = os.path.join(RES, 'mipmap-anydpi-v26')
os.makedirs(av, exist_ok=True)
open(os.path.join(av, 'ic_launcher.xml'), 'w').write(
'''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_bg"/>
    <foreground android:drawable="@drawable/ic_fg"/>
</adaptive-icon>''')
print('mipmap-anydpi-v26/ic_launcher.xml')

# 4) 移除旧的 vector 锁图标（被 mipmap 取代）
old = os.path.join(RES, 'drawable', 'ic_launcher.xml')
if os.path.exists(old):
    os.remove(old)
    print('removed drawable/ic_launcher.xml')
print('done')
