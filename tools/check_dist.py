#!/usr/bin/env python3
"""Check a build: every page has the platform bar exactly once and the kit stylesheet, every asset a page references
exists, and footprints.json is consistent (columns of equal length, indices in range, years in order).

    python3 tools/check_dist.py dist
"""

import json
import re
import sys
from pathlib import Path

SSI = '<!--# include virtual="/kit/1/header.html" -->'
BASE = "/footprints/"


def main(dist):
    dist = Path(dist)
    errors = []
    pages = list(dist.rglob("*.html"))
    for p in pages:
        t = p.read_text(encoding="utf-8")
        if t.count("<!--#") != 1 or SSI not in t:
            errors.append(f"{p}: not exactly one platform bar")
        if '<link rel="stylesheet" href="/kit/1/jl.css">' not in t:
            errors.append(f"{p}: no kit stylesheet")
        for ref in re.findall(r'(?:href|src|data-src|data-basemap|data-resolve)="(' + BASE + r'[^"?#]*)', t):
            f = dist / ref[len(BASE):]
            if f.is_dir():
                f = f / "index.html"
            if not f.exists():
                errors.append(f"{p}: missing {ref}")
    d = json.loads((dist / "data" / "footprints.json").read_text(encoding="utf-8"))
    n = {k: len(d[k]["id"]) for k in ("places", "persons", "works", "imprints", "copies", "footprints")}
    for table, size in n.items():
        for col, values in d[table].items():
            if col in ("ao", "a"):
                continue
            if len(values) != size:
                errors.append(f"{table}.{col}: {len(values)} values for {size}")
        if "ao" in d[table]:
            ao, a = d[table]["ao"], d[table]["a"]
            if len(ao) != size + 1 or ao[-1] * 2 != len(a):
                errors.append(f"{table}: offsets do not match the actors")
            for j in range(0, len(a), 2):
                if not (0 <= a[j] < len(d["roles"]) and 0 <= a[j + 1] < n["persons"]):
                    errors.append(f"{table}: actor {j // 2} out of range")
                    break
        if len(set(d[table]["id"])) != size:
            errors.append(f"{table}: ids not unique")

    def refs(table, col, target, allow_none=True):
        for v in d[table][col]:
            if not (0 <= v < n[target] or (allow_none and v == -1)):
                errors.append(f"{table}.{col}: {v} out of range")
                return

    refs("imprints", "work", "works")
    refs("imprints", "place", "places")
    refs("copies", "imprint", "imprints")
    refs("copies", "owner", "persons")
    refs("footprints", "copy", "copies", False)
    refs("footprints", "place", "places")
    for table in ("imprints", "footprints"):
        for y0, y1 in zip(d[table]["y0"], d[table]["y1"]):
            if (y0 == 0) != (y1 == 0) or y0 > y1:
                errors.append(f"{table}: years {y0}, {y1}")
                break
    res = json.loads((dist / "data" / "resolve.json").read_text(encoding="utf-8"))
    kinds = {"place": "places", "writtenwork": "works", "imprint": "imprints", "book": "copies",
             "footprint": "footprints", "person": "persons"}
    ids = {k: set(map(str, d[v]["id"])) for k, v in kinds.items()}
    bad = [v for v in res.values() if v.split("/")[1] not in ids.get(v.split("/")[0], ())]
    if bad:
        errors.append(f"resolve.json: {len(bad)} records not in the data, e.g. {bad[0]}")
    for msg in errors[:50]:
        print(msg)
    print(f"{len(pages)} pages, " + ", ".join(f"{v:,} {k}" for k, v in n.items()) + f", {len(res):,} entity pages: "
          + ("OK" if not errors else f"{len(errors)} errors"))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "dist"))
