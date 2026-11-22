"""スパイク用: Noto Mono 10px の文字ごとのアルファマスク（4つのサブピクセル位相）を TS モジュールとして出力する。

使い方: uv run --no-project --with pillow python -I spike/scripts/build-glyphs.py <font.ttf> <out.ts>
"""
import base64
import json
import sys

from PIL import ImageFont

FONT_SIZE = 10
PHASES = 4
# 描画で使う文字: 数字・サマリー文・月名・曜日・凡例・期間表記・ユーザー名には使わない
CHARS = sorted(set(
    "0123456789 ()/~-:.,"
    "contributions in the last year max day"
    "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec"
    "Mon Wed Fri Less More"
))

font_path, out_path = sys.argv[1], sys.argv[2]
font = ImageFont.truetype(font_path, FONT_SIZE)
ascent, descent = font.getmetrics()
advance = font.getlength("M")  # 等幅なので全文字同じ

glyphs = {}
blob = bytearray()
for ch in CHARS:
    for phase in range(PHASES):
        # start に小数を渡すとサブピクセル位置でラスタライズされる
        mask, offset = font.getmask2(ch, mode="L", anchor="ls", start=(phase / PHASES, 0))
        w, h = mask.size
        data = bytes(mask)
        glyphs.setdefault(ch, []).append({"x": offset[0], "y": offset[1], "w": w, "h": h, "o": len(blob)})
        blob += data

with open(out_path, "w") as f:
    f.write("// 自動生成: spike/scripts/build-glyphs.py（手で編集しない）\n")
    f.write(f"export const ADVANCE = {advance};\n")
    f.write(f"export const PHASES = {PHASES};\n")
    f.write("export type Glyph = { x: number; y: number; w: number; h: number; o: number };\n")
    f.write(f"export const GLYPHS: Record<string, Glyph[]> = {json.dumps(glyphs, separators=(',', ':'))};\n")
    f.write(f'export const MASKS_BASE64 = "{base64.b64encode(blob).decode()}";\n')

print(f"chars={len(CHARS)} phases={PHASES} advance={advance} ascent={ascent} descent={descent} mask_bytes={len(blob)}")
