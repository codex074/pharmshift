#!/usr/bin/env python3
"""
Generate pharmshift user guide PDF with Thai font support.
Output: public/guide.pdf
"""

import os, sys, urllib.request, shutil
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether, PageBreak
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus.flowables import Flowable
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Circle
from reportlab.graphics import renderPDF

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
FONT_DIR    = "/tmp/thai_fonts"
OUTPUT_PATH = os.path.join(PROJECT_DIR, "public", "guide.pdf")

# ─── Thai Font Setup ──────────────────────────────────────────────────────────
def ensure_fonts():
    os.makedirs(FONT_DIR, exist_ok=True)
    fonts = {
        "Sarabun-Regular.ttf": "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Regular.ttf",
        "Sarabun-Bold.ttf":    "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Bold.ttf",
        "Sarabun-Light.ttf":   "https://github.com/google/fonts/raw/main/ofl/sarabun/Sarabun-Light.ttf",
    }
    for fname, url in fonts.items():
        path = os.path.join(FONT_DIR, fname)
        if not os.path.exists(path):
            print(f"Downloading {fname}…")
            urllib.request.urlretrieve(url, path)
    pdfmetrics.registerFont(TTFont("Sarabun",      os.path.join(FONT_DIR, "Sarabun-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("Sarabun-Bold", os.path.join(FONT_DIR, "Sarabun-Bold.ttf")))
    try:
        pdfmetrics.registerFont(TTFont("Sarabun-Light", os.path.join(FONT_DIR, "Sarabun-Light.ttf")))
    except Exception:
        pass

# ─── Colour Palette ───────────────────────────────────────────────────────────
C_PURPLE      = colors.HexColor("#7c3aed")
C_PURPLE_DARK = colors.HexColor("#5b21b6")
C_PURPLE_LITE = colors.HexColor("#ede9fe")
C_INDIGO      = colors.HexColor("#4338ca")
C_INDIGO_LITE = colors.HexColor("#e0e7ff")
C_SKY         = colors.HexColor("#0ea5e9")
C_SKY_LITE    = colors.HexColor("#e0f2fe")
C_EMERALD     = colors.HexColor("#059669")
C_EMERALD_LT  = colors.HexColor("#d1fae5")
C_FUCHSIA     = colors.HexColor("#c026d3")
C_FUCHSIA_LT  = colors.HexColor("#fae8ff")
C_ROSE        = colors.HexColor("#e11d48")
C_ROSE_LITE   = colors.HexColor("#ffe4e6")
C_AMBER       = colors.HexColor("#d97706")
C_AMBER_LITE  = colors.HexColor("#fef3c7")
C_SLATE_50    = colors.HexColor("#f8fafc")
C_SLATE_100   = colors.HexColor("#f1f5f9")
C_SLATE_200   = colors.HexColor("#e2e8f0")
C_SLATE_500   = colors.HexColor("#64748b")
C_SLATE_700   = colors.HexColor("#334155")
C_SLATE_800   = colors.HexColor("#1e293b")
C_WHITE       = colors.white
C_GREEN       = colors.HexColor("#16a34a")
C_GREEN_LITE  = colors.HexColor("#dcfce7")

# ─── Paragraph Styles ─────────────────────────────────────────────────────────
def make_styles():
    return {
        "h1": ParagraphStyle("h1",
            fontName="Sarabun-Bold", fontSize=28, textColor=C_WHITE,
            alignment=TA_CENTER, leading=36, spaceAfter=6),
        "h2": ParagraphStyle("h2",
            fontName="Sarabun-Bold", fontSize=14, textColor=C_SLATE_800,
            leading=20, spaceAfter=4),
        "h3": ParagraphStyle("h3",
            fontName="Sarabun-Bold", fontSize=11, textColor=C_SLATE_700,
            leading=16, spaceAfter=2),
        "body": ParagraphStyle("body",
            fontName="Sarabun", fontSize=10, textColor=C_SLATE_700,
            leading=16, spaceAfter=3),
        "small": ParagraphStyle("small",
            fontName="Sarabun", fontSize=8.5, textColor=C_SLATE_500,
            leading=13),
        "caption": ParagraphStyle("caption",
            fontName="Sarabun", fontSize=8, textColor=C_SLATE_500,
            alignment=TA_CENTER, leading=12),
        "hero_sub": ParagraphStyle("hero_sub",
            fontName="Sarabun", fontSize=12, textColor=colors.HexColor("#ddd6fe"),
            alignment=TA_CENTER, leading=18),
        "tip": ParagraphStyle("tip",
            fontName="Sarabun", fontSize=9.5, textColor=C_SLATE_700,
            leading=15, leftIndent=4),
        "white_bold": ParagraphStyle("white_bold",
            fontName="Sarabun-Bold", fontSize=10, textColor=C_WHITE,
            leading=16),
        "white": ParagraphStyle("white",
            fontName="Sarabun", fontSize=9.5, textColor=colors.HexColor("#e2e8f0"),
            leading=15),
        "url": ParagraphStyle("url",
            fontName="Sarabun-Bold", fontSize=13, textColor=C_INDIGO,
            leading=18),
        "section_label": ParagraphStyle("section_label",
            fontName="Sarabun-Bold", fontSize=7.5,
            textColor=C_SLATE_500, leading=10,
            spaceBefore=0, spaceAfter=2),
    }

# ─── Custom Flowables ─────────────────────────────────────────────────────────
class ColoredRect(Flowable):
    """Full-width rounded colored banner."""
    def __init__(self, height, fill_color, content_fn=None, radius=8):
        super().__init__()
        self._height = height
        self._fill = fill_color
        self._content_fn = content_fn
        self._radius = radius
    def wrap(self, aw, ah):
        self._width = aw
        return aw, self._height
    def draw(self):
        c = self.canv
        c.setFillColor(self._fill)
        c.roundRect(0, 0, self._width, self._height, self._radius, fill=1, stroke=0)
        if self._content_fn:
            self._content_fn(c, self._width, self._height)

class SectionHeader(Flowable):
    """Numbered section header with icon bar."""
    def __init__(self, number, icon, title, subtitle, accent_color, lite_color):
        super().__init__()
        self.number   = number
        self.icon     = icon
        self.title    = title
        self.subtitle = subtitle
        self.accent   = accent_color
        self.lite     = lite_color
        self._height  = 52

    def wrap(self, aw, ah):
        self._width = aw
        return aw, self._height

    def draw(self):
        c = self.canv
        h = self._height

        # Icon circle
        c.setFillColor(self.lite)
        c.circle(22, h/2, 18, fill=1, stroke=0)
        c.setFillColor(self.accent)
        c.setFont("Sarabun-Bold", 20)
        c.drawCentredString(22, h/2 - 7, self.icon)

        # Number badge
        c.setFillColor(self.accent)
        c.circle(40, h - 6, 8, fill=1, stroke=0)
        c.setFillColor(C_WHITE)
        c.setFont("Sarabun-Bold", 9)
        c.drawCentredString(40, h - 9, str(self.number))

        # Title
        c.setFillColor(C_SLATE_800)
        c.setFont("Sarabun-Bold", 14)
        c.drawString(54, h - 19, self.title)

        # Subtitle
        c.setFillColor(C_SLATE_500)
        c.setFont("Sarabun", 9)
        c.drawString(54, h - 33, self.subtitle)

class HeroFlowable(Flowable):
    """Purple gradient hero banner."""
    def wrap(self, aw, ah):
        self._width = aw
        return aw, 140

    def draw(self):
        c = self.canv
        w, h = self._width, 140

        # Background gradient simulation with two rects
        c.setFillColor(colors.HexColor("#7c3aed"))
        c.roundRect(0, 0, w, h, 12, fill=1, stroke=0)
        c.setFillColorCMYK(0, 0, 0, 0, alpha=0)

        # Hospital icon circle
        c.setFillColor(C_WHITE)
        c.roundRect(w/2 - 28, h - 68, 56, 56, 12, fill=1, stroke=0)
        c.setFont("Sarabun", 28)
        c.drawCentredString(w/2, h - 44, "🏥")

        # Title
        c.setFillColor(C_WHITE)
        c.setFont("Sarabun-Bold", 22)
        c.drawCentredString(w/2, h - 85, 'คู่มือใช้งาน WebApp "เวรดี๊ดี"')

        # Subtitle
        c.setFillColor(colors.HexColor("#ddd6fe"))
        c.setFont("Sarabun", 11)
        c.drawCentredString(w/2, h - 102, "สำหรับบุคลากร ฝ่ายเภสัชกรรม โรงพยาบาลอุตรดิตถ์")

        # Feature pills
        pills = ["📅 ดูตารางเวร", "🔄 แลกเวร", "🙋 อยู่เวรแทน", "🔔 แจ้งเตือน", "👤 โปรไฟล์"]
        pill_w, gap = 88, 6
        total_w = len(pills) * pill_w + (len(pills)-1)*gap
        x0 = (w - total_w) / 2
        for i, pill in enumerate(pills):
            px = x0 + i*(pill_w + gap)
            c.setFillColor(colors.HexColor("#ffffff26"))
            c.roundRect(px, 6, pill_w, 20, 10, fill=1, stroke=0)
            c.setFillColor(C_WHITE)
            c.setFont("Sarabun", 8.5)
            c.drawCentredString(px + pill_w/2, 12, pill)

# ─── Builder helpers ─────────────────────────────────────────────────────────
def hline(color=C_SLATE_200, thickness=0.5, space_before=4, space_after=4):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceAfter=space_after, spaceBefore=space_before)

def vspace(n=6):
    return Spacer(1, n)

def tip_table(rows, accent_color, lite_color, icon="💡"):
    """Single tip box as a 1-row table."""
    data = [[Paragraph(f'<font color="#{accent_color.hexval()[2:]}"><b>{icon}</b></font> ' + r, S["tip"]) for r in rows]]
    t = Table([rows], colWidths=[None]*len(rows))
    return t

def two_col_tips(items, S):
    """List of (icon, title, body, accent, lite) → 2-column grid table."""
    cells = []
    for icon, title, body, accent, lite in items:
        inner = [
            [Paragraph(f'<font size="16">{icon}</font>', S["body"]),
             Paragraph(f'<b>{title}</b><br/><font size="8" color="#64748b">{body}</font>', S["body"])],
        ]
        t = Table(inner, colWidths=[20*mm, None])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), lite),
            ("ROUNDEDCORNERS", [6]),
            ("BOX", (0,0), (-1,-1), 0.5, accent),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING", (0,0), (-1,-1), 6),
            ("LEFTPADDING", (0,0), (-1,-1), 8),
            ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ]))
        cells.append(t)
    # Pad to even
    if len(cells) % 2 == 1:
        cells.append(Spacer(1, 1))
    rows = [[cells[i], cells[i+1]] for i in range(0, len(cells), 2)]
    grid = Table(rows, colWidths=["50%", "50%"], spaceBefore=4)
    grid.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 0),
        ("RIGHTPADDING", (0,0), (0,-1), 3),
        ("LEFTPADDING", (1,0), (1,-1), 3),
        ("TOPPADDING", (0,0), (-1,-1), 3),
        ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ]))
    return grid

def card(content_list, accent=C_PURPLE, lite=C_PURPLE_LITE):
    """Wrap content in a styled card table."""
    inner = [[item] for item in content_list]
    t = Table([[c] for c in content_list], colWidths=["100%"])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_WHITE),
        ("BOX", (0,0), (-1,-1), 0.75, C_SLATE_200),
        ("ROUNDEDCORNERS", [10]),
        ("LEFTPADDING", (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    return t

def colored_card(content_list, bg_color, border_color):
    t = Table([[c] for c in content_list], colWidths=["100%"])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), bg_color),
        ("BOX", (0,0), (-1,-1), 1, border_color),
        ("ROUNDEDCORNERS", [8]),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("RIGHTPADDING", (0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ]))
    return t

# ─── Page template ────────────────────────────────────────────────────────────
def on_page(canvas, doc):
    w, h = A4
    # Footer
    canvas.setFillColor(C_SLATE_500)
    canvas.setFont("Sarabun", 8)
    canvas.drawCentredString(w/2, 18, f"🏥 เวรดี๊ดี — คู่มือการใช้งาน   •   utth-shift.vercel.app   •   หน้า {doc.page}")
    # Top rule
    canvas.setStrokeColor(C_PURPLE)
    canvas.setLineWidth(2)
    canvas.line(20*mm, h - 12*mm, w - 20*mm, h - 12*mm)

# ─── Main build ───────────────────────────────────────────────────────────────
def build_pdf():
    ensure_fonts()
    global S
    S = make_styles()

    doc = SimpleDocTemplate(
        OUTPUT_PATH,
        pagesize=A4,
        leftMargin=18*mm, rightMargin=18*mm,
        topMargin=16*mm, bottomMargin=16*mm,
        title='คู่มือการใช้งาน เวรดี๊ดี',
        author='ฝ่ายเภสัชกรรม โรงพยาบาลอุตรดิตถ์',
        subject='User Guide — pharmshift',
    )

    story = []

    # ════════════════════════════════ HERO ════════════════════════════════════
    story.append(HeroFlowable())
    story.append(vspace(12))

    # ════════════════════ 0. เข้าสู่ระบบ / URL ════════════════════════════════
    story.append(KeepTogether([
        # URL banner
        Table([[
            Paragraph("🌐", S["h2"]),
            Paragraph(
                '<font size="7" color="#6366f1"><b>เข้าใช้งานได้ที่</b></font><br/>'
                '<font size="13" color="#4338ca"><b>https://utth-shift.vercel.app/</b></font><br/>'
                '<font size="8" color="#94a3b8">ใช้ได้ทั้ง 💻 PC และ 📱 มือถือ — ไม่ต้องติดตั้งโปรแกรม</font>',
                S["body"]),
        ]], colWidths=[14*mm, None]),
    ]))

    # Login info 2-col
    login_data = [
        [
            Paragraph(
                '<b>🪪 Username</b><br/>'
                '<font size="9">ใช้ <b>Pha ID</b> ประจำตัว<br/><font color="#94a3b8">เช่น PHA001, PHA123</font></font>',
                S["body"]),
            Paragraph(
                '<b>🔑 Password ครั้งแรก</b><br/>'
                '<font size="9">ใช้รหัส <b><font size="14">1234</font></b><br/>'
                '<font color="#94a3b8">ระบบจะให้ตั้งรหัสใหม่ทันที</font></font>',
                S["body"]),
        ]
    ]
    login_t = Table(login_data, colWidths=["50%", "50%"])
    login_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (0,-1), C_INDIGO_LITE),
        ("BACKGROUND", (1,0), (1,-1), C_AMBER_LITE),
        ("BOX",        (0,0), (0,-1), 0.5, C_INDIGO),
        ("BOX",        (1,0), (1,-1), 0.5, C_AMBER),
        ("ROUNDEDCORNERS", [6]),
        ("VALIGN",     (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",(0,0), (-1,-1), 10),
        ("RIGHTPADDING",(0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING",(0,0), (-1,-1), 8),
    ]))

    warn_t = Table([[
        Paragraph("⚠️  หลังตั้งรหัสผ่านใหม่แล้ว <b>อย่าลืมจำรหัสที่ตั้งไว้</b> "
                  "หากลืมให้ติดต่อผู้ดูแลระบบเพื่อ reset", S["tip"])
    ]])
    warn_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), colors.HexColor("#fffbeb")),
        ("BOX",        (0,0), (-1,-1), 0.75, C_AMBER),
        ("ROUNDEDCORNERS", [6]),
        ("LEFTPADDING",(0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
    ]))

    url_block = Table([[
        Paragraph("🌐  เข้าใช้งานได้ที่", S["section_label"]),
    ]])
    url_block.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_INDIGO_LITE),
        ("BOX",        (0,0), (-1,-1), 1, C_INDIGO),
        ("ROUNDEDCORNERS", [8]),
        ("LEFTPADDING",(0,0), (-1,-1), 12),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
    ]))

    outer = Table([
        [Paragraph("🌐  เข้าใช้งานได้ที่", S["section_label"])],
        [Paragraph("https://utth-shift.vercel.app/", S["url"])],
        [Paragraph('<font size="8" color="#94a3b8">ใช้ได้ทั้ง 💻 PC และ 📱 มือถือ — ไม่ต้องติดตั้งโปรแกรม</font>', S["body"])],
        [vspace(4)],
        [login_t],
        [vspace(4)],
        [warn_t],
    ])
    outer.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_INDIGO_LITE),
        ("BOX",        (0,0), (-1,-1), 1.5, colors.HexColor("#818cf8")),
        ("ROUNDEDCORNERS", [10]),
        ("LEFTPADDING",(0,0), (-1,-1), 14),
        ("RIGHTPADDING",(0,0), (-1,-1), 14),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
    ]))
    story.append(outer)
    story.append(vspace(10))

    # ════════════════════ 1. ติดตั้งแอป ════════════════════════════════════════
    story.append(SectionHeader(1, "📱", "เริ่มต้น — เซฟแอปลงมือถือ",
        "ไม่ต้องโหลดจาก App Store เข้าผ่านเบราว์เซอร์แล้วเซฟลงหน้าจอหลัก",
        C_INDIGO, C_INDIGO_LITE))
    story.append(vspace(6))

    def os_steps(label, steps, accent, lite):
        rows = [[Paragraph(label, S["h3"])]]
        for i, s in enumerate(steps, 1):
            rows.append([Table([[
                Paragraph(f'<b><font color="#{accent.hexval()[2:]}">{i}</font></b>', S["body"]),
                Paragraph(s, S["body"]),
            ]], colWidths=[8*mm, None])])
        t = Table(rows)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), lite),
            ("BOX",        (0,0), (-1,-1), 0.75, accent),
            ("ROUNDEDCORNERS", [8]),
            ("LEFTPADDING",(0,0), (-1,-1), 10),
            ("TOPPADDING", (0,0), (-1,-1), 6),
            ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ]))
        return t

    ios_steps = os_steps("🍎 iPhone / iPad (Safari)",
        ["เปิดเว็บผ่าน <b>Safari</b> เท่านั้น",
         'กดปุ่ม <b>"แชร์" (□↑)</b> ด้านล่างหน้าจอ',
         'เลือก <b>"เพิ่มไปยังหน้าจอโฮม"</b>'],
        C_INDIGO, C_INDIGO_LITE)

    and_steps = os_steps("🤖 Android (Chrome)",
        ["เปิดเว็บผ่าน <b>Chrome</b>",
         "กด <b>⋮</b> มุมขวาบน",
         'เลือก <b>"เพิ่มลงในหน้าจอหลัก"</b>'],
        C_EMERALD, C_EMERALD_LT)

    install_row = Table([[ios_steps, and_steps]], colWidths=["50%", "50%"])
    install_row.setStyle(TableStyle([
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("RIGHTPADDING", (0,0), (0,-1), 4),
        ("LEFTPADDING",  (1,0), (1,-1), 4),
        ("LEFTPADDING",  (0,0), (0,-1), 0),
        ("RIGHTPADDING", (1,0), (1,-1), 0),
    ]))
    story.append(install_row)
    story.append(vspace(10))

    # ════════════════════ 2. Header ════════════════════════════════════════════
    story.append(SectionHeader(2, "🗂️", "แถบด้านบน",
        "ปุ่มหลักที่ใช้บ่อยอยู่ตรงนี้ทั้งหมด", C_SKY, C_SKY_LITE))
    story.append(vspace(6))

    header_items = [
        ("◀▶", "เลื่อนดูเดือน",    "กดซ้าย/ขวาสลับเดือนที่ต้องการดู",              C_SLATE_500, C_SLATE_100),
        ("⇄",  "สลับมุมมอง",      "ทุกเวร = ปฏิทินรวม | ของฉัน = เฉพาะเวรตัวเอง",  C_SLATE_500, C_SLATE_100),
        ("↻",  "Refresh ข้อมูล",  "กดเพื่อโหลดข้อมูลล่าสุดทันที",                   C_SKY,       C_SKY_LITE),
        ("🔔", "การแจ้งเตือน",    "ตัวเลขแดง = มีการแจ้งเตือนที่ยังไม่ได้อ่าน",     C_AMBER,     C_AMBER_LITE),
        ("?",  "คู่มือ",           "กดดูวิธีใช้ได้ตลอด",                             C_PURPLE,    C_PURPLE_LITE),
        ("👤", "โปรไฟล์",         "กดเพื่อแก้ไขข้อมูลส่วนตัว",                       C_INDIGO,    C_INDIGO_LITE),
    ]
    story.append(two_col_tips(header_items, S))
    story.append(vspace(10))

    # ════════════════════ 3. ดูตาราง ══════════════════════════════════════════
    story.append(SectionHeader(3, "📅", "ดูตารางเวร (มุมมองทุกคน)",
        "ปฏิทินรวมของทุกคน แยกสีตามช่วงเวลา", C_EMERALD, C_EMERALD_LT))
    story.append(vspace(6))

    shift_data = [
        ["☀️\nเวรเช้า",  "🌤️\nเวรบ่าย", "🌙\nเวรดึก", "🌅\nรุ่งอรุณ"],
        ["08:30–16:30", "16:30–00:00", "00:00–08:30", "07:00–08:30"],
    ]
    shift_colors = [
        colors.HexColor("#E8F9FA"), colors.HexColor("#F3EDF8"),
        colors.HexColor("#EEF0FF"), colors.HexColor("#FEF3DC"),
    ]
    shift_borders = [
        colors.HexColor("#9FDCE0"), colors.HexColor("#9E76B4"),
        colors.HexColor("#99ABFF"), colors.HexColor("#FFCA72"),
    ]
    shift_text = [
        colors.HexColor("#134e4a"), colors.HexColor("#581c87"),
        colors.HexColor("#312e81"), colors.HexColor("#78350f"),
    ]

    shift_t = Table(shift_data, colWidths=["25%"]*4)
    shift_style = [
        ("ALIGN",   (0,0), (-1,-1), "CENTER"),
        ("VALIGN",  (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",(0,0), (-1,-1), "Sarabun-Bold"),
        ("FONTSIZE",(0,0), (-1,-1), 10),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("ROUNDEDCORNERS", [6]),
    ]
    for col, (bg, border, txt) in enumerate(zip(shift_colors, shift_borders, shift_text)):
        shift_style += [
            ("BACKGROUND", (col,0), (col,-1), bg),
            ("TEXTCOLOR",  (col,0), (col,-1), txt),
            ("BOX",        (col,0), (col,-1), 1, border),
        ]
    shift_t.setStyle(TableStyle(shift_style))
    story.append(shift_t)
    story.append(vspace(6))

    tip_items = [
        ("🖱️", "กดที่วันในปฏิทิน",     "เพื่อดูว่าใครขึ้นเวรในวันนั้นบ้าง",              C_EMERALD, C_EMERALD_LT),
        ("👆", "กดที่ชื่อเพื่อนร่วมงาน", "เพื่อส่งคำขออยู่เวรแทน หรือแลกเวรกัน",          C_SLATE_500, C_SLATE_100),
    ]
    story.append(two_col_tips(tip_items, S))
    story.append(vspace(10))

    # ════════════════════ 4. เวรของฉัน ════════════════════════════════════════
    story.append(SectionHeader(4, "🗓️", 'มุมมอง "เวรของฉัน"',
        "ดูเฉพาะเวรของตัวเอง พร้อมสรุปรายเดือน", C_PURPLE, C_PURPLE_LITE))
    story.append(vspace(6))

    summary_data = [
        [Paragraph("☀️ เช้า ×3", S["body"]),
         Paragraph("🌤️ บ่าย ×5", S["body"]),
         Paragraph("🌙 ดึก ×4",  S["body"]),
         Paragraph("🌅 รุ่งอรุณ ×1", S["body"]),
         Paragraph("รวม 13 เวร", S["body"])],
    ]
    sum_colors = [
        colors.HexColor("#E8F9FA"), colors.HexColor("#F3EDF8"),
        colors.HexColor("#EEF0FF"), colors.HexColor("#FEF3DC"),
        colors.HexColor("#f0fdf4"),
    ]
    sum_borders = [
        colors.HexColor("#9FDCE0"), colors.HexColor("#9E76B4"),
        colors.HexColor("#99ABFF"), colors.HexColor("#FFCA72"),
        colors.HexColor("#86efac"),
    ]
    sum_t = Table(summary_data, colWidths=["20%"]*5)
    sum_style = [
        ("ALIGN",  (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",(0,0),(-1,-1),6),
        ("BOTTOMPADDING",(0,0),(-1,-1),6),
        ("FONTNAME",(0,0),(-1,-1),"Sarabun-Bold"),
        ("FONTSIZE",(0,0),(-1,-1),9),
    ]
    for col, (bg, border) in enumerate(zip(sum_colors, sum_borders)):
        sum_style += [
            ("BACKGROUND", (col,0),(col,-1), bg),
            ("BOX",        (col,0),(col,-1), 0.75, border),
            ("ROUNDEDCORNERS", [6]),
        ]
    sum_t.setStyle(TableStyle(sum_style))

    story.append(Paragraph("สรุปเวรเดือนนี้ (ตัวอย่าง)", S["section_label"]))
    story.append(sum_t)
    story.append(vspace(6))

    my_shift_items = [
        ("👆", "กดที่แถบเวร",
         "เพื่อดูรายละเอียดว่าเวรนี้ได้มาจากไหน (มอบหมาย / แลก / รับมา)",
         C_PURPLE, C_PURPLE_LITE),
        ("🔴", "จุดสีแดง",
         "บอกว่ามีคำขอแลกเวรที่รอการตรวจสอบอยู่สำหรับเวรนี้",
         C_ROSE,   C_ROSE_LITE),
    ]
    story.append(two_col_tips(my_shift_items, S))

    # Origin detail
    story.append(vspace(4))
    origin_data = [
        [Paragraph("ที่มาของเวร — 3 รูปแบบที่เป็นไปได้", S["section_label"])],
        [Table([
            [Paragraph("✅  <b>ได้รับมอบหมาย</b> ตั้งแต่ประกาศตารางเวร", S["tip"]),
             Paragraph("🔀  <b>แลกเวร</b> กับเพื่อนร่วมงาน",              S["tip"]),
             Paragraph("👋  <b>รับเวร</b> (อยู่เวรแทน)", S["tip"])],
        ], colWidths=["33.3%"]*3,
        style=TableStyle([
            ("BACKGROUND", (0,0),(0,-1), colors.HexColor("#F8F5FC")),
            ("BACKGROUND", (1,0),(1,-1), colors.HexColor("#EEF0FF")),
            ("BACKGROUND", (2,0),(2,-1), colors.HexColor("#ecfdf5")),
            ("BOX",(0,0),(0,-1),0.75,colors.HexColor("#D8C8EC")),
            ("BOX",(1,0),(1,-1),0.75,colors.HexColor("#99ABFF")),
            ("BOX",(2,0),(2,-1),0.75,colors.HexColor("#6ee7b7")),
            ("ROUNDEDCORNERS",[6]),
            ("TOPPADDING",(0,0),(-1,-1),7),
            ("BOTTOMPADDING",(0,0),(-1,-1),7),
            ("LEFTPADDING",(0,0),(-1,-1),8),
        ]))],
    ]
    origin_t = Table(origin_data)
    story.append(origin_t)
    story.append(vspace(10))

    # ════════════════════ 5. แลกเวร / อยู่เวรแทน ═════════════════════════════
    story.append(SectionHeader(5, "🔄", "ส่งคำขอแลกเวร / อยู่เวรแทน",
        "2 รูปแบบ เลือกได้ตามความต้องการ", C_FUCHSIA, C_FUCHSIA_LT))
    story.append(vspace(6))

    def request_box(title, icon, steps, accent, lite):
        rows = [[Paragraph(f'{icon}  <b>{title}</b>', S["h3"])]]
        for i, s in enumerate(steps, 1):
            rows.append([Table([[
                Paragraph(f'<b><font color="#{accent.hexval()[2:]}">{i}</font></b>', S["body"]),
                Paragraph(s, S["body"]),
            ]], colWidths=[8*mm, None])])
        t = Table(rows)
        t.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,-1), lite),
            ("BOX",(0,0),(-1,-1),1.5,accent),
            ("ROUNDEDCORNERS",[8]),
            ("LEFTPADDING",(0,0),(-1,-1),10),
            ("TOPPADDING",(0,0),(-1,-1),8),
            ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ]))
        return t

    cover_box = request_box("อยู่เวรแทน", "🙋",
        ["กดที่วันเวรของคนที่ต้องการช่วย",
         "กดที่ <b>ชื่อเขา</b> ในปฏิทิน",
         'เลือก <b>"อยู่เวรแทน"</b> แล้วกดส่ง',
         "รอเจ้าของเวรกด <b>ยืนยัน</b>"],
        C_EMERALD, C_EMERALD_LT)

    swap_box = request_box("แลกเวร", "⇄",
        ["กดที่วันที่และเวรของคนที่ต้องการแลก",
         'เลือก <b>"แลกเวร"</b>',
         "เลือกวันที่และเวรของเราที่จะให้เขาอยู่แทน",
         "กดส่ง รออีกฝ่ายกด <b>ยืนยัน</b>"],
        C_INDIGO, C_INDIGO_LITE)

    req_row = Table([[cover_box, swap_box]], colWidths=["50%","50%"])
    req_row.setStyle(TableStyle([
        ("VALIGN",(0,0),(-1,-1),"TOP"),
        ("RIGHTPADDING",(0,0),(0,-1),4),
        ("LEFTPADDING",(1,0),(1,-1),4),
        ("LEFTPADDING",(0,0),(0,-1),0),
        ("RIGHTPADDING",(1,0),(1,-1),0),
    ]))
    story.append(req_row)
    story.append(vspace(10))

    # ════════════════════ 6. การแจ้งเตือน ════════════════════════════════════
    story.append(SectionHeader(6, "🔔", "การแจ้งเตือน & ตอบรับคำขอ",
        "ระบบจะแจ้งเตือนทุกครั้งที่มีคำขอใหม่", C_ROSE, C_ROSE_LITE))
    story.append(vspace(6))

    notif_items = [
        ("⇄",  "แลกเวร",         "A เสนอแลกเวร...ของเขา กับเวร...ของคุณ",    C_INDIGO,  C_INDIGO_LITE),
        ("🙋", "อยู่เวรแทน",    "A ต้องการขออยู่เวร...แทนคุณ",              C_EMERALD, C_EMERALD_LT),
        ("📤", "โอนเวร",         "A ต้องการยกเวร...ให้คุณ",                   C_PURPLE,  C_PURPLE_LITE),
        ("📋", "Admin มอบหมาย", "Admin เพิ่ม/เปลี่ยนเวรให้คุณ",             C_AMBER,   C_AMBER_LITE),
    ]
    story.append(two_col_tips(notif_items, S))
    story.append(vspace(6))

    # Accept / Reject flow
    accept_t = Table([[
        Paragraph(
            '📌 <b>วิธีตอบรับ</b><br/>'
            '<font size="9">กดปุ่ม <b>🟢 ยืนยัน</b> หรือ <b>🔴 ปฏิเสธ</b> ในหน้าแจ้งเตือน<br/>'
            'ระบบจะอัปเดตตารางเวรให้อัตโนมัติทันที</font>', S["body"]),
        Paragraph(
            '💡 <b>Push Notification</b><br/>'
            '<font size="9">กด <b>"อนุญาต"</b> ตอนที่เบราว์เซอร์ถาม เพื่อรับการแจ้งเตือน<br/>'
            'แม้ไม่ได้เปิดแอปอยู่</font>', S["body"]),
    ]], colWidths=["50%","50%"])
    accept_t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1), colors.HexColor("#f0fdf4")),
        ("BACKGROUND",(1,0),(1,-1), colors.HexColor("#fff7ed")),
        ("BOX",(0,0),(0,-1),0.75,C_EMERALD),
        ("BOX",(1,0),(1,-1),0.75,C_AMBER),
        ("ROUNDEDCORNERS",[6]),
        ("LEFTPADDING",(0,0),(-1,-1),10),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
    ]))
    story.append(accept_t)
    story.append(vspace(10))

    # ════════════════════ 7. โปรไฟล์ ═════════════════════════════════════════
    story.append(SectionHeader(7, "👤", "โปรไฟล์ & ตั้งค่าบัญชี",
        "กดรูปโปรไฟล์ (วงกลมมุมขวาบน) เพื่อแก้ไขข้อมูลส่วนตัว",
        C_AMBER, C_AMBER_LITE))
    story.append(vspace(6))

    profile_items = [
        ("✏️", "คำนำหน้า / ชื่อ / นามสกุล", "แก้ไขชื่อที่แสดงในระบบ",                       C_SLATE_500, C_SLATE_100),
        ("🏷️", "ชื่อเล่น",                   "ชื่อที่แสดงบนตารางเวร — ตั้งสั้นกระชับ เช่น ปอง, อ้อม", C_PURPLE,    C_PURPLE_LITE),
        ("💼", "เลขที่รับเงินเดือน",          "ใช้เป็นหลักฐานเบิกค่าตอบแทน — ตรวจสอบให้ถูกต้อง",    C_INDIGO,    C_INDIGO_LITE),
        ("🔐", "เปลี่ยนรหัสผ่าน",            "ปล่อยว่างถ้าไม่ต้องการเปลี่ยน",                       C_AMBER,     C_AMBER_LITE),
    ]
    story.append(two_col_tips(profile_items, S))
    story.append(vspace(4))

    logout_t = Table([[
        Paragraph("🚪  <b>ออกจากระบบ</b> — กดปุ่มออกจากระบบในแถบบน ระบบจะถามยืนยัน 1 ครั้งก่อนออก", S["tip"])
    ]])
    logout_t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), colors.HexColor("#fff1f2")),
        ("BOX",(0,0),(-1,-1),0.75,C_ROSE),
        ("ROUNDEDCORNERS",[6]),
        ("LEFTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
    ]))
    story.append(logout_t)
    story.append(vspace(10))

    # ════════════════════ 8. Export / ค่าตอบแทน ══════════════════════════════
    story.append(SectionHeader(8, "🖨️", "ตารางเวร & ค่าตอบแทน",
        "ปุ่มอยู่บน Header ฝั่งขวา ใช้ได้ในหน้าปฏิทินรวม",
        C_GREEN, C_GREEN_LITE))
    story.append(vspace(6))

    export_items = [
        ("📅", "ตารางเวร Excel (.xlsx)",
         "ดาวน์โหลดตารางเวรเป็นไฟล์ .xlsx สำหรับปริ้นติดบอร์ดหรือเก็บเป็นไฟล์สำรอง แสดงชื่อทุกคนพร้อมเวรแยกตามวันและแผนก",
         C_GREEN, C_GREEN_LITE),
        ("💰", "ค่าตอบแทน",
         "ดูสรุปค่าตอบแทนของตัวเอง — เวรประเภทไหน วันที่เท่าไหร่ ได้รับเท่าไหร่ ระบบคำนวณจากข้อมูลเวรจริงให้อัตโนมัติ",
         C_AMBER, C_AMBER_LITE),
    ]
    story.append(two_col_tips(export_items, S))
    story.append(vspace(4))

    export_tips = Table([[
        Paragraph("📋  ไฟล์ Excel สามารถเปิดด้วย <b>Microsoft Excel</b> หรือ <b>Google Sheets</b> ได้ทันที", S["tip"]),
        Paragraph("⚠️  ตรวจสอบ <b>ชื่อ-นามสกุล</b> และ <b>เลขที่เงินเดือน</b> ในโปรไฟล์ให้ถูกต้องเสมอ เพราะข้อมูลนี้ใช้เป็นหลักฐานเบิกค่าตอบแทน", S["tip"]),
    ]], colWidths=["50%","50%"])
    export_tips.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(0,-1), colors.HexColor("#f0fdf4")),
        ("BACKGROUND",(1,0),(1,-1), C_AMBER_LITE),
        ("BOX",(0,0),(0,-1),0.75,C_GREEN),
        ("BOX",(1,0),(1,-1),0.75,C_AMBER),
        ("ROUNDEDCORNERS",[6]),
        ("LEFTPADDING",(0,0),(-1,-1),10),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
    ]))
    story.append(export_tips)
    story.append(vspace(10))

    # ════════════════════ Tips Summary ════════════════════════════════════════
    tips = [
        ("✦", "กด <b>↻ Refresh</b> ถ้าตารางดูไม่อัปเดต"),
        ("✦", "แลกเวรข้ามเดือนได้! เลื่อนเดือนในปฏิทินเล็กได้เลย"),
        ("✦", "จุดสีแดง 🔴 = มีคำขอรอ ให้ตรวจสอบ"),
        ("✦", 'กดที่แถบเวรใน "เวรของฉัน" เพื่อดูว่าเวรมาจากไหน'),
        ("✦", "การแลก/โอน/รับเวรจะอัปเดตตารางทันทีหลังยืนยัน"),
        ("✦", "กดปุ่ม <b>?</b> ใน header เพื่อดูวิธีใช้ได้ตลอด"),
    ]
    tip_rows = [[
        Paragraph(f'<font color="#fde68a">✦</font>  {tips[i][1]}', S["white"]),
        Paragraph(f'<font color="#fde68a">✦</font>  {tips[i+1][1]}', S["white"]),
    ] for i in range(0, len(tips), 2)]
    tip_rows.insert(0, [Paragraph("⭐  เทคนิคการใช้งานที่ควรรู้", ParagraphStyle(
        "tiphead", fontName="Sarabun-Bold", fontSize=13, textColor=C_WHITE,
        alignment=TA_CENTER, leading=20, spaceAfter=6)), ""])

    tips_t = Table(tip_rows, colWidths=["50%","50%"])
    tips_t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), C_PURPLE_DARK),
        ("SPAN",       (0,0), (1, 0)),
        ("ROUNDEDCORNERS", [10]),
        ("LEFTPADDING", (0,0),(-1,-1), 14),
        ("RIGHTPADDING",(0,0),(-1,-1), 14),
        ("TOPPADDING",  (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1), 8),
        ("ALIGN", (0,0),(1,0),"CENTER"),
        ("VALIGN",(0,0),(-1,-1),"TOP"),
    ]))
    story.append(tips_t)
    story.append(vspace(8))

    # ════════════════════ Footer ══════════════════════════════════════════════
    footer_t = Table([[
        Paragraph(
            '🏥  <b>เวรดี๊ดี</b>  •  ฝ่ายเภสัชกรรม โรงพยาบาลอุตรดิตถ์<br/>'
            '<font size="8" color="#94a3b8">utth-shift.vercel.app</font>',
            ParagraphStyle("footer", fontName="Sarabun", fontSize=10,
                           textColor=C_SLATE_500, alignment=TA_CENTER, leading=16))
    ]])
    footer_t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), C_SLATE_100),
        ("BOX",(0,0),(-1,-1),0,C_WHITE),
        ("ROUNDEDCORNERS",[8]),
        ("TOPPADDING",(0,0),(-1,-1),10),
        ("BOTTOMPADDING",(0,0),(-1,-1),10),
    ]))
    story.append(footer_t)

    # ────────────────────────────────────────────────────────────────────────
    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅  PDF saved → {OUTPUT_PATH}")

if __name__ == "__main__":
    build_pdf()
