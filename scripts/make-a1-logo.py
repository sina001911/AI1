"""Render the AI1 ribbon logo SVG into PNG/ICNS/ICO build assets."""
from PIL import Image, ImageDraw
import os, math

OUT = "build"
os.makedirs(OUT, exist_ok=True)

COLORS = [
    (0x22, 0xd3, 0xee),   # cyan
    (0x81, 0x8c, 0xf8),   # indigo
    (0xc0, 0x84, 0xfc),   # violet
]
STEPS = 64


def ribbon_path(width=120, height=120):
    """One continuous stroke: opens the A at bottom-left, climbs the left leg,
    over the apex, down the right leg, then rolls into the 1 (flag, stem, foot)."""
    pts = []
    # left leg up
    for i in range(STEPS):
        t = i / STEPS
        pts.append((30 + 18 * t, 92 - 60 * t))
    # apex + right leg down
    for i in range(STEPS):
        t = i / STEPS
        pts.append((48 + 30 * t, 32 + 34 * t))
    # roll into the 1: up the flag
    for i in range(STEPS // 2):
        t = i / (STEPS // 2)
        pts.append((78 - 10 * t, 66 - 32 * t))
    # down the stem
    for i in range(STEPS):
        t = i / STEPS
        pts.append((68 + 10 * t, 34 + 58 * t))
    # serif foot
    pts.append((78, 92))
    pts.append((66, 92))
    return pts


def draw_logo(size):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size / 120.0

    # halo
    halo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.ellipse([size * 0.12, size * 0.16, size * 0.88, size * 0.88],
               fill=(56, 189, 248, 76))
    im = Image.alpha_composite(im, halo)

    pts = [(x * s, y * s) for x, y in ribbon_path()]
    n = len(pts)
    seg = max(3, n // len(COLORS))
    for i in range(0, n - 1, seg):
        a = pts[i]
        b = pts[min(i + seg, n - 1)]
        c = COLORS[(i // seg) % len(COLORS)]
        d.line([a, b], fill=c + (255,), width=max(2, int(8 * s)), joint="curve")

    # crossbar of the A
    d.line([(42 * s, 66 * s), (76 * s, 66 * s)],
           fill=COLORS[0] + (255,), width=max(2, int(8 * s)), joint="curve")
    return im


for sz in (1024, 512, 256, 128, 64, 48, 32, 24, 16):
    im = draw_logo(sz).convert("RGBA")
    bg = Image.new("RGBA", (sz, sz), (15, 23, 42, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(os.path.join(OUT, f"icons/{sz}x{sz}.png"))

# square app icons
for sz in (1024, 512, 256):
    im = draw_logo(sz).convert("RGBA")
    bg = Image.new("RGBA", (sz, sz), (15, 23, 42, 255))
    bg.alpha_composite(im)
    bg.convert("RGB").save(os.path.join(OUT, f"icon-{sz}.png"))

Image.open(os.path.join(OUT, "icon-1024.png")).save(os.path.join(OUT, "icon.ico"),
    sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
Image.open(os.path.join(OUT, "icon-1024.png")).save(os.path.join(OUT, "icon.png"))
Image.open(os.path.join(OUT, "icon-1024.png")).save(os.path.join(OUT, "logo.png"))

# macOS .icns via Pillow is unsupported; emit a 1024 PNG that electron-builder
# will convert with iconutil on macOS hosts.
# tray icons: ribbon on a circle, for light/dark trays
for name, bg in (("tray_icon_light.png", (255, 255, 255, 255)),
                 ("tray_icon_dark.png", (15, 23, 42, 255))):
    t = draw_logo(28)
    canvas = Image.new("RGBA", (28, 28), bg)
    canvas.alpha_composite(t, (0, 0))
    canvas.convert("RGBA").save(os.path.join(OUT, name))

print("wrote build/icons/*.png, build/icon.ico, build/icon.png, build/logo.png, build/tray_icon*.png")