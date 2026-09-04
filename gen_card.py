# -*- coding: utf-8 -*-
"""生成电子名片 business-card.png(2100x1200)— 布局/字号均为参数,调整后重新运行即可。"""
import qrcode
from PIL import Image, ImageDraw, ImageFont

W, H = 2100, 1200
OUT = r"F:\云盘\480398659\WPS云盘\应用\个人电子简历主页\business-card.png"

PHOS = (0, 244, 142)
WHITE = (242, 247, 244)
GRAY = (150, 158, 152)
DIM = (110, 118, 112)
GRID = (13, 22, 18)
FRAME = (0, 45, 27)

F = "C:/Windows/Fonts/"
def mono(sz): return ImageFont.truetype(F + "consola.ttf", sz)
def cjk(sz): return ImageFont.truetype(F + "msyh.ttc", sz)
def cjkb(sz): return ImageFont.truetype(F + "msyhbd.ttc", sz)

im = Image.new("RGB", (W, H), (0, 0, 0))
d = ImageDraw.Draw(im)

# --- 背景网格 ---
for x in range(0, W, 120): d.line([(x, 0), (x, H)], fill=GRID)
for y in range(0, H, 120): d.line([(0, y), (W, y)], fill=GRID)

# --- 外框 + 四角括号 ---
M = 46
d.rectangle([M, M, W - M, H - M], outline=FRAME, width=2)
def bracket(x, y, dx, dy, L=52, t=7, c=PHOS):
    d.rectangle([x, y, x + dx * L, y + t], fill=c)
    d.rectangle([x, y, x + t, y + dy * L], fill=c)
bracket(M - 3, M - 3, 1, 1); bracket(W - M + 3 - 52, M - 3, 1, 1)
bracket(M - 3, H - M + 3 - 7, 1, 1); bracket(W - M + 3 - 52, H - M + 3 - 7, 1, 1)
d.ellipse([1978, 1098, 2006, 1126], fill=PHOS)  # 右下角圆点

def tracked(x, y, text, font, fill, tracking=0):
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tracking
    return x

# --- 左列:终端头 ---
X = 130
d.text((X, 88), "> ./business_card --contact", font=mono(38), fill=PHOS)
d.text((X, 142), "peter5991.github.io", font=mono(34), fill=DIM)

# --- 左列:姓名 ---
d.text((X - 4, 205), "程平 博士", font=cjkb(150), fill=WHITE)
tracked(X + 2, 400, "DR. CHENG PING", mono(54), PHOS, tracking=12)
tracked(X + 2, 478, "MATERIALS × AI RESEARCHER", mono(38), DIM, tracking=8)

d.line([(X, 556), (1150, 556)], fill=(28, 42, 35), width=2)

# --- 左列:信息表 ---
rows = [
    ("AFFIL",  ["芜湖职业技术大学 · 专任教师"], "cjk"),
    ("DEGREE", ["PhD · 昆士兰大学 (UQ)"], "cjk"),
    ("FOCUS",  ["功能材料 × 机器学习"], "cjk"),
    ("MAIL",   ["101508@whit.edu.cn", "peter599177@gmail.com"], "mono"),
    ("ORCID",  ["0000-0001-7111-1179"], "mono"),
]
y = 606
for label, values, kind in rows:
    d.text((X, y + 8), label, font=mono(34), fill=PHOS)
    vy = y
    for v in values:
        f = cjk(44) if kind == "cjk" else mono(40)
        d.text((X + 210, vy), v, font=f, fill=WHITE if kind == "cjk" else GRAY)
        vy += 52
    y = vy + 34

# --- 左列:状态行 ---
sy = H - M - 78
d.text((X, sy), "STATUS", font=mono(32), fill=PHOS)
d.text((X + 210, sy + 2), "OPEN TO COLLABORATION · 安徽芜湖 / WUHU, CHINA", font=cjk(32), fill=DIM)

# --- 右列:二维码 ---
qr = qrcode.QRCode(border=2, box_size=18)
qr.add_data("https://peter5991.github.io")
qr.make(fit=True)
qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
qs = qr_img.size[0]
QX, QY = W - M - 78 - qs, 150
im.paste(qr_img, (QX, QY))
# 二维码外框括号
P = 26
fx, fy = QX - P, QY - P
fw = qs + 2 * P
d.rectangle([fx, fy, fx + fw, fy + fw], outline=(0, 60, 36), width=3)
def qcorner(cx, cy, dx, dy, L=48, t=7):
    d.rectangle([cx if dx > 0 else cx - L, cy, cx if dx < 0 else cx + L, cy + t], fill=PHOS)
    d.rectangle([cx, cy if dy > 0 else cy - L, cx + t, cy if dy < 0 else cy + L], fill=PHOS)
qcorner(fx, fy, 1, 1); qcorner(fx + fw, fy, -1, 1)
qcorner(fx, fy + fw, 1, -1); qcorner(fx + fw, fy + fw, -1, -1)

# --- 右列:二维码下方文字 ---
cx = QX + qs // 2
def center(y, runs):
    w = sum(d.textlength(t, font=f) for t, f, _ in runs)
    x = cx - w / 2
    for t, f, c in runs:
        d.text((x, y), t, font=f, fill=c)
        x += d.textlength(t, font=f)

cy = QY + qs + 66
center(cy, [("SCAN · 扫码访问主页", cjk(46), WHITE)])
center(cy + 68, [("https://peter5991.github.io", mono(42), PHOS)])
center(cy + 150, [("微信 ", cjk(42), WHITE), ("ahcp19950707", mono(44), PHOS)])

im.save(OUT)
print("saved", OUT, "qr", qs)
