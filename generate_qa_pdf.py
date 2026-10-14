#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generate_qa_pdf.py - render the ArrowPath QA & Acceptance Test Plan to a PDF.

Purpose:  Produce a printable, self-contained QA document for the ArrowPath
          Android build without installing any third-party PDF package - the
          environment has no PDF library available.

Notes:    The PDF is assembled by hand. Only the PDF base-14 fonts are used
          (Helvetica / Helvetica-Bold with WinAnsiEncoding), so nothing has to
          be embedded and the file stays small. Word wrapping needs glyph
          widths, which PDF does not expose, so the standard AFM width tables
          are inlined below.

Usage:    python generate_qa_pdf.py [output.pdf]
"""

import sys
import datetime

# ---------------------------------------------------------------------------
# Page geometry (A4 portrait) in PDF points.
# ---------------------------------------------------------------------------
PAGE_W = 595.276
PAGE_H = 841.89
MARGIN = 46.0
BODY_W = PAGE_W - 2 * MARGIN

# ---------------------------------------------------------------------------
# Palette (r, g, b in 0..1).
# ---------------------------------------------------------------------------
INK = (0.07, 0.09, 0.15)
MUTED = (0.36, 0.39, 0.46)
ACCENT = (0.09, 0.34, 0.70)
RULE_C = (0.80, 0.83, 0.88)
HEAD_BG = (0.10, 0.14, 0.23)
ZEBRA = (0.955, 0.965, 0.975)
OK_C = (0.09, 0.48, 0.28)
WARN_C = (0.72, 0.35, 0.05)

# ---------------------------------------------------------------------------
# Helvetica AFM widths for ASCII 32..126, per 1000 units of em.
# ---------------------------------------------------------------------------
_W_REGULAR = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]

_W_BOLD = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

# Characters the WinAnsi glyph set can express but that are > U+00FF in source.
_TYPO = {
    u"\u2022": "\x95",   # bullet
    u"\u25cf": "\x95",
    u"\u25aa": "\x95",
    u"\u2013": "\x96",   # en dash
    u"\u2014": "\x97",   # em dash
    u"\u2018": "\x91",
    u"\u2019": "\x92",
    u"\u201c": "\x93",
    u"\u201d": "\x94",
    u"\u2026": "\x85",   # ellipsis
    u"\u00a0": " ",
    u"\u2192": "->",
    u"\u2265": ">=",
    u"\u2264": "<=",
    u"\u2260": "!=",
    u"\u00d7": "x",
    u"\u2713": "[x]",
    u"\u2714": "[x]",
    u"\u2610": "[ ]",
    u"\u2705": "[x]",
    u"\u26a0": "!",
    u"\u00b7": "\xb7",
}


def normalise(text):
    """Fold source typography down to what WinAnsiEncoding can draw."""
    for src, dst in _TYPO.items():
        if src in text:
            text = text.replace(src, dst)
    return "".join(ch for ch in text if ord(ch) < 256)


def text_width(text, size, bold=False):
    """Width of `text` in points. PDF cannot measure a string, so we must."""
    table = _W_BOLD if bold else _W_REGULAR
    total = 0
    for ch in text:
        code = ord(ch)
        total += table[code - 32] if 32 <= code <= 126 else 556
    return total * size / 1000.0


def wrap(text, size, max_width, bold=False):
    """Greedy word wrap. A word longer than the column is left to overflow."""
    text = normalise(text)
    lines = []
    current = ""
    for word in text.split(" "):
        trial = word if not current else current + " " + word
        if text_width(trial, size, bold) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]



class Pdf(object):
    """A minimal PDF writer with wrapping, tables and pagination."""

    def __init__(self, title, subject):
        self.title = title
        self.subject = subject
        self.pages = []
        self.ops = None
        self.y = 0.0
        self.page_no = 0
        self._begin_page()

    # -- low level ---------------------------------------------------------
    def _begin_page(self):
        if self.ops:
            self.pages.append(self.ops)
        self.ops = []
        self.page_no += 1
        self.y = PAGE_H - MARGIN

    def _emit(self, op):
        self.ops.append(op)

    def _escape(self, string):
        out = []
        for ch in normalise(string):
            if ch in "\\()":
                out.append("\\" + ch)
            elif ch in "\r\n":
                out.append(" ")
            elif ord(ch) >= 128:
                out.append("\\%03o" % ord(ch))
            elif ord(ch) < 32:
                out.append(" ")
            else:
                out.append(ch)
        return "".join(out)

    def _text(self, x, y, size, bold, color, string):
        font = "/F2" if bold else "/F1"
        self._emit(
            "BT %.3f %.3f %.3f rg %s %.2f Tf %.2f %.2f Td (%s) Tj ET"
            % (color[0], color[1], color[2], font, size, x, y, self._escape(string))
        )

    def _rect(self, x, y, w, h, color):
        self._emit(
            "%.3f %.3f %.3f rg %.2f %.2f %.2f %.2f re f"
            % (color[0], color[1], color[2], x, y, w, h)
        )

    def _line(self, x1, y1, x2, y2, color, width=0.6):
        self._emit(
            "%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S"
            % (color[0], color[1], color[2], width, x1, y1, x2, y2)
        )

    def _ensure(self, height):
        if self.y - height < MARGIN + 24:
            self._begin_page()

    def space(self, height):
        self.y -= height

    def rule(self, color=RULE_C, width=0.7):
        self._emit(
            "%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S"
            % (color[0], color[1], color[2], width, MARGIN, self.y, PAGE_W - MARGIN, self.y)
        )
    # -- blocks ------------------------------------------------------------
    def h1(self, text):
        self._ensure(70)
        self.space(10)
        for line in wrap(text, 21, BODY_W, True):
            self._text(MARGIN, self.y, 21, True, INK, line)
            self.y -= 25
        self.space(2)
        self.rule(ACCENT, 1.4)
        self.space(14)

    def h2(self, text):
        self._ensure(42)
        self.space(12)
        for line in wrap(text, 14, BODY_W, True):
            self._text(MARGIN, self.y, 14, True, ACCENT, line)
            self.y -= 17
        self.space(5)

    def h3(self, text):
        self._ensure(30)
        self.space(8)
        for line in wrap(text, 11.5, BODY_W, True):
            self._text(MARGIN, self.y, 11.5, True, INK, line)
            self.y -= 14
        self.space(3)

    def p(self, text, size=10, color=INK, indent=0.0):
        leading = size * 1.42
        for line in wrap(text, size, BODY_W - indent):
            self._ensure(leading)
            self._text(MARGIN + indent, self.y, size, False, color, line)
            self.y -= leading
        self.space(5)

    def bullet(self, text, size=10, color=INK, marker="\x95", indent=14.0):
        leading = size * 1.42
        lines = wrap(text, size, BODY_W - indent - 12)
        self._ensure(leading)
        self._text(MARGIN + indent, self.y, size, False, ACCENT, marker)
        for line in lines:
            self._text(MARGIN + indent + 12, self.y, size, False, color, line)
            self.y -= leading
        self.space(2)

    def note(self, text, size=9.5):
        lines = wrap(text, size, BODY_W - 18)
        leading = size * 1.42
        self._ensure(leading * len(lines) + 20)
        self.rule(RULE_C, 0.7)
        self.space(8)
        for line in lines:
            self._text(MARGIN + 9, self.y, size, False, MUTED, line)
            self.y -= leading
        self.space(9)

    def kv(self, key, value, size=10):
        self._ensure(size * 1.7)
        self._text(MARGIN, self.y, size, True, INK, key)
        offset = text_width(key + "   ", size, True)
        self._text(MARGIN + offset, self.y, size, False, MUTED, value)
        self.y -= size * 1.7

    def page_break(self):
        self._begin_page()

    def table(self, headers, rows, weights, size=8.8, caption=None):
        """Zebra-striped table with a dark header, repeated on every page it spans."""
        cols = [w * BODY_W for w in weights]
        leading = size * 1.30
        pad = 4.5
        header_lines = [wrap(h, size, cols[i] - 2 * pad - 2, True) for i, h in enumerate(headers)]
        header_h = max(len(hl) for hl in header_lines) * leading + 2 * pad

        if caption:
            self._ensure(header_h + 26)
            self._text(MARGIN, self.y, 9.5, True, MUTED, caption)
            self.y -= 15

        def draw_header():
            self._ensure(header_h + leading + 6)
            self._rect(MARGIN, self.y - header_h + leading * 0.7, BODY_W, header_h, HEAD_BG)
            for i, lines in enumerate(header_lines):
                yy = self.y + 3
                for line in lines:
                    self._text(MARGIN + sum(cols[:i]) + pad, yy, size, True, (1, 1, 1), line)
                    yy -= leading
            self.y -= header_h

        draw_header()

        for r, row in enumerate(rows):
            cells = [wrap(str(c), size, cols[i] - 2 * pad - 2) for i, c in enumerate(row)]
            row_h = max(len(cl) for cl in cells) * leading + 2 * pad
            if self.y - row_h < MARGIN + 24:
                self._begin_page()
                draw_header()
            if r % 2 == 1:
                self._rect(MARGIN, self.y - row_h + leading * 0.7, BODY_W, row_h, ZEBRA)
            for i, lines in enumerate(cells):
                yy = self.y + 3
                for line in lines:
                    self._text(MARGIN + sum(cols[:i]) + pad, yy, size, False, INK, line)
                    yy -= leading
            self.y -= row_h
            self._line(MARGIN, self.y + leading * 0.7, PAGE_W - MARGIN, self.y + leading * 0.7, RULE_C, 0.4)

        self.space(12)

    # -- output ------------------------------------------------------------
    def save(self, path):
        if self.ops:
            self.pages.append(self.ops)
        pages = self.pages
        total = len(pages)

        for i, ops in enumerate(pages):
            ops.append(
                "BT 0.60 0.62 0.66 rg /F1 7.5 Tf %.2f 30 Td (%s) Tj ET"
                % (MARGIN, self._escape(
                    "ArrowPath - QA & Acceptance Test Plan   |   page %d of %d" % (i + 1, total)))
            )
            ops.append(
                "BT 0.60 0.62 0.66 rg /F1 7.5 Tf %.2f 30 Td (%s) Tj ET"
                % (PAGE_W - MARGIN - 84, self._escape("1.0.1  -  vc23"))
            )

        kids = " ".join("%d 0 R" % (7 + 2 * i) for i in range(total))
        objects = []
        objects.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
        objects.append((2, ("<< /Type /Pages /Count %d /Kids [%s] >>" % (total, kids)).encode("latin-1")))
        stamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        info = ("<< /Title (%s) /Subject (%s) /Author (ArrowPath QA) "
                "/Creator (generate_qa_pdf.py) /CreationDate (D:%s) >>"
                % (self._escape(self.title), self._escape(self.subject), stamp))
        objects.append((3, info.encode("latin-1")))
        objects.append((4, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"))
        objects.append((5, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"))

        for i, ops in enumerate(pages):
            stream = "\n".join(ops).encode("latin-1", "replace")
            content_no = 6 + 2 * i
            page_no = 7 + 2 * i
            objects.append((
                content_no,
                b"<< /Length " + str(len(stream)).encode("ascii")
                + b" >>\nstream\n" + stream + b"\nendstream",
            ))
            page_dict = (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] "
                "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents %d 0 R >>"
                % (PAGE_W, PAGE_H, content_no)
            )
            objects.append((page_no, page_dict.encode("latin-1")))

        out = bytearray()
        out += b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
        offsets = {}
        for number, body in objects:
            offsets[number] = len(out)
            out += ("%d 0 obj\n" % number).encode("ascii")
            out += body
            out += b"\nendobj\n"

        xref_at = len(out)
        count = len(objects) + 1
        out += ("xref\n0 %d\n" % count).encode("ascii")
        out += b"0000000000 65535 f \n"
        for number in range(1, count):
            out += ("%010d 00000 n \n" % offsets[number]).encode("ascii")
        out += ("trailer\n<< /Size %d /Root 1 0 R /Info 3 0 R >>\nstartxref\n%d\n%%%%EOF\n"
                % (count, xref_at)).encode("ascii")

        with open(path, "wb") as handle:
            handle.write(bytes(out))
        return total



# ===========================================================================
# DOCUMENT CONTENT
# ===========================================================================

APP = "ArrowPath"
BUILD_TAG = "1.0.1  /  versionCode 26"


def content_cover(pdf):
    pdf.space(44)
    pdf._text(MARGIN, pdf.y, 30, True, INK, "ArrowPath")
    pdf.y -= 40
    pdf._text(MARGIN, pdf.y, 19, True, ACCENT, "QA & Acceptance Test Plan")
    pdf.y -= 26
    pdf.rule(ACCENT, 1.6)
    pdf.space(16)
    pdf.p("Complete end-to-end pre-release QA cycle for the Android build: "
          "installation, startup, navigation, gameplay, puzzle logic, completion, "
          "persistence, hints, advertising, audio, haptics, awards, collection, "
          "challenges, themes, responsive layout, performance, Android "
          "compatibility, offline behaviour, edge cases and regression.", size=11)
    pdf.space(10)

    pdf.h2("Document control")
    pdf.table(
        ["Field", "Value"],
        [
            ["Title", "ArrowPath - QA & Acceptance Test Plan"],
            ["Version", "1.0"],
            ["Status", "Issued for execution"],
            ["Test cycle", "Pre-release acceptance"],
            ["Prepared by", "Senior QA lead (mobile games)"],
            ["Scope", "Full product: every reachable screen, state and feature"],
            ["Method", "Manual playthrough on physical Android device + emulator"],
            ["Date", datetime.date.today().isoformat()],
        ],
        [0.24, 0.76],
        size=9.4,
    )

    pdf.h2("Build under test")
    pdf.table(
        ["Property", "Value"],
        [
            ["Application", "ArrowPath (Arrow Escape puzzle)"],
            ["Android package", "com.abdurrehmanary.arrowpath"],
            ["Version name", "1.0.1"],
            ["Android versionCode", "26"],
            ["Expo SDK", "57"],
            ["React Native", "0.86.2"],
            ["Debug APK", "ArrowPath-DEBUG-testads-1.0.1-vc23.apk  (Google test ad units)"],
            ["Release APK", "ArrowPath-RELEASE-1.0.1-vc23.apk  (production ad units)"],
            ["Target SDK", "36"],
            ["ABIs", "arm64-v8a, armeabi-v7a, x86, x86_64"],
            ["Signing", "Android debug certificate (sideload distribution)"],
        ],
        [0.26, 0.74],
        size=9.4,
    )

    pdf.h2("How to read this document")
    pdf.bullet("Every test case lists numbered steps, the expected result, and a blank "
               "Result column for the tester to fill in PASS / FAIL / BLOCKED.", size=9.6)
    pdf.bullet("Severities are P0 (blocker) through P4 (cosmetic); the classification "
               "rules are in the Bug Classification section.", size=9.6)
    pdf.bullet("A blank Result is not a pass. If a step cannot be executed, the tester "
               "must record BLOCKED together with the reason.", size=9.6)
    pdf.bullet("Behaviours that look wrong get traced to the implementation before they "
               "are filed, so the report distinguishes a bug from an intended rule.", size=9.6)
    pdf.note("Source of truth: the current working tree, not the source code alone and "
             "not a previous build. Where a behaviour is ambiguous, the implementation "
             "decides what was intended before the behaviour is judged.")

    pdf.page_break()

def content_inventory(pdf):
    pdf.h1("1.  Feature inventory")

    pdf.p("The inventory below is the checklist the rest of this plan tests against. "
          "It was built from the implementation, not from a specification: every row "
          "was confirmed to exist in the current working tree before it was written "
          "down. A feature that exists in code but cannot be reached in the running "
          "app is a bug, and is listed as one rather than removed from the list.")

    pdf.h2("1.1  Navigation routes")
    pdf.table(
        ["Route", "Implementation", "Purpose"],
        [
            ["/", "app/(tabs)/index.tsx", "Home - continue, level select, statistics entry"],
            ["/levels", "app/levels.tsx", "Level selection grid (20 packs, 1000 levels)"],
            ["/play/[id]", "app/play/[id].tsx", "Core gameplay screen"],
            ["/collection", "app/(tabs)/collection.tsx", "Monthly calendar of daily challenges"],
            ["/stats", "app/stats.tsx", "Player statistics"],
            ["/account", "app/account.tsx", "Authentication: Google Sign-In + Supabase"],
            ["/settings", "app/(tabs)/settings.tsx", "Audio, haptics, theme, data reset"],
            ["/leagues", "app/(tabs)/leagues.tsx", "Weekly league standings"],
            ["/challenge", "app/(tabs)/challenge/index.tsx", "Daily challenge hub"],
            ["/challenge/[day]", "app/(tabs)/challenge/[day].tsx", "One day's challenge"],
            ["/challenge/history", "app/(tabs)/challenge/history.tsx", "Past challenge results"],
            ["/challenge/rewards", "app/(tabs)/challenge/rewards.tsx", "Eight record awards"],
            ["/challenge/stats", "app/(tabs)/challenge/stats.tsx", "Challenge statistics"],
            ["/challenge/info/[award]", "app/(tabs)/challenge/info/*.tsx", "Eight award detail screens"],
        ],
        [0.28, 0.34, 0.38],
        size=8.6,
    )

    pdf.h2("1.2  Features")
    pdf.p("Every feature, where it lives, how the player reaches it, the state it "
          "changes, and what it depends on. The ID column is referenced by the test "
          "cases in section 2.", size=9.6)
    pdf.table(
        ["ID", "Feature", "Screen / route", "Access", "State it changes", "Depends on"],
        [
            ["F1", "Continue / Play", "Home", "Tap", "lastPlayed", "progressStore"],
            ["F2", "Level selection grid", "Levels", "Tap cell", "read-only", "progressStore"],
            ["F3", "Arrow release (clear path)", "Play", "Tap arrow", "board, hearts", "game rules, haptics, audio"],
            ["F4", "Arrow blocked (no path)", "Play", "Tap arrow", "hearts, shake state", "game rules, haptics, audio"],
            ["F5", "Hint reveal", "Play", "Tap Hint", "hints remaining", "hints solver, haptics"],
            ["F6", "Rewarded ad for a hint", "Play", "Hint when empty", "hints +1", "AdMob SDK, audio"],
            ["F7", "Interstitial ad", "post level", "automatic", "counter, cooldown", "AdMob SDK"],
            ["F8", "Level completion", "Play", "clear all arrows", "progress, collection", "audio, haptics"],
            ["F9", "Win overlay", "Play", "auto after delay", "read-only", "audio sting"],
            ["F10", "Collection calendar", "Collection", "Tab", "read-only", "challengeStore"],
            ["F11", "Daily challenge play", "Challenge/[day]", "Tap day", "challengeStore", "schedule, pool"],
            ["F12", "Challenge calendar", "Challenge", "Tab", "read-only", "challengeStore"],
            ["F13", "Awards / Records", "Challenge/rewards", "Tap", "read-only", "progress + challenge stores"],
            ["F14", "Award detail (x8)", "challenge/info/*", "Tap award", "read-only", "rewards module"],
            ["F15", "Audio settings", "Settings", "Sliders", "settingsStore", "audio service"],
            ["F16", "Haptics toggle", "Settings", "Toggle", "settingsStore", "haptics service"],
            ["F17", "Theme selection", "Settings", "Tap swatch", "settingsStore", "theme system"],
            ["F18", "Reset progress", "Settings", "Tap + confirm", "all stores wiped", "storage service"],
            ["F19", "Google Sign-In", "Account", "Tap sign-in", "authStore", "Supabase + Google Identity"],
            ["F20", "Statistics overview", "Stats", "Nav", "read-only", "progressStore"],
            ["F21", "Leagues", "Leagues", "Nav", "leagueStore", "progressStore"],
            ["F22", "Pause menu", "Play", "Tap pause", "read-only", "board state"],
            ["F23", "Level restart", "Play via pause", "Tap restart", "board reset", "game rules"],
            ["F24", "Camera pan / zoom", "Play", "Pinch / drag", "camera transform", "gesture handler"],
            ["F25", "Board and arrow themes", "Settings", "Tap theme", "settingsStore", "theme, themeAssets"],
            ["F26", "Coach cards", "Play", "auto, first play", "onboardingStore", "game rules"],
            ["F27", "Celebration overlay", "post completion", "auto", "read-only", "Skia renderer"],
            ["F28", "Monthly trophy", "Collection", "auto on milestone", "challengeStore", "trophy modal"],
            ["F29", "Streak reward", "Challenge", "auto on streak", "streakStore", "streak modal"],
        ],
        [0.055, 0.20, 0.155, 0.115, 0.19, 0.285],
        size=8.2,
    )

    pdf.h2("1.3  Theme system")
    pdf.p("A theme is a palette plus a board style plus an arrow style. Every surface "
          "listed below is rendered through the active theme, so a theme change must "
          "be verified on all of them and not only on the board.", size=9.6)
    pdf.table(
        ["Element", "What varies", "Where to look"],
        [
            ["Background", "Full-screen backdrop image per theme", "Every screen"],
            ["Board surface", "Base colour and optional pattern", "Play"],
            ["Board pattern", "solid, dots, lines, crosses, checker", "Play"],
            ["Arrow body", "Colour per group, tail shape, join", "Play"],
            ["Arrow head", "none, sharp, rounded", "Play"],
            ["Group cue", "circle, square, triangle, diamond, star", "Play (colour-blind aid)"],
            ["HUD", "Hearts, hint button, pause button", "Play"],
            ["Popups", "Dialogs, menus, modals", "All screens"],
            ["Completion UI", "Win overlay and celebration", "Play"],
            ["Navigation chrome", "Tab bar, headers", "All tab screens"],
        ],
        [0.20, 0.44, 0.36],
        size=8.8,
    )

    pdf.h2("1.4  Audio")
    pdf.p("The audio service resolves assets through a lookup that may legitimately "
          "return nothing - the sound files are the one part of this game that is not "
          "generated - so every one of these calls must be a silent no-op rather than "
          "a crash when the file is absent.", size=9.6)
    pdf.table(
        ["Category", "Members", "Notes"],
        [
            ["Sound effects", "buttonClick, toggle, popupOpen, popupClose, arrowPickup, "
                              "arrowRelease, correctMove, collision, wrongMove, heartLost, "
                              "levelComplete, hintUsed, undo, pause, resume, outOfHearts",
             "One-shots, cached per name"],
            ["Music beds", "menu, gameplay", "Looping, cross-faded on change"],
            ["Stings", "victory, defeat", "Played over a ducked bed"],
            ["Voice", "announcements", "Separate volume category"],
            ["Mix controls", "master, music, sfx, voice", "Volume + independent mute"],
        ],
        [0.16, 0.50, 0.34],
        size=8.6,
    )
    pdf.bullet("Voice limiting: the same effect retriggered within 45 ms is dropped, so "
               "a fast tap cannot turn one sound into a buzz.", size=9.4)
    pdf.bullet("Fades: 600 ms ramps on music, so a bed change is a cross-fade rather "
               "than a switch.", size=9.4)
    pdf.bullet("Lifetime: a bed already playing is not restarted, so moving repeatedly "
               "between two screens does not restart the music.", size=9.4)

    pdf.h2("1.5  Haptics")
    pdf.table(
        ["Player action", "Pattern", "Debounce"],
        [
            ["Button, toggle, popup", "selection", "60 ms, shared across all haptics"],
            ["Arrow pickup, hint, undo", "light", "60 ms"],
            ["Arrow release, correct move, pause, resume, restart", "medium", "60 ms"],
            ["Collision, wrong move", "heavy", "60 ms"],
            ["Heart lost, last-heart warning", "warning", "60 ms"],
            ["Level complete, achievement, reward", "success", "60 ms"],
            ["Out of hearts, game over", "error", "60 ms"],
        ],
        [0.50, 0.28, 0.22],
        size=8.8,
    )
    pdf.note("The debounce is global rather than per-event, so two different haptic "
             "events inside the same 60 ms window produce one vibration. This is "
             "intended: it is what stops a rapid multi-arrow exit from turning into "
             "continuous vibration. It is also worth testing deliberately, because "
             "the effect is that a haptic can appear to be 'missing' during very fast "
             "play - that is a pass, not a bug.")

    pdf.page_break()

def tc(pdf, tid, title, purpose, steps, covers=None):
    """Render one test case: heading, intent, then a step / expected / result table."""
    pdf.h3("%s   %s" % (tid, title))
    if covers:
        pdf.p("Covers: %s" % covers, size=8.6, color=MUTED)
    if purpose:
        pdf.p(purpose, size=9.5)
    rows = [[str(i + 1), action, expected, ""] for i, (action, expected) in enumerate(steps)]
    pdf.table(["#", "Step / action", "Expected result", "Result"],
              rows, [0.045, 0.375, 0.42, 0.16], size=8.2)


def content_tests_1(pdf):
    pdf.h1("2.  Test cases")

    tc(pdf, "TC-001", "Fresh installation and first launch",
       "The first impression decides whether the player stays. Nothing here may "
       "require a development server, an Expo Go container, or a second launch to "
       "settle.",
       [
           ("Uninstall any earlier ArrowPath build from the device.", "The package is fully removed; no stale data remains."),
           ("Install ArrowPath-DEBUG-testads-1.0.1-vc23.apk.", "Install completes with no error."),
           ("Launch from the device app drawer, not from a Metro QR code.", "Splash appears, then Home. No development-server prompt."),
           ("Watch the first ten seconds on Home.", "No red box, no crash, no blank white screen."),
           ("Inspect the background and board art on Home.", "Theme assets load; nothing missing or accidentally transparent."),
           ("Inspect every icon on Home.", "All icons resolve; no placeholder squares."),
           ("Check the level counters and the Continue button.", "Counts read 0 of 1000 and Continue offers level 1."),
           ("Open Levels.", "Only level 1 is open; level 2 and above read as locked."),
           ("Open Challenge.", "Today is available; future days locked; days before the series start are not playable."),
           ("Open Challenge, then Rewards.", "All eight awards are shown, none earned."),
           ("Open Collection.", "The current month is shown with all past days uncleared."),
           ("Force-close and relaunch.", "Identical state; nothing written on first run breaks the second."),
       ],
       covers="F1, F2, F10, F12, F13, persistence"),

    tc(pdf, "TC-002", "Home screen - every element",
       "Every control on Home is exercised, including the ones that only navigate. A "
       "button that looks right but goes nowhere is the most common Home-screen defect.",
       [
           ("Confirm Continue shows the next level number.", "The number matches the first uncleared level."),
           ("Tap Continue.", "The Play screen opens on the correct level."),
           ("Press Android back.", "Home returns with no state change."),
           ("Go into Levels and come back.", "Home is unchanged."),
           ("Go into Collection and come back.", "Home is unchanged."),
           ("Go into Leagues and come back.", "Home is unchanged."),
           ("Go into Challenge and come back.", "Home is unchanged."),
           ("Go into Settings and come back.", "Home is unchanged."),
           ("Open Statistics.", "Real numbers are shown, not placeholders."),
           ("Open Account.", "The sign-in control renders and does not crash without network."),
           ("Check alignment, font sizes and spacing across all of the above.", "No clipped labels, no overlapping text, no truncated numbers."),
           ("Check every touch target.", "Each is comfortably tappable - nothing below about 44 dp."),
           ("Rotate the device if the app permits it.", "The layout reflows correctly, or rotation is locked with no half-drawn screen."),
       ],
       covers="F1, F19, F20, responsive UI"),


    tc(pdf, "TC-003", "Navigation and back-stack",
       "Navigation bugs are cheap to find here and expensive to find in review. The "
       "two that matter are a dead end and a screen that forgets what it was showing.",
       [
           ("Home to Levels to Home.", "Clean return; no duplicated screen left in the stack."),
           ("Home to Play to Home.", "Play exits without leaving a running board behind."),
           ("Home to Collection to Home.", "Clean return."),
           ("Home to Challenge to Home.", "Clean return."),
           ("Home to Settings to Home.", "Clean return."),
           ("Home to Play to Levels to Home.", "The stack unwinds correctly at each step."),
           ("Challenge to Rewards to an award detail, then back three times.", "Lands on Challenge, not Home and not a blank screen."),
           ("Switch between all five tabs ten times in about three seconds.", "No crash, no frozen screen, no stuck highlight."),
           ("Press back on Home.", "The app minimises or does nothing - it must not exit to a blank screen."),
           ("Start a level, play a few moves, press back.", "The level exits cleanly; the app does not hang on the board."),
           ("Background the app during gameplay, then resume.", "The board is exactly as it was left."),
           ("Open a level, background the app, return after a minute.", "The board survives; no restart, no lost progress."),
       ],
       covers="navigation, F22, F24"),

    tc(pdf, "TC-004", "Level selection and unlocking",
       "Unlocking is derived from the completed set rather than stored, so the thing "
       "to prove is that the derived value is correct at every boundary.",
       [
           ("Open Levels from Home.", "The grid renders all 20 packs."),
           ("Confirm level 1 reads as open and level 2 as locked.", "The two states are clearly different, not merely differently tinted."),
           ("Tap level 2.", "Nothing opens. A locked level must be inert."),
           ("Tap level 1 and complete it.", "On return, level 2 reads as open and level 1 as cleared."),
           ("Tap a cleared level again.", "It replays normally and the cleared badge survives the replay."),
           ("Scroll to the final pack.", "Scrolling is smooth and level 1000 renders."),
           ("Tap a level far beyond current progress.", "Still inert."),
           ("Check every level number across two adjacent packs.", "Sequential and correct, with no gaps and no repeats."),
           ("Check the pack headers.", "Each names its range correctly and the ranges do not overlap."),
       ],
       covers="F2, progression, boundaries"),

    tc(pdf, "TC-005", "Gameplay - a move with a clear path",
       "The core loop. This is the highest-priority test in the document: if this is "
       "wrong, nothing else matters.",
       [
           ("Open level 1.", "The board animates in: zoom out, then settle. No assets snap into place."),
           ("Identify an arrow whose straight ray to the edge is clear.", "The arrow's body never blocks it - only other arrows can."),
           ("Tap that arrow.", "That arrow and no other responds."),
           ("Watch the exit.", "The snake leaves through its head and the body threads out along the cleared trail."),
           ("Watch the timing.", "Duration tracks distance travelled: a long exit is slower, not the same duration as a short one."),
           ("Listen and feel.", "The release effect plays and a medium haptic fires."),
           ("Check the board after it leaves.", "The arrow is gone and the cells it occupied are free."),
           ("Repeat until every arrow has left.", "Each move behaves identically; no arrow becomes stuck."),
           ("Clear the last arrow.", "Completion is detected once, and the board is visibly empty first."),
           ("Wait for the win overlay.", "It arrives after the last exit finishes, not on top of it."),
           ("Confirm the level is recorded.", "Progress increments by exactly one."),
           ("Return to Levels.", "The next level is now unlocked."),
       ],
       covers="F3, F8, F9, animation, audio, haptics"),

    tc(pdf, "TC-006", "Gameplay - a move with no clear path",
       "A blocked tap must be legible: the player has to be able to tell what happened "
       "and try something else. It must cost nothing permanent.",
       [
           ("Open a level with at least two arrows.", "Both are visible on the board."),
           ("Identify an arrow whose ray to the edge is blocked.", "The blocking arrow sits in the ray."),
           ("Tap the blocked arrow.", "It lurches toward the blocker and recoils - a shake, roughly a quarter of a second."),
           ("Watch where it ends up.", "Exactly where it started. No permanent displacement."),
           ("Listen and feel.", "A collision or wrong-move effect plus a heavy haptic."),
           ("Check the arrows involved.", "No arrow is destroyed. The blocker is untouched."),
           ("Tap the same arrow four more times in quick succession.", "No crash, no duplicate animations, no permanently stuck arrow."),
           ("Check the heart counter after each blocked tap.", "It decrements by exactly one per blocked tap, never by zero and never by two."),
           ("Continue and solve the level.", "The blocked taps did not make it unsolvable."),
       ],
       covers="F4, hearts, haptics, edge case"),


    tc(pdf, "TC-007", "Puzzle logic and solvability",
       "Tap order provably cannot lose a level, so the thing being tested is not "
       "whether a level is winnable but whether the rules ever let the board enter a "
       "state that is not reachable by the rules.",
       [
           ("Solve level 1 using only moves the board accepts.", "It completes."),
           ("Solve a level in the middle of the library (about level 50).", "It completes."),
           ("Solve a level in the last pack (about level 999).", "It completes."),
           ("Deliberately tap an arrow whose ray is blocked by another arrow.", "The move is rejected. No arrow passes through another."),
           ("Deliberately tap an arrow whose ray runs off the board edge past empty cells.", "The move is accepted; empty cells are not obstacles."),
           ("Watch a long exit all the way off the board.", "The arrow travels the full ray and leaves; it never stops short or wraps."),
           ("Tap arrows in the wrong order until the board is nearly full.", "Every arrow remains individually playable - no permanent deadlock."),
           ("Finish a level with the very last possible move.", "Completion triggers. It does not require an extra phantom move."),
           ("Clear a level and keep tapping the empty board.", "Nothing happens. No duplicate completion, no crash."),
           ("Check a board with edge and corner arrows.", "The ray stops at the board boundary; the arrow exits rather than clipping."),
           ("Check the densest board available.", "No overlap artefacts, no invisible arrows, no cells occupied by two arrows."),
       ],
       covers="puzzle logic, game rules, boundaries"),

    tc(pdf, "TC-008", "Rapid tap and stress behaviour",
       "Players tap faster than the animation. What must never happen is a second "
       "effect from one tap, or a UI that stops responding.",
       [
           ("Tap one arrow ten times as fast as possible.", "One exit. The extra taps do nothing."),
           ("Tap five different arrows as fast as possible.", "Each accepted tap exits its own arrow; nothing is applied twice."),
           ("Tap a second arrow while the first is still exiting.", "Either it queues or it is ignored - consistently, not sometimes one and sometimes the other."),
           ("Tap a blocked arrow repeatedly during its shake.", "No stacked shakes, no drift, no crash."),
           ("Tap the board during the win overlay.", "Nothing is awarded twice."),
           ("Tap the board the instant a level opens.", "Input is ignored until the board is ready; no arrow is moved at the wrong moment."),
           ("Tap while a hint is animating.", "Handled consistently; the hint is not consumed twice."),
           ("Multi-touch: hold two arrows and tap a third.", "No crash, no double-move."),
           ("After all of the above, check the board state.", "Still logically consistent and still solvable."),
           ("After all of the above, check the counters.", "Levels cleared, hearts and hints are each off by nothing."),
       ],
       covers="stress, F3, F4, edge case"),

    tc(pdf, "TC-009", "Hint system",
       "A hint is the one paid action in the game. It has to point at a move that is "
       "actually correct, and it has to cost exactly one hint.",
       [
           ("Start a level and confirm the hint control is visible.", "It is present and legibly enabled or disabled."),
           ("Tap the hint control with hints available.", "One arrow is highlighted as the next correct move."),
           ("Check the highlight.", "It is visibly distinct from the normal arrow colour, not a subtle tint."),
           ("Feel and hear it.", "A light haptic and the hint effect, if the asset exists."),
           ("Check the hint counter.", "Exactly one hint consumed."),
           ("Follow the hint.", "The highlighted arrow really is releasable - it exits when tapped."),
           ("Use a second hint on the same board.", "It highlights the next move, not the same one again."),
           ("Use a hint immediately before the final move.", "It points at the final move and does not mis-highlight an empty board."),
           ("Use a hint while an arrow is still exiting.", "Handled consistently; the game does not corrupt or double-charge."),
           ("Use every hint until none remain.", "The control changes to the ad-based path rather than silently doing nothing."),
           ("Confirm the hint does not solve the level by itself.", "The board is unchanged by the hint; only the highlight is added."),
       ],
       covers="F5, hints solver, haptics"),

    tc(pdf, "TC-010", "Rewarded advertisement - the happy path",
       "This is the only ad a player deliberately opts into, so the reward contract "
       "must be exact: one ad, one hint, and the board untouched.",
       [
           ("Exhaust the hints on a level.", "The hint control offers the ad path."),
           ("Accept the offer.", "A test ad is requested and loads."),
           ("Watch the ad load.", "The creative is clearly labelled as a test ad by Google."),
           ("Watch the ad to the end.", "The ad closes by itself or via its close control."),
           ("Return to the game.", "The board is exactly as it was before the ad - same arrows, same positions."),
           ("Check the hint counter.", "Exactly one hint was granted."),
           ("Use the granted hint.", "It behaves identically to an earned hint."),
           ("Repeat the full flow three more times.", "Each attempt grants exactly one hint; nothing accumulates wrongly."),
           ("Confirm nothing else changed.", "No level progress, no hearts, no completed count moved during the ad."),
       ],
       covers="F6, AdMob rewarded, test ad units"),

def content_tests_2(pdf):
    tc(pdf, "TC-011", "Interstitial advertisement",
       "The interstitial is the one ad the player did not ask for, so its cadence "
       "matters as much as its function. The implemented policy is a 90-second grace "
       "period at session start, then one ad every three completed levels, with a "
       "60-second minimum between ads. Test the policy as written, and confirm the "
       "grace period is what actually protects the first minutes.",
       [
           ("Launch the app and complete one level inside the first 90 seconds.", "No interstitial appears."),
           ("Complete a second and a third level, still inside the grace period.", "Still no interstitial - the grace period wins over the cadence."),
           ("Continue past 90 seconds and complete levels until the third completion after the grace period.", "An interstitial is requested."),
           ("Watch the ad through.", "It closes and the game is restored."),
           ("Check the level that triggered it.", "It is recorded as complete; the ad did not swallow the result."),
           ("Complete the next two levels.", "No interstitial - the cadence is every third."),
           ("Complete the third level after the ad, within 60 seconds.", "No interstitial - the cooldown wins over the cadence."),
           ("Complete another level after the cooldown expires.", "An interstitial appears."),
           ("Press Android back while an interstitial is showing.", "The ad closes cleanly and the game is restored, with no blank screen."),
           ("Complete a level with the interstitial unable to load (airplane mode).", "The game continues normally; no trap, no blank screen, no lost result."),
           ("After each ad, confirm the game state.", "No level reset, no duplicate completion, no progress corruption."),
       ],
       covers="F7, AdMob interstitial, ad policy"),

    tc(pdf, "TC-012", "Advertisement failure and dismissal",
       "Ads are the least reliable dependency in the app. A failure must be invisible "
       "- a message at worst - and must never grant a reward that was not earned.",
       [
           ("Enable airplane mode.", "The device is offline."),
           ("Attempt to load a rewarded ad.", "The request fails gracefully; the player is told the ad is unavailable."),
           ("Check the hint counter.", "Unchanged. No reward for an ad that did not play."),
           ("Confirm the game is still playable with no ad available.", "The level can be finished normally; restart is always free."),
           ("Start an ad with a connection, then close it before completion.", "No reward; a dismissal is treated as normal, not as an error."),
           ("Request ads several times in quick succession.", "No duplicate rewards, no UI lock-up, no crash."),
           ("Restore the connection and request an ad.", "Ads resume working."),
           ("Check the app state after every failure above.", "No frozen UI, no permanent spinner, no lost board."),
       ],
       covers="F6, F7, offline, error handling"),

    tc(pdf, "TC-013", "Audio controls and behaviour",
       "Volume settings that appear to work but do not are worse than none. Each "
       "category must be provably independent.",
       [
           ("Open Settings and adjust the master volume.", "All categories scale together."),
           ("Adjust the music volume alone.", "Music changes; sound effects do not."),
           ("Adjust the sound-effect volume alone.", "Effects change; music does not."),
           ("Adjust the voice volume alone.", "Voice announcements change; nothing else does."),
           ("Mute music and play a level.", "No music, effects still audible."),
           ("Mute effects and play a level.", "No effects, music still audible."),
           ("Mute everything and play a level.", "Total silence, no crash."),
           ("Toggle each control rapidly about twenty times.", "No crash, no stuck audio; the setting ends as last shown."),
           ("Move between menu and gameplay ten times.", "Beds are cross-faded; a bed already playing is not restarted."),
           ("Background the app during music, then resume.", "Audio pauses and resumes with no overlap or double playback."),
           ("Trigger many effects as fast as possible.", "The 45 ms voice limiter prevents a buzz; no clipping, no stacking."),
           ("Complete a level and listen for the sting.", "The sting plays over a ducked bed rather than cutting it."),
           ("Confirm behaviour when audio assets are absent.", "Total silence and no crash - the missing-file path is a no-op."),
       ],
       covers="F15, audio service, mixing"),


    tc(pdf, "TC-014", "Haptics and vibration",
       "The haptics setting must actually gate the hardware, and the debounce must "
       "not be mistaken for a bug during very fast play.",
       [
           ("Confirm haptics are enabled in Settings.", "The toggle reads on."),
           ("Tap a button.", "A selection haptic."),
           ("Tap a releasable arrow.", "A medium haptic at the moment of release."),
           ("Tap a blocked arrow.", "A heavy haptic at the moment of impact, not before."),
           ("Use a hint.", "A light haptic."),
           ("Lose a heart.", "A warning haptic."),
           ("Complete a level.", "A success haptic."),
           ("Run out of hearts.", "An error haptic."),
           ("Turn haptics off.", "The setting reads off."),
           ("Repeat every action above with haptics off.", "No vibration at any point."),
           ("Toggle haptics on and off ten times rapidly.", "No crash; the final state matches the toggle."),
           ("With haptics on, trigger two different haptic events inside 60 ms.", "One vibration. This is the documented debounce, not a fault."),
           ("Test on a device with no haptic hardware, if available.", "Everything still works; vibration is simply absent."),
       ],
       covers="F16, haptics service, debounce"),

    tc(pdf, "TC-015", "Awards - all eight, at their boundaries",
       "An award that unlocks early hands the player something they did not earn; one "
       "that unlocks late robs them. Both are tested at the exact threshold, one "
       "below it, and one above it.",
       [
           ("Open Challenge, then Rewards.", "All eight awards are listed with icons, titles and descriptions."),
           ("Confirm all eight are locked at the start.", "Locked art for each; none shows as earned."),
           ("Earn Level Legend (clear 50 levels).", "It flips to earned at exactly 50 - not at 49, not at 51."),
           ("Open its detail screen.", "Progress reads 50 of 50 and the description matches the requirement."),
           ("Repeat at 49 levels on a clean profile.", "Still locked."),
           ("Repeat at 51 levels.", "Still earned; progress is capped rather than showing 51 of 50."),
           ("Earn Perfect Play (10 perfect clears).", "Earned at exactly 10; one clear with a single wrong tap does not count."),
           ("Earn Unstoppable (20 consecutive clears).", "A single failed level breaks the run and the counter reflects that."),
           ("Earn Longest Streak (7-day challenge streak).", "Earned at exactly 7 consecutive challenge days."),
           ("Earn Highest Win Streak (10-win streak).", "Earned at exactly 10."),
           ("Earn Most Wins (30 daily wins).", "Earned at exactly 30 total wins."),
           ("Earn League Climb (reach Gold).", "Earned on promotion, not before."),
           ("Earn League Fighter (10 league battles).", "Earned at exactly 10 battles."),
           ("Force-close and relaunch after each award.", "Every earned award survives; nothing resets."),
       ],
       covers="F13, F14, awards, boundaries"),

    tc(pdf, "TC-016", "Collection and monthly calendar",
       "The calendar is the only place a daily player sees their history, so an "
       "inaccurate cell is a visible lie.",
       [
           ("Open Collection.", "The calendar renders for the current month."),
           ("Check the month and year header.", "It matches the device date."),
           ("Check days before the challenge series started.", "They are not shown as playable or as missed."),
           ("Check future days in the current month.", "Locked, and tapping them does nothing."),
           ("Complete today's challenge and return.", "Today's cell updates to cleared."),
           ("Tap a cleared day.", "A detail view opens with that day's result."),
           ("Tap an uncleared past day.", "It offers the challenge, or clearly shows it as not played."),
           ("Compare the completed-day count with the cells actually cleared.", "They agree exactly."),
           ("Navigate to the previous month.", "It renders with the correct length, including February in a leap year."),
           ("Check the weekday alignment of the first of a month.", "The first day sits under the correct weekday column."),
           ("Trigger a monthly trophy milestone.", "The trophy appears once, not on every visit."),
           ("Close the trophy and reopen Collection.", "It does not reappear for the same milestone."),
       ],
       covers="F10, F28, collection, dates"),


    tc(pdf, "TC-017", "Daily challenge",
       "The daily is deterministic by design: the level is a pure function of the "
       "date, so two devices agree without a server. The property to prove is that "
       "the same date always yields the same board, and that the pool really is "
       "Hard and above.",
       [
           ("Open Challenge.", "Today's challenge is offered."),
           ("Note the level number offered today.", "Recorded for the determinism check below."),
           ("Force-close and relaunch, then reopen Challenge.", "The identical level number is offered. Nothing was rerolled."),
           ("Check the tier of the offered level.", "It is Hard or above - never a tutorial board."),
           ("Play and complete today's challenge.", "The result is recorded against today's date."),
           ("Replay today's challenge and deliberately fail.", "The stored result remains the win - a worse attempt never overwrites a better one."),
           ("Replay and beat your own time.", "The record improves."),
           ("Start today's challenge and leave immediately.", "It is recorded as abandoned rather than untouched."),
           ("Open the Challenge history.", "Today's entry shows the best attempt."),
           ("Open the Challenge statistics.", "The played, won and streak numbers match the history."),
           ("Tap a future day.", "Locked; it cannot be played."),
           ("Play a past unplayed day.", "It is available - past days stay open by design."),
           ("Check the streak after a missed day.", "The streak reflects consecutive days won; a break is counted correctly."),
       ],
       covers="F11, F12, schedule, determinism"),

    tc(pdf, "TC-018", "Themes",
       "A theme touches every surface in the app. The failure mode is not a broken "
       "theme but a half-applied one, where one screen still shows the old palette.",
       [
           ("Open Settings and list the available themes.", "Every theme is offered with a preview."),
           ("Select each theme in turn.", "Each applies without a restart."),
           ("Check the background on Home, Levels, Play, Collection, Challenge and Settings.", "Every screen reflects the new theme."),
           ("Check the board surface in Play.", "Board colour matches the theme."),
           ("Check the board pattern across themes.", "Solid, dots, lines, crosses and checker render as intended, with no seams."),
           ("Check arrow bodies and heads.", "Colour, tail shape and head shape follow the theme."),
           ("Check the colour-blind group cues if the theme uses them.", "Circle, square, triangle, diamond and star appear per group."),
           ("Check popups, dialogs and the pause menu.", "Themed, not default-styled."),
           ("Check the completion overlay.", "Themed."),
           ("Check the tab bar and headers.", "Themed."),
           ("Change the theme mid-level.", "It applies immediately with no board corruption and no lost move."),
           ("Change the theme while on a non-play screen, then enter Play.", "The new theme is already in force."),
           ("Force-close and relaunch.", "The selected theme persists."),
           ("Confirm contrast on every theme.", "Every arrow is distinguishable from the board and from the other arrows."),
       ],
       covers="F17, F25, theme system, visual QA"),

    tc(pdf, "TC-019", "Persistence and save-load",
       "Progress that does not survive a restart is the fastest way to lose a player.",
       [
           ("Complete five levels.", "Each is recorded."),
           ("Force-close the app completely.", "Process is gone."),
           ("Reopen.", "All five levels still read as cleared; Continue offers level 6."),
           ("Complete a daily challenge.", "Recorded."),
           ("Force-close and reopen.", "The challenge result is still there."),
           ("Change the theme and the volume settings.", "Applied."),
           ("Force-close and reopen.", "Theme and volumes are as set."),
           ("Earn an award, then restart.", "It is still earned."),
           ("Background the app mid-level for ten minutes, then resume.", "The board is intact."),
           ("Reboot the device, then launch the app.", "All progress, settings and awards are intact."),
           ("Check the counters after all of this.", "Cleared count, perfect count, streak and challenge stats are all internally consistent."),
       ],
       covers="persistence, storage, F8, F17"),

    tc(pdf, "TC-020", "Corruption and recovery",
       "A save that cannot be read must never be a reason the app will not open.",
       [
           ("Launch with a valid save.", "Opens normally and shows real progress."),
           ("Launch with the save key absent.", "Opens with a fresh default state, no error shown to the player."),
           ("Launch with a truncated save.", "Falls back to default rather than crashing."),
           ("Launch with a save that is not JSON.", "Falls back to default."),
           ("Launch with a save whose version is newer than the build understands.", "Falls back to default; it is never guessed at."),
           ("Launch with a save whose version is older.", "Migrates or falls back, without crashing."),
           ("Wipe app data from Android settings, then launch.", "Opens as a fresh install."),
           ("Confirm the app remains fully playable after each of the above.", "No screen is broken by the recovery path."),
       ],
       covers="storage, migration, error handling"),

def content_tests_3(pdf):
    tc(pdf, "TC-021", "Authentication",
       "Sign-in is optional by design: the game is fully playable signed out, and "
       "signing in can only merge progress in. Nothing may block on the network.",
       [
           ("Open Account.", "The sign-in control is visible and the app is fully usable signed out."),
           ("Tap Sign In with Google.", "The Google account picker opens."),
           ("Dismiss the picker without choosing.", "The app returns cleanly. No crash, no stuck spinner."),
           ("Tap Sign In again with no network.", "A graceful failure message; the app stays usable."),
           ("Sign in with a valid account.", "The signed-in state is reflected on the Account screen."),
           ("Check the local progress after signing in.", "Nothing is lost; the account copy merges in."),
           ("Sign out.", "Returns to the signed-out state without wiping local progress."),
           ("Sign in on a second device with the same account.", "History from the first device appears."),
           ("Change a result on both devices differently, then sync.", "The better of the two values survives, not simply the newer."),
           ("Force-close while signed in, then relaunch.", "The session is restored or the app is signed out gracefully - never stuck mid-state."),
       ],
       covers="F19, auth, sync, graceful failure"),

    tc(pdf, "TC-022", "Responsive layout across screen sizes",
       "Every layout is exercised at the extremes, because the failure is rarely a "
       "crash - it is a control that slides under the notch or a number that clips.",
       [
           ("Test on a small phone (about 360 dp wide).", "Nothing clips, nothing overlaps, every control is reachable."),
           ("Test on a standard phone (about 390 dp).", "Layout is comfortable; correct gutters."),
           ("Test on a large phone (about 430 dp).", "Layout scales up rather than stretching edge to edge."),
           ("Test on a tablet or a wide window (600 dp and above).", "Content is bounded and centred, not smeared across the width."),
           ("Test a tall aspect ratio.", "No vertical overflow; nothing is pushed off the bottom."),
           ("Test a short aspect ratio (under about 700 dp tall).", "The layout compresses without hiding controls."),
           ("Check the safe area on a notched or hole-punch device.", "No content sits under the notch, the camera cut-out or the gesture bar."),
           ("Check the board on the largest and smallest screens.", "The board is fully visible and the minimum cell size keeps arrows tappable."),
           ("Check text on every screen at each size.", "No truncation, no ellipsis on important labels, no overlapping lines."),
           ("Check popups on the smallest screen.", "They fit, with their buttons reachable."),
           ("Check the level grid on the smallest screen.", "Cells remain tappable."),
           ("Increase the system font size, then re-check.", "Text scales without breaking layout, or the change is bounded."),
       ],
       covers="F2, F22, responsive UI, accessibility"),

    tc(pdf, "TC-023", "Performance over a long session",
       "Slow degradation is invisible in a two-minute test and obvious to a player in "
       "their tenth level.",
       [
           ("Play ten levels back to back.", "Frame rate stays smooth; no progressive slowdown."),
           ("Play twenty-five levels.", "Memory does not climb without bound."),
           ("Play fifty levels.", "No leak, no crash, animation timing unchanged."),
           ("Watch the frame rate on the densest board available.", "Holds up; the recorded-picture path keeps panning cheap."),
           ("Pan and zoom repeatedly on a dense board.", "Smooth. Cost tracks pixels moved, not arrow count."),
           ("Exit to the menu and re-enter Play twenty times.", "No accumulation of listeners, players or pictures."),
           ("Complete a level and immediately start the next twenty times.", "Consistent transition time; no growing delay."),
           ("Leave the app in the background for ten minutes, then resume.", "State intact, no jank on resume."),
           ("Observe battery drain over a ten-minute session.", "In line with a casual puzzle game; nothing spins in the background."),
           ("Check the app's storage footprint after fifty levels.", "Grows slowly and predictably; no unbounded log or cache growth."),
       ],
       covers="performance, memory, F24, F27"),


    tc(pdf, "TC-024", "Touch, gesture and edge cases",
       "The two previous touch defects in this project were found by a player rather "
       "than a test, which is exactly why this section exists.",
       [
           ("Tap the exact centre of an arrow.", "That arrow is selected."),
           ("Tap just off an arrow, within tolerance.", "The intended arrow is still selected."),
           ("Tap on genuinely empty board.", "Nothing is selected and no heart is lost."),
           ("Tap between two adjacent arrows.", "The nearer one is selected, consistently."),
           ("Tap right on the board edge and in a corner.", "The correct arrow is selected, or nothing is."),
           ("Double-tap an arrow.", "No second move."),
           ("Long-press an arrow.", "Nothing unexpected triggers."),
           ("Swipe across the board.", "Pans the camera; it does not select an arrow."),
           ("Pinch to zoom, then tap an arrow.", "The tap still selects the right arrow after the camera transform."),
           ("Pan far off-centre, then tap.", "Selection is correct despite the camera offset - this is the case the hit test exists for."),
           ("Tap an arrow the instant it finishes exiting.", "Nothing is selected; no phantom move."),
           ("Tap an arrow while a different one is mid-exit.", "Handled consistently."),
           ("Tap outside every button on each screen.", "No accidental navigation."),
           ("Rapidly open and close a popup twenty times.", "No stuck modal, no invisible overlay blocking input."),
           ("Close the app during an animation.", "Reopening shows a coherent state, not a half-applied move."),
           ("Close the app during the completion overlay.", "The level is recorded complete, not left in limbo."),
           ("Take a phone call mid-level.", "The game pauses; resuming restores the board."),
           ("Pull down the notification shade mid-level.", "The game pauses; play resumes cleanly."),
           ("Change the system volume mid-level.", "Only system volume changes; game settings are untouched."),
           ("Lock and unlock the screen mid-level.", "The board is exactly as left."),
       ],
       covers="hit testing, gestures, F24, Android system"),

    tc(pdf, "TC-025", "Regression after any fix",
       "A fix is not finished until it has been proven not to have broken a neighbour.",
       [
           ("Re-run the original failing case.", "It now passes."),
           ("Re-run the whole test case the defect was found in.", "No step regressed."),
           ("Re-run the gameplay cases (TC-005 through TC-010).", "Core loop unaffected."),
           ("Re-run navigation (TC-003).", "Unchanged."),
           ("Re-run persistence (TC-019 and TC-020).", "Unchanged."),
           ("Re-run the ads cases if anything touched the level-complete path.", "Unchanged."),
           ("Re-run audio and haptics if anything touched the event path.", "Unchanged."),
           ("Re-run progression, awards and collection if anything touched state.", "Unchanged."),
       ],
       covers="regression discipline"),

    tc(pdf, "TC-026", "Full player journey, start to finish",
       "One continuous session played without looking at the source, as a new player "
       "would. This is the acceptance test: at the end, nothing should have felt "
       "broken or unexplained.",
       [
           ("Install the build and launch it.", "Opens to Home with no development-server prompt."),
           ("Play and clear level 1.", "Animations, sound and haptics all land; the win overlay reads clearly."),
           ("Play five more levels.", "Difficulty reads as increasing; no level feels broken."),
           ("Use a hint.", "It points at a real move."),
           ("Watch a rewarded ad to earn a hint.", "The reward arrives exactly once and the board is untouched."),
           ("Deliberately tap a blocked arrow.", "It is obvious what happened and why."),
           ("Open the Collection.", "Today is available; the month is legible."),
           ("Play today's daily challenge.", "Same board as the schedule says, and the result is recorded."),
           ("Open the Awards.", "Nothing is earned yet; descriptions are readable."),
           ("Open the Statistics.", "The numbers agree with what was actually played."),
           ("Change the theme.", "Every screen picks it up."),
           ("Turn the music off, keep the effects on.", "Exactly that."),
           ("Turn haptics off.", "Vibration stops."),
           ("Play ten more levels.", "No slowdown; interstitial cadence is tolerable and never interrupts a solve."),
           ("Force-close the app.", "Process gone."),
           ("Relaunch.", "Everything is exactly where it was left."),
           ("Continue playing.", "The session resumes without friction."),
       ],
       covers="acceptance, end-to-end"),

def content_closeout(pdf):
    pdf.page_break()
    pdf.h1("3.  Bug classification and reporting")

    pdf.h2("3.1  Severity scale")
    pdf.table(
        ["Severity", "Meaning", "Examples", "Release impact"],
        [
            ["P0 - Blocker", "The build cannot be used at all.",
             "App will not launch; crash on startup; saved data corrupted; a level cannot be completed at all.",
             "Cannot ship."],
            ["P1 - Critical", "Core play or player data is broken.",
             "A move does not register; progress lost on restart; a reward duplicated; wrong level unlocked after a wrong tap.",
             "Cannot ship."],
            ["P2 - Major", "An important feature is partly broken or seriously unclear.",
             "Interstitial appears at the wrong cadence; an award never unlocks; a hint points at the wrong arrow; a theme breaks one screen.",
             "Ship only with a documented decision."],
            ["P3 - Minor", "Low-impact functional or copy problem.",
             "A mislabelled counter; a sound that does not stop; a button that needs two taps.",
             "Ship; fix in the next build."],
            ["P4 - Cosmetic", "Visual polish only.",
             "One-pixel alignment; a slightly inconsistent corner radius; a colour a shade off.",
             "Ship; backlog."],
        ],
        [0.135, 0.24, 0.44, 0.185],
        size=8.4,
    )

    pdf.h2("3.2  Bug report format")
    pdf.p("Every defect is filed in this shape. The Repro Rate and Evidence fields are "
          "not optional: a defect that cannot be reproduced by someone else is not yet "
          "a defect, and a defect filed without evidence is a claim.", size=9.6)
    pdf.table(
        ["Field", "What goes in it"],
        [
            ["Bug ID", "BP-nnn, allocated in order of discovery"],
            ["Severity", "P0 to P4, per the scale above"],
            ["Priority", "Critical / High / Medium / Low - may differ from severity"],
            ["Feature", "The feature name from the inventory (for example F6, rewarded ad)"],
            ["Screen", "The route or screen name"],
            ["Level", "The level id, when the defect is level-specific"],
            ["Device", "Make and model"],
            ["Android version", "Full version and one-UI or vendor skin, if any"],
            ["Build", "Version name and versionCode, and which APK"],
            ["Preconditions", "The exact state before the first step"],
            ["Steps to reproduce", "Numbered, minimal, and enough for a stranger to follow"],
            ["Expected result", "What the game should have done, and why that is the intended behaviour"],
            ["Actual result", "What it did, described without interpretation"],
            ["Repro rate", "Always / Often / Sometimes / Rare"],
            ["Evidence", "Screenshot, screen recording, or logcat excerpt"],
            ["Possible root cause", "Only where there is real evidence. Otherwise leave blank."],
        ],
        [0.26, 0.74],
        size=8.6,
    )

    pdf.h2("3.3  Known limitations to record, not to file as bugs")
    pdf.p("These are understood, intended, or environmental. They are recorded so that "
          "they are not mistaken for defects during execution.", size=9.6)
    pdf.table(
        ["ID", "Limitation", "Why it is not a defect"],
        [
            ["KB-001", "The audio files are not in the repository.",
             "The audio layer is written to be a total no-op without them, so silence is the correct behaviour until assets are added. The absence must be verified not to crash, which is TC-013."],
            ["KB-002", "The debug APK serves Google test ad creatives.",
             "That is the entire purpose of the debug build. Test ads must never appear in the release APK, and real ads must never appear in the test APK - both directions are checkable."],
            ["KB-003", "Google Sign-In may report a misconfiguration on a sideloaded build.",
             "Sign-in requires this machine's build certificate SHA-1 to be registered as an Android OAuth client for the package. That is a console task, not a code defect."],
            ["KB-004", "The release APK is signed with the debug certificate.",
             "The project's existing signing configuration, unchanged. It is fine for sideload testing and is not a Play submission artefact."],
            ["KB-005", "Haptics occasionally appear to be missing during very fast play.",
             "The 60 ms global debounce collapses two events into one on purpose. It is documented behaviour and is tested explicitly in TC-014."],
            ["KB-006", "Level unlocking is strictly sequential.",
             "UNLOCK_ALL_LEVELS is false in this build by design, so only level 1 is open on a fresh profile."],
        ],
        [0.10, 0.30, 0.60],
        size=8.4,
    )

def content_matrix(pdf):
    pdf.page_break()
    pdf.h1("4.  Test result matrix")

    pdf.p("Completed during execution. Tests is the number of steps written for the "
          "area; the remaining columns are counts of outcomes. A blank row at the end "
          "of the cycle is an incomplete cycle, not a pass.", size=9.6)

    areas = [
        ("Installation", "TC-001"),
        ("Startup and first run", "TC-001"),
        ("Home screen", "TC-002"),
        ("Navigation and back-stack", "TC-003"),
        ("Level selection", "TC-004"),
        ("Gameplay - clear path", "TC-005"),
        ("Gameplay - blocked path", "TC-006"),
        ("Puzzle logic and solvability", "TC-007"),
        ("Rapid tap and stress", "TC-008"),
        ("Hints", "TC-009"),
        ("Rewarded ads", "TC-010"),
        ("Interstitial ads", "TC-011"),
        ("Ad failure and dismissal", "TC-012"),
        ("Audio", "TC-013"),
        ("Haptics", "TC-014"),
        ("Awards (8)", "TC-015"),
        ("Collection and calendar", "TC-016"),
        ("Daily challenge", "TC-017"),
        ("Themes", "TC-018"),
        ("Persistence", "TC-019"),
        ("Corruption recovery", "TC-020"),
        ("Authentication", "TC-021"),
        ("Responsive UI", "TC-022"),
        ("Performance and long session", "TC-023"),
        ("Touch, gesture and edge cases", "TC-024"),
        ("Android system behaviour", "TC-024"),
        ("Offline behaviour", "TC-012"),
        ("Regression", "TC-025"),
        ("Full player journey", "TC-026"),
    ]
    rows = [[name, tc_id, "", "", "", ""] for name, tc_id in areas]
    pdf.table(["Area", "Case", "Tests", "Passed", "Failed", "Blocked"],
              rows, [0.44, 0.13, 0.10, 0.11, 0.11, 0.11], size=8.6)

    pdf.space(6)
    pdf.h3("Totals")
    pdf.table(["", "Tests", "Passed", "Failed", "Blocked"],
              [["Overall", "", "", "", ""]], [0.44, 0.13, 0.11, 0.11, 0.21], size=9.0)
    pdf.note("Blocked means the step could not be executed - most often because the "
             "device, the network condition, or the account required is not available. "
             "A blocked step is reported and explained; it is never quietly counted as "
             "a pass.")


def content_verdict(pdf):
    pdf.page_break()
    pdf.h1("5.  Final QA verdict")

    pdf.h2("5.1  Overall status")
    pdf.p("Exactly one of the following is selected at the end of the cycle.", size=9.8)
    pdf.table(
        ["Status", "Means"],
        [
            ["[ ]  READY FOR RELEASE", "No P0, P1 or P2 open. Every area executed. Known limitations accepted and documented."],
            ["[ ]  READY WITH MINOR ISSUES", "No P0 or P1 open. Open P2s have a written decision to ship. P3/P4 backlogged."],
            ["[ ]  NOT READY", "At least one P0, P1 or unresolved P2. The build must not be distributed."],
            ["[ ]  BLOCKED", "A precondition is missing and the cycle could not be completed. State what is blocking."],
        ],
        [0.30, 0.70],
        size=9.0,
    )

    pdf.h2("5.2  Findings")
    for label, hint in [
        ("Critical issues (P0 / P1)", "None found, or list each with its BP id and one-line impact."),
        ("Major issues (P2)", "None found, or list each with its BP id and one-line impact."),
        ("Minor issues (P3 / P4)", "None found, or list each with its BP id."),
        ("Passed features", "Areas that completed every step without a defect."),
        ("Failed features", "Areas with at least one unresolved P0, P1 or P2."),
        ("Blocked areas", "Areas that could not be executed, and why."),
    ]:
        pdf.h3(label)
        pdf.p(hint, size=9.2, color=MUTED)
        pdf.space(22)
        pdf.rule(RULE_C, 0.5)
        pdf.space(11)

    pdf.h2("5.3  Recommended fix order")
    pdf.p("Ordered by severity first and, within a severity, by how many players would "
          "meet the defect and how badly it hurts them.", size=9.6)
    pdf.space(96)
    pdf.rule(RULE_C, 0.5)

    pdf.h2("5.4  Release recommendation")
    pdf.p("A single objective paragraph: whether this exact build should be distributed, "
          "to whom, and under what conditions. If the answer is yes, it states which "
          "defects are knowingly shipped and why that is acceptable.", size=9.6)
    pdf.space(88)
    pdf.rule(RULE_C, 0.5)

def content_checklist(pdf):
    pdf.page_break()
    pdf.h1("6.  Execution checklist")

    pdf.p("Tick these in order. The sequence is deliberate: each stage assumes the one "
          "before it has been established, so testing gameplay before installation and "
          "startup are proven wastes the cycle.", size=9.6)

    stages = [
        ("Preparation", [
            "Confirm the working tree is the build under test - no stale artefacts.",
            "Confirm the build names, versionName and versionCode match this document.",
            "Uninstall any previous build from the test device.",
            "Confirm developer options and ADB logging are available for evidence capture.",
        ]),
        ("Installation and startup", ["TC-001", "TC-002", "TC-003", "TC-004"]),
        ("Core play", ["TC-005", "TC-006", "TC-007", "TC-008", "TC-009"]),
        ("Advertising", ["TC-010", "TC-011", "TC-012"]),
        ("Feedback systems", ["TC-013", "TC-014"]),
        ("Progression", ["TC-015", "TC-016", "TC-017"]),
        ("Presentation", ["TC-018", "TC-022"]),
        ("Durability", ["TC-019", "TC-020"]),
        ("Accounts and network", ["TC-021"]),
        ("Endurance", ["TC-023", "TC-024"]),
        ("Close-out", ["TC-025", "TC-026"]),
        ("Report", [
            "Complete the result matrix in section 4.",
            "File every defect in the format in section 3.2, with evidence.",
            "Classify every open issue by severity and priority.",
            "Select exactly one overall status in section 5.1.",
            "Write the release recommendation in section 5.4.",
        ]),
    ]

    for stage, entries in stages:
        pdf.h3(stage)
        for entry in entries:
            label = entry
            marker = "[  ]"
            line = "%s   %s" % (marker, label)
            pdf._ensure(14)
            pdf._text(MARGIN + 6, pdf.y, 10, False, INK, line)
            pdf.y -= 14
        pdf.space(6)

    pdf.h2("Sign-off")
    pdf.table(
        ["Role", "Name", "Date", "Signature"],
        [["QA lead", "", "", ""], ["Release owner", "", "", ""]],
        [0.25, 0.25, 0.20, 0.30],
        size=9.0,
    )


def build(path):
    pdf = Pdf("ArrowPath - QA & Acceptance Test Plan",
              "Complete pre-release QA cycle for the ArrowPath Android build")
    content_cover(pdf)
    content_inventory(pdf)
    content_tests_1(pdf)
    content_tests_2(pdf)
    content_tests_3(pdf)
    content_closeout(pdf)
    content_matrix(pdf)
    content_verdict(pdf)
    content_checklist(pdf)
    pages = pdf.save(path)
    return pages


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "ArrowPath_QA_Test_Plan.pdf"
    pages = build(out)
    print("wrote %s (%d pages)" % (out, pages))


if __name__ == "__main__":
    main()


