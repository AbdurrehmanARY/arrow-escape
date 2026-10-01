#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""validate_qa_pdf.py - sanity-check the generated QA PDF without a PDF library.

Checks the file is a well-formed PDF, that the cross-reference table points at
real object headers, and reports how many pages and how much text it contains.
Extracting the text is what proves the content actually made it into the file -
a PDF can be structurally valid and still be blank.
"""

import re
import sys


def main(path):
    data = open(path, "rb").read()
    problems = []

    if not data.startswith(b"%PDF-1.4"):
        problems.append("missing %PDF-1.4 header")
    if not data.rstrip().endswith(b"%%EOF"):
        problems.append("missing %%EOF trailer")
    if b"/Root 1 0 R" not in data:
        problems.append("missing /Root entry")

    pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    print("objects with /Type /Page : %d" % pages)

    start = data.rfind(b"startxref")
    xref_at = int(data[start:].split(b"\n")[1])
    if data[xref_at:xref_at + 4] != b"xref":
        problems.append("startxref does not point at an xref table")

    table = data[xref_at:].split(b"trailer")[0]
    entries = re.findall(rb"^(\d{10}) (\d{5}) ([nf])\s*$", table, re.M)
    print("xref entries             : %d" % len(entries))

    for offset, gen, kind in entries:
        if kind == b"n":
            at = int(offset)
            if not re.match(rb"^\d+ 0 obj", data[at:at + 24]):
                problems.append("xref offset %s does not point at an object" % offset.decode())

    text = []
    for match in re.finditer(rb"\((.*?)\)\s*Tj", data, re.S):
        chunk = match.group(1)
        chunk = re.sub(rb"\\([()\\])", rb"\1", chunk)
        chunk = re.sub(rb"\\(\d{3})", lambda m: bytes([int(m.group(1), 8)]), chunk)
        text.append(chunk.decode("latin-1", "replace"))
    joined = " ".join(text)
    print("text runs                : %d" % len(text))
    print("extracted characters     : %d" % len(joined))

    required = [
        "ArrowPath", "QA & Acceptance Test Plan", "TC-001", "TC-026",
        "F29", "KB-006", "READY FOR RELEASE", "Execution checklist",
        "Rewarded advertisement", "Haptics", "Puzzle logic",
    ]
    missing = [r for r in required if r not in joined]
    if missing:
        problems.append("text not found in output: %s" % ", ".join(missing))

    print("file size                : %d bytes" % len(data))
    if problems:
        print("\nPROBLEMS:")
        for p in problems:
            print("  - %s" % p)
        return 1
    print("\nOK - structure valid, content present.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "ArrowPath_QA_Test_Plan.pdf"))
