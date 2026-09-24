#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_02.py — 生成 slides/02.slide

数据来源：liaj045_liaj001_qr_field_list.xlsx（纯标准库解析，无 openpyxl）
版面：上半 4 栏（OCR 实截图 + 3 面 Excel 风网格），下半项目数条。无判断分支。
"""
import re, zipfile
import xml.etree.ElementTree as ET

XLSX = "/Users/jade/project/NeosAI/prototypes/workflow-ph2/liaj045_liaj001_qr_field_list.xlsx"
OUT = "/Users/jade/project/NeosAI/prototypes/workflow-ph2/LIAJ诊断书QR追加确认事项/slides/02.slide"

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# ---------- xlsx 解析 ----------
def load_xlsx(path):
    z = zipfile.ZipFile(path)
    ss = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(NS + "si"):
        ss.append("".join(t.text or "" for t in si.iter(NS + "t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rmap = {r.get("Id"): r.get("Target") for r in rels}
    sheets = {}
    for s in wb.iter(NS + "sheet"):
        sheets[s.get("name")] = rmap[s.get(RNS + "id")]
    return z, ss, sheets


def colnum(ref):
    m = re.match(r"([A-Z]+)", ref)
    n = 0
    for ch in m.group(1):
        n = n * 26 + ord(ch) - 64
    return n


def read_sheet(z, ss, target):
    root = ET.fromstring(z.read("xl/" + target))
    out = []
    for row in root.iter(NS + "row"):
        cells = {}
        for c in row.findall(NS + "c"):
            ci = colnum(c.get("r"))
            t = c.get("t")
            v = c.find(NS + "v")
            isx = c.find(NS + "is")
            if t == "s" and v is not None:
                val = ss[int(v.text)]
            elif t == "inlineStr" and isx is not None:
                val = "".join(x.text or "" for x in isx.iter(NS + "t"))
            elif v is not None:
                val = v.text
            else:
                val = ""
            cells[ci] = val
        out.append((int(row.get("r")), cells))
    return out


z, ss, sheets = load_xlsx(XLSX)
A01 = read_sheet(z, ss, sheets["LIAJ045-A01_結合索引"])
K01 = read_sheet(z, ss, sheets["LIAJ001-K01_塚原明夫_結合索引"])

NROWS = 20  # 每面显示的数据行数


def pick(rows, first=None, last=None):
    """返回 [(excel_row_no, 結合索引, 項目名, 参照QRソース), ...]"""
    data = [(rn, c.get(1, ""), c.get(2, ""), c.get(3, ""))
            for rn, c in rows if c.get(2, "") and c.get(2, "") != "項目名"]
    return data[:first] if first else data[-last:]


A01_HEAD = pick(A01, first=NROWS)
A01_TAIL = pick(A01, last=NROWS)
K01_TAIL = pick(K01, last=NROWS)

# ---------- SlideDSL 构件 ----------
RH = 15
COLS = [(20, "rn"), (34, "idx"), (None, "name"), (58, "qr")]
BLUE, PINK, RED, INK, GREY, ACC = "#E8EEF9", "#FDE8EE", "#E31B54", "#202124", "#5F6368", "#175CD3"
BORDER = "borderRight: '1px solid #E3E6EA', borderBottom: '1px solid #E3E6EA'"


def cell(text, width=None, flex=False, size=9, color=INK, bold=False, left=False, bg=None, h=RH):
    s = "height: %d, " % h
    if width is not None:
        s += "width: %d, " % width
    if flex:
        s += "flex: 1, "
    s += "flexDirection: 'row', alignItems: 'center', "
    s += "paddingLeft: 4, " if left else "justifyContent: 'center', "
    s += BORDER
    if bg:
        s += ", background: '%s'" % bg
    ts = "fontSize: %d, color: '%s'" % (size, color)
    if bold:
        ts += ", fontWeight: 'bold'"
    return "<Box style={{ %s }}><Text style={{ %s }}>%s</Text></Box>" % (s, ts, text)


def data_row(excel_no, idx, name, qr):
    bg = None
    ncolor = INK
    if name in ("生年月日_年", "生年月日_月", "生年月日_日",
                "発行日_元号", "発行日_年", "発行日_月", "発行日_日"):
        bg = BLUE
    elif name.startswith("2.ア"):
        bg = PINK
        ncolor = RED
    if name in ("診療科", "診療科名"):
        ncolor = ACC
    return ("<Box style={{ height: %d, flexDirection: 'row' }}>" % RH
            + cell(str(excel_no), 20, size=8, color=GREY, bg=bg)
            + cell(str(idx), 34, bg=bg)
            + cell(name, flex=True, left=True, color=ncolor, bg=bg)
            + cell(qr, 58, bg=bg)
            + "</Box>")


def grid(sheet_label, rows, tab_right):
    out = []
    out.append("<Box style={{ flex: 1, flexDirection: 'column', border: '1px solid #D0D5DD', "
               "borderRadius: 6, overflow: 'hidden', background: '#FFFFFF' }}>")
    # 标题栏
    out.append("<Box style={{ height: 22, flexDirection: 'row', alignItems: 'center', "
               "paddingLeft: 8, background: '#217346' }}>")
    out.append("<Text style={{ fontSize: 9, fontWeight: 'bold', color: '#FFFFFF' }}>%s</Text>" % sheet_label)
    out.append("<Text style={{ fontSize: 8, color: '#C6E0CE', marginLeft: 'auto', "
               "paddingRight: 8 }}>Excel</Text>")
    out.append("</Box>")
    # 列字母
    out.append("<Box style={{ height: 17, flexDirection: 'row', background: '#F1F3F4' }}>")
    for w, letter in [(20, ""), (34, "A"), (None, "B"), (58, "C")]:
        out.append(cell(letter, w, flex=(w is None), size=8, color=GREY))
    out.append("</Box>")
    # 表头
    out.append("<Box style={{ height: %d, flexDirection: 'row', background: '#F1F3F4' }}>" % RH)
    out.append(cell("1", 20, size=8, color=GREY))
    out.append(cell("結合索引", 34, size=8, bold=True))
    out.append(cell("項目名", flex=True, size=8, bold=True, left=True))
    out.append(cell("参照QRソース", 58, size=8, bold=True))
    out.append("</Box>")
    # 数据行
    for r in rows:
        out.append(data_row(*r))
    # 工作表标签栏
    out.append("<Box style={{ height: 18, flexDirection: 'row', alignItems: 'center', "
               "background: '#F8F9FA' }}>")
    out.append("<Box style={{ height: 18, flexDirection: 'row', alignItems: 'center', "
               "paddingLeft: 8, paddingRight: 8, background: '#FFFFFF', "
               "borderRight: '1px solid #D0D5DD' }}>")
    out.append("<Text style={{ fontSize: 9, fontWeight: 'bold', color: '#217346' }}>結合索引</Text>")
    out.append("</Box>")
    out.append("<Text style={{ fontSize: 8, color: '#5F6368', marginLeft: 'auto', "
               "paddingRight: 8 }}>%s</Text>" % tab_right)
    out.append("</Box>")
    out.append("</Box>")
    return "\n".join(out)


def qr_col(title, sheet_label, rows, tab_right):
    return "\n".join([
        "<Box style={{ flex: 1, flexDirection: 'column', gap: 10 }}>",
        "<Box style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>",
        "<Text style={{ fontSize: 12, fontWeight: 'bold', color: '#175CD3', "
        "letterSpacing: 1.2 }}>QR</Text>",
        "<Text style={{ fontSize: 12, color: '#175CD3' }}>%s</Text>" % title,
        "</Box>",
        grid(sheet_label, rows, tab_right),
        "</Box>",
    ])


def stat(label, value, vcolor=ACC):
    return "\n".join([
        "<Box style={{ flex: 1, flexDirection: 'column', alignItems: 'center', "
        "justifyContent: 'center' }}>",
        "<Text style={{ fontSize: 12, color: '#475467' }}>%s</Text>" % label,
        "<Box style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 3 }}>",
        "<Text style={{ width: 80, fontSize: 28, fontWeight: 'bold', color: '%s', "
        "lineHeight: 1.05, fontFamily: \"'SF Mono', Menlo, monospace\" }}>%s</Text>" % (vcolor, value),
        "<Text style={{ fontSize: 13, color: '#475467', marginLeft: 6 }}>項目</Text>",
        "</Box>",
        "</Box>",
    ])


DIV = "<Box style={{ width: 1, height: 46, background: '#C7D6F0' }} />"

slide = "\n".join([
    "<Slide style={{ width: 1280, height: 720, padding: '20px 64px', flexDirection: 'column', "
    "background: '#FFFFFF' }}>",
    "    <Box style={{ height: 100, flexDirection: 'row', alignItems: 'center', gap: 14, "
    "borderBottom: '1px solid #E5E7EB' }}>",
    "        <Box style={{ width: 6, height: 32, background: '#175CD3' }} />",
    "        <Text style={{ fontSize: 34, fontWeight: 'bold', color: '#111827' }}>認識の次元が違う</Text>",
    "        <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 'auto' }}>確認事項 ①</Text>",
    "    </Box>",
    "",
    "    <Box style={{ height: 540, flexDirection: 'column', gap: 20, paddingTop: 22 }}>",
    # ---- 上半：4 栏 ----
    "        <Box style={{ height: 400, flexDirection: 'row', gap: 12 }}>",
    # OCR
    "            <Box style={{ flex: 1, flexDirection: 'column', gap: 10 }}>",
    "                <Box style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>",
    "                    <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#6B7280', "
    "letterSpacing: 1.2 }}>llmocr</Text>",
    "                    <Text style={{ fontSize: 12, color: '#6B7280' }}>生年月日 ＝ 1 項目</Text>",
    "                </Box>",
    "                <Box style={{ flex: 1, background: '#F7F8FA', border: '1px solid #E5E7EB', "
    "borderRadius: 10, justifyContent: 'center', alignItems: 'center', flexDirection: 'column', "
    "gap: 12 }}>",
    "                    <Image src=\"assets/ocr-fields-tall.png\" style={{ height: 330, width: 259 }} />",
    "                    <Text style={{ fontSize: 10, color: '#6B7280', lineHeight: 1.4, "
    "textAlign: 'center' }}>選択式（チェック・丸印）は<br />1 項目として数える</Text>",
    "                </Box>",
    "            </Box>",
    # QR ×3
    "            " + qr_col("A01 ・先頭 1 行目〜", "LIAJ045-A01_結合索引.xlsx", A01_HEAD, "全 408 行"),
    "            " + qr_col("A01 ・末尾 408 行目", "LIAJ045-A01_結合索引.xlsx", A01_TAIL, "408 行目まで"),
    "            " + qr_col("K01 ・末尾 293 行目", "LIAJ001-K01_結合索引.xlsx", K01_TAIL, "293 行目まで"),
    "        </Box>",
    "",
    # ---- 下半：项目数条 ----
    "        <Box style={{ height: 90, background: '#E8EEF9', borderRadius: 12, "
    "paddingLeft: 22, paddingRight: 22, flexDirection: 'row', alignItems: 'center' }}>",
    "            <Box style={{ width: 150, flexDirection: 'column', justifyContent: 'center' }}>",
    "                <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#175CD3', "
    "lineHeight: 1.35 }}>1 様式あたりの<br />項目数</Text>",
    "            </Box>",
    "            " + DIV,
    "            " + stat("A01", "406"),
    "            " + DIV,
    "            " + stat("A04", "301"),
    "            " + DIV,
    "            " + stat("K01", "291"),
    "            " + DIV,
    "            " + stat("OCR", "約 50", "#475467"),
    "        </Box>",
    "    </Box>",
    "",
    "    <Box style={{ height: 40, flexDirection: 'row', alignItems: 'center', "
    "borderTop: '1px solid #E5E7EB' }}>",
    "        <Text style={{ fontSize: 14, color: '#6B7280' }}>LIAJ 診断書 QR 追加確認事項</Text>",
    "        <Text style={{ fontSize: 14, color: '#6B7280', marginLeft: 'auto' }}>02 / 03</Text>",
    "    </Box>",
    "</Slide>",
])

with open(OUT, "w", encoding="utf-8") as f:
    f.write(slide + "\n")

print("written:", OUT, len(slide), "bytes")
print("A01 head rows:", A01_HEAD[0][0], "->", A01_HEAD[-1][0], "| qr:", A01_HEAD[0][3], A01_HEAD[-1][3])
print("A01 tail rows:", A01_TAIL[0][0], "->", A01_TAIL[-1][0], "| qr:", A01_TAIL[0][3], A01_TAIL[-1][3])
print("K01 tail rows:", K01_TAIL[0][0], "->", K01_TAIL[-1][0], "| qr:", K01_TAIL[0][3], K01_TAIL[-1][3])
