#!/usr/bin/env python3
"""
generate_icons.py — カレンダー+プラスアイコン PNG 生成（16/48/128px）
モノクロ線テイスト: 単色・細線・塗りなし
PIL(Pillow) 使用
"""

import os
from PIL import Image, ImageDraw

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUTPUT_DIR, exist_ok=True)

SIZES = [16, 48, 128]

# アイコンカラー（単色・デザインルール準拠: ハードコード最小限）
FG  = (26, 86, 219)   # --color-accent #1a56db
BG  = (255, 255, 255) # 白背景

def draw_icon(size):
    img  = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad   = max(2, size // 10)
    lw    = max(1, size // 20)  # 線幅

    # カレンダー外枠（角丸矩形の代わりに矩形）
    left  = pad
    top   = pad + size // 6  # ヘッダー分下げる
    right = size - pad - 1
    bot   = size - pad - 1

    # 外枠
    draw.rectangle([left, top, right, bot], outline=FG, width=lw)

    # ヘッダーライン（横線）
    header_y = top + (bot - top) // 4
    draw.line([left, header_y, right, header_y], fill=FG, width=lw)

    # 左右の「つまみ」（縦線2本、外枠より上）
    pin_h  = size // 6
    pin_y1 = pad
    pin_y2 = pad + pin_h
    pin_x1 = left + (right - left) // 3
    pin_x2 = left + 2 * (right - left) // 3
    draw.line([pin_x1, pin_y1, pin_x1, pin_y2], fill=FG, width=lw)
    draw.line([pin_x2, pin_y1, pin_x2, pin_y2], fill=FG, width=lw)

    # ＋アイコン（カレンダー本体中央下部）
    cx   = (left + right) // 2
    cy   = header_y + (bot - header_y) // 2
    arm  = (bot - header_y) // 4
    arm  = max(3, arm)
    plus_lw = max(1, lw + 1)

    draw.line([cx - arm, cy, cx + arm, cy], fill=FG, width=plus_lw)
    draw.line([cx, cy - arm, cx, cy + arm], fill=FG, width=plus_lw)

    return img

for sz in SIZES:
    icon = draw_icon(sz)
    path = os.path.join(OUTPUT_DIR, f"icon{sz}.png")
    icon.save(path, "PNG")
    print(f"Generated: {path} ({sz}x{sz})")

print("Done.")
