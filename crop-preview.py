# -*- coding: utf-8 -*-
# 第一步：裁出「白色内卡 + 锁」区域预览（坐标确认用）
from PIL import Image
import os

SRC = r"E:/tengxun/xwechat_files/wxid_4fa5sxrbr1w222_2f3d/temp/RWTemp/2026-09/9e20f478899dc29eb19741386f9343c8/a8cc5ec51d65bb755caf1d208ac5b7a1.jpg"
PREVIEW = r"C:/Users/30855/WorkBuddy/2026-09-15-16-07-08/shots"

img = Image.open(SRC).convert('RGB')
print('source:', img.size)

# 白色内卡（含锁、绿星、点环）的边界框 —— 按原图目测标定
BOX = (180, 180, 604, 604)
crop = img.crop(BOX)
crop.save(os.path.join(PREVIEW, 'inner-card-crop.png'))
print('inner-card crop:', crop.size, '→ inner-card-crop.png')
