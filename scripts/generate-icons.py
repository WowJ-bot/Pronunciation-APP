#!/usr/bin/env python3
"""生成 PWA 所需的各尺寸图标。

刻意只用 Python 标准库（zlib + struct 手写 PNG），不依赖 Pillow，
这样在任何机器上 `python scripts/generate-icons.py` 都能直接跑。

设计：品牌靛蓝底 + 白色声波条。几何图形在任意尺寸下都能保持清晰，
不需要字体，也不会因为渲染环境不同而变形。

产出（写入 public/）：
  icon-192.png            安卓 / Chrome 清单图标（圆角，透明角）
  icon-512.png           同上，高清
  icon-maskable-512.png  安卓自适应图标（满幅底色 + 内容收进安全区）
  apple-touch-icon.png   iOS/iPadOS 添加到主屏幕用（180×180，满幅）
"""

import math
import os
import struct
import zlib

BRAND = (79, 70, 229)   # #4f46e5
WHITE = (255, 255, 255)

# 五根声波条的高度比例，中间最高，观感上像一段语音波形
BARS = [0.45, 0.70, 0.92, 0.70, 0.45]

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")


def rrect_sdf(px, py, cx, cy, hw, hh, r):
    """圆角矩形的有符号距离：<= 0 表示在内部。"""
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    outside = math.hypot(max(qx, 0.0), max(qy, 0.0))
    inside = min(max(qx, qy), 0.0)
    return outside + inside - r


def segment_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    if denom == 0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / denom
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def bar_geometry(size, scale):
    """返回五根胶囊条：(x0, y0, x1, y1, radius)。"""
    bar_w = size * 0.062 * scale
    gap = size * 0.042 * scale
    total = len(BARS) * bar_w + (len(BARS) - 1) * gap
    left = (size - total) / 2
    max_h = size * 0.50 * scale
    radius = bar_w / 2

    bars = []
    for i, ratio in enumerate(BARS):
        h = max(max_h * ratio, bar_w)
        cx = left + i * (bar_w + gap) + bar_w / 2
        top = (size - h) / 2
        bars.append((cx, top + radius, cx, top + h - radius, radius))
    return bars


def render(size, scale=1.0, rounded=True, corner_ratio=0.23, bleed=False):
    """渲染一张 RGBA 位图，4×4 超采样做抗锯齿。"""
    samples = 4
    total_samples = samples * samples
    inv = 1.0 / total_samples
    step = 1.0 / samples

    r = size * corner_ratio
    half = size / 2
    bars = bar_geometry(size, scale)

    # 逐条计算包围盒，避免整幅图都去做距离运算
    bar_boxes = []
    for (ax, ay, bx, by, br) in bars:
        bar_boxes.append((ax - br, ay - br, bx + br, by + br))

    pixels = bytearray(size * size * 4)

    for y in range(size):
        row_base = y * size * 4
        for x in range(size):
            r_acc = g_acc = b_acc = 0
            hits = 0

            for sy in range(samples):
                py = y + (sy + 0.5) * step
                for sx in range(samples):
                    px = x + (sx + 0.5) * step

                    if bleed:
                        in_bg = True
                    elif rounded:
                        in_bg = rrect_sdf(px, py, half, half, half, half, r) <= 0
                    else:
                        in_bg = True

                    if not in_bg:
                        continue

                    in_ink = False
                    for (ax, ay, bx, by, br), box in zip(bars, bar_boxes):
                        if box[0] <= px <= box[2] and box[1] <= py <= box[3]:
                            if segment_distance(px, py, ax, ay, bx, by) <= br:
                                in_ink = True
                                break

                    color = WHITE if in_ink else BRAND
                    r_acc += color[0]
                    g_acc += color[1]
                    b_acc += color[2]
                    hits += 1

            idx = row_base + x * 4
            if hits:
                pixels[idx] = r_acc // hits
                pixels[idx + 1] = g_acc // hits
                pixels[idx + 2] = b_acc // hits
                pixels[idx + 3] = round(hits * inv * 255)
            # hits 为 0 时保持全透明

    return bytes(pixels)


def write_png(path, size, rgba):
    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)  # filter type 0
        raw.extend(rgba[y * stride:(y + 1) * stride])

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(path, "wb") as fh:
        fh.write(png)
    return len(png)


def main():
    out_dir = os.path.normpath(OUT_DIR)
    os.makedirs(out_dir, exist_ok=True)

    jobs = [
        # (文件名, 尺寸, 缩放, 圆角, 满幅)
        ("icon-192.png", 192, 1.0, True, False),
        ("icon-512.png", 512, 1.0, True, False),
        ("icon-maskable-512.png", 512, 0.68, False, True),
        ("apple-touch-icon.png", 180, 1.0, False, True),
    ]

    for name, size, scale, rounded, bleed in jobs:
        rgba = render(size, scale=scale, rounded=rounded, bleed=bleed)
        path = os.path.join(out_dir, name)
        written = write_png(path, size, rgba)
        print(f"{name}: {size}x{size}, {written} bytes")


if __name__ == "__main__":
    main()
