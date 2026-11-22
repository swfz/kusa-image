"""スパイク用: 基準画像と案B の出力の差分を数値化し、並べた比較画像を作る"""
import sys
from PIL import Image, ImageChops
import numpy as np

prefix = sys.argv[1] if len(sys.argv) > 1 else "b"
for name in ["light", "dark", "past3", "past19"]:
    a = Image.open(f"baseline/{name}.png").convert("RGB")
    b = Image.open(f"compare/{prefix}-{name}.png").convert("RGB")
    assert a.size == b.size, (name, a.size, b.size)
    d = np.asarray(ImageChops.difference(a, b)).max(axis=2)
    print(f"{name:7s} size={b.size} diff_pixels={(d > 0).sum():6d} ({(d > 0).mean() * 100:.2f}%) big_diff(>64)={(d > 64).sum():5d} mean={d.mean():.3f}")
    # 上: 基準 / 中: 案B / 下: 差分（4倍強調）
    w, h = a.size
    h = min(h, 420)
    cmp = Image.new("RGB", (w, h * 3 + 8), "red")
    cmp.paste(a.crop((0, 0, w, h)), (0, 0))
    cmp.paste(b.crop((0, 0, w, h)), (0, h + 4))
    cmp.paste(Image.fromarray(np.clip(d[:h] * 4, 0, 255).astype("uint8")).convert("RGB"), (0, 2 * h + 8))
    cmp.save(f"compare/side-by-side-{prefix}-{name}.png")
