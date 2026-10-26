#!/usr/bin/env python3
"""Build the Footprints showcase: a map of where the copies of Jewish books were printed and where they went.

Reads the stable version of footprints (and of ep, for the resolve map) from a store (layout <slug>/<version>/<path>,
the versions named by the data index) and writes a static site:

    python3 build.py --store ~/lokal/judaicalink/store --index ../judaicalink-data/catalog/dataindex.json --out dist

dist/index.html (the map), dist/about/, dist/data/footprints.json (places, persons, works, imprints, copies,
footprints as columns), dist/data/resolve.json (entity page -> footprints record), dist/assets/, dist/build.json.
"""

import argparse
import datetime
import hashlib
import html
import json
import shutil
import sys
from pathlib import Path

from fp import model
from fp.geo import Countries
from fp.rdf import IRI, read_triples

ROOT = Path(__file__).resolve().parent
DCT = "http://purl.org/dc/terms/"
LICENSES = {"https://creativecommons.org/licenses/by-sa/4.0/": "CC BY-SA 4.0",
            "http://creativecommons.org/licenses/by-sa/4.0/": "CC BY-SA 4.0",
            "https://creativecommons.org/publicdomain/zero/1.0/": "CC0 1.0",
            "http://creativecommons.org/publicdomain/zero/1.0/": "CC0 1.0"}
USES = {"footprints": "works, imprints, copies, footprints, persons and places, with their dates, roles and coordinates",
        "ep": "which entity page holds which Footprints record (for links from the knowledge graph)"}

esc = html.escape


def licence_of(store, slug):
    e = store.index[slug]
    path = store.root / slug / e["stable"] / f"{slug}-meta.ttl.gz"
    if not path.exists():
        return ""
    for s, p, o in read_triples(path):
        if p == DCT + "license" and isinstance(o, IRI) and s.endswith(f"/datasets/{slug}"):
            return str(o)
    return ""


def flat(rows, key):
    """Offsets and the flat list of pairs of a list-valued column."""
    off, out = [0], []
    for r in rows:
        for a, b in r[key]:
            out += [a, b]
        off.append(len(out) // 2)
    return off, out


def data_file(f, countries):
    pl = f.places
    yr = lambda x, i: x["years"][i] if x["years"] else 0
    wo, wa = flat(f.works, "actors")
    io, ia = flat(f.imprints, "actors")
    fo, fa = flat(f.footprints, "actors")
    return {
        "roles": f.roles, "media": f.media, "countries": countries.names,
        "places": {"id": [p["id"] for p in pl], "label": [p["label"] for p in pl], "lon": [p["lon"] for p in pl],
                   "lat": [p["lat"] for p in pl], "country": [countries.of(p["lon"], p["lat"]) for p in pl]},
        "persons": {"id": [p["id"] for p in f.persons], "name": [p["name"] for p in f.persons]},
        "works": {"id": [w["id"] for w in f.works], "title": [w["title"] for w in f.works], "ao": wo, "a": wa},
        "imprints": {"id": [i["id"] for i in f.imprints], "work": [i["work"] for i in f.imprints],
                     "title": [i["title"] for i in f.imprints], "y0": [yr(i, 0) for i in f.imprints],
                     "y1": [yr(i, 1) for i in f.imprints], "date": [i["date"] for i in f.imprints],
                     "place": [i["place"] for i in f.imprints], "ao": io, "a": ia},
        "copies": {"id": [c["id"] for c in f.copies], "imprint": [c["imprint"] for c in f.copies],
                   "call": [c["call"] for c in f.copies], "owner": [c["owner"] for c in f.copies]},
        "footprints": {"id": [x["id"] for x in f.footprints], "copy": [x["copy"] for x in f.footprints],
                       "place": [x["place"] for x in f.footprints], "y0": [yr(x, 0) for x in f.footprints],
                       "y1": [yr(x, 1) for x in f.footprints], "date": [x["date"] for x in f.footprints],
                       "medium": [x["medium"] for x in f.footprints], "flags": [x["flags"] for x in f.footprints],
                       "ao": fo, "a": fa},
    }


def asset_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def page(base, title, body, description, versions, css, scripts="", cls=""):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="stylesheet" href="/kit/1/jl.css">
<link rel="stylesheet" href="{css}">
</head>
<body class="{cls}">
<!--# include virtual="/kit/1/header.html" -->
{body}
<footer class="jl-footer fp-footer">
<p><strong>Data: <a href="/datasets/footprints">footprints {esc(versions.get("footprints", ""))}</a></strong>, from
<a href="https://footprints.ctl.columbia.edu/" class="jl-ext">Footprints: Jewish Books Through Time and Place</a>
(CC BY-SA 4.0) · <a href="{base}about/">About</a></p>
<p>A showcase of <a href="/">JudaicaLink Mannheim</a>. Base map: Natural Earth. This site loads nothing from third
parties.</p>
</footer>
{scripts}</body>
</html>
"""


def index_page(base, versions, css, js, data_src, basemap_src):
    body = f"""<div class="fp-app" id="main" data-base="{base}" data-src="{data_src}" data-basemap="{basemap_src}"
 data-resolve="{base}data/resolve.json">
<header class="fp-head">
<h1>Footprints</h1>
<p class="fp-lead">Where Jewish books were printed, and where their copies went: owners, sellers, censors and
libraries, from the data of <a href="https://footprints.ctl.columbia.edu/" class="jl-ext">Footprints</a>.
<a href="{base}about/">About the map</a></p>
<div class="fp-search"><label for="f-q" class="fp-vh">Find a book, person or place</label>
<input id="f-q" type="search" placeholder="Find a book, person or place" autocomplete="off" role="combobox"
 aria-expanded="false" aria-controls="f-q-list" aria-autocomplete="list">
<ul id="f-q-list" class="fp-suggest" role="listbox" hidden></ul></div>
</header>
<form class="fp-filters" id="filters" aria-label="Filters" onsubmit="return false">
<fieldset class="fp-f fp-f-time"><legend>Time</legend>
<label><span class="fp-vh">From</span><input id="f-from" type="number" inputmode="numeric" step="1"></label>–<label><span
 class="fp-vh">to</span><input id="f-to" type="number" inputmode="numeric" step="1"></label>
<button type="button" id="f-play" class="fp-btn" aria-pressed="false" title="Move the time window forward">Play</button>
</fieldset>
<fieldset class="fp-f"><legend>Area</legend>
<select id="f-area" aria-label="Area"><option value="">Whole world</option><option value="box" disabled>Drawn area</option></select>
<button type="button" id="f-draw" class="fp-btn" aria-pressed="false" title="Drag a rectangle on the map">Draw area</button>
</fieldset>
<fieldset class="fp-f fp-kinds"><legend>Show</legend>
<label><input type="checkbox" id="k-0" checked><span class="fp-key fp-key-0"></span>Printed</label>
<label><input type="checkbox" id="k-1" checked><span class="fp-key fp-key-1"></span>Footprints</label>
<label><input type="checkbox" id="k-2" checked><svg class="fp-linekey" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4"/></svg>Journeys</label>
</fieldset>
<fieldset class="fp-f"><legend>Evidence</legend>
<select id="f-medium" aria-label="Kind of evidence"><option value="">all kinds</option></select>
</fieldset>
</form>
<div class="fp-timeline" id="timeline">
<canvas id="tl" aria-label="Imprints and footprints per decade in the selected area; drag to choose the time window"
 role="slider" tabindex="0"></canvas>
</div>
<div class="fp-main">
<div class="fp-map" id="map">
<canvas id="cv" tabindex="0" aria-label="Map: drag to move, scroll or pinch to zoom, select a place for its list"></canvas>
<div class="fp-zoom"><button type="button" id="z-in" class="fp-btn" aria-label="Zoom in">+</button><button type="button"
 id="z-out" class="fp-btn" aria-label="Zoom out">−</button><button type="button" id="z-fit" class="fp-btn"
 aria-label="Show the selection">⤢</button></div>
<details class="fp-legend" id="legend" open><summary>Legend</summary><div id="sizes" aria-hidden="true"></div>
<div class="fp-legend-line"><svg class="fp-linekey" viewBox="0 0 22 8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4"/></svg>a copy moved
(curves bend to the right of the way)</div></details>
<div class="fp-tip" id="tip" hidden></div>
<p class="fp-loading" id="loading">Loading the map …</p>
</div>
<aside class="fp-panel" id="panel" aria-live="polite"></aside>
</div>
<noscript><p class="jl-note">The map needs JavaScript. The data are in <a href="{base}data/footprints.json">footprints.json</a>
and in the <a href="/sparql">SPARQL endpoint</a>.</p></noscript>
</div>
"""
    return page(base, "Footprints · JudaicaLink Mannheim", body,
                "A map of where Jewish books were printed and where their copies went, from the data of Footprints: "
                "Jewish Books Through Time and Place.", versions, css, f'<script src="{js}" defer></script>\n', "fp-full")


def about_page(base, versions, licences, stats, css):
    s = stats
    rows = "".join(
        f'<tr><td><a href="/datasets/{esc(slug)}">{esc(slug)}</a></td><td>{esc(v)}</td>'
        f'<td>{esc(LICENSES.get(licences.get(slug, ""), licences.get(slug, "")) or "–")}</td>'
        f'<td>{esc(USES.get(slug, ""))}</td></tr>' for slug, v in sorted(versions.items()))
    counts = "".join(f"<tr><td>{esc(k)}</td><td class=\"num\">{v:,}</td></tr>" for k, v in sorted(s.items())
                     if isinstance(v, int))
    body = f"""<main class="jl-main fp-about" id="main">
<p class="fp-back"><a href="{base}">← Back to the map</a></p>
<h1>About the Footprints map</h1>
<p class="jl-lead"><a href="https://footprints.ctl.columbia.edu/" class="jl-ext">Footprints: Jewish Books Through Time
and Place</a> collects the evidence that a copy of a Jewish book was at a place at a time: an owner's signature, a
censor's mark, a bookseller's catalogue, a library catalogue. This map shows where the books were printed and where
their copies went.</p>

<h2>What is on the map</h2>
<dl class="jl-facts">
<dt>Printed</dt><dd>{s['imprints with a year and a place']:,} of {s['imprints']:,} imprints (editions) at their place
of printing, in their year.</dd>
<dt>Footprints</dt><dd>{s['footprints with a time and a place']:,} of {s['footprints']:,} footprints at their place,
in their time. Footprints dates them in the Extended Date/Time Format; an uncertain or approximate date counts as its
year, a period ("between 1900 and 1961", "the 1860s") for each of its years, an open end ("before 1862") as the known
year. {s['footprints with a place but no time']:,} footprints have a place but no date, and
{s['footprints with a time but no place']:,} a date but no place: they are listed with their copy, but not on the
map.</dd>
<dt>Journeys</dt><dd>The way of a copy: from the place of printing of its imprint through the places of its footprints,
in the order of their dates. A line is drawn for each step between two places, in the time of the step's later end;
lines of many copies between the same two places are drawn as one, thicker line. A curve bends to the right of the
way it goes, so the two directions between two places are apart.</dd>
<dt>Places</dt><dd>{s['places']:,} places, as Footprints names them, with their coordinates. Areas are present-day
countries (Natural Earth); the map shows no historical borders.</dd>
</dl>
<p>Select a place for what was printed and what was found there, a book for its imprints and the journeys of its
copies, a copy for its way step by step, and a person for the records they are named in. Every record links to the
Footprints site (works and footprints have a page there) and to its view in JudaicaLink, where it is joined with the
records of the same person or place from other sources (the entity pages).</p>

<h2>Counts</h2>
<div class="jl-scroll"><table class="jl-table"><thead><tr><th>Count</th><th class="num">Number</th></tr></thead>
<tbody>{counts}</tbody></table></div>

<h2 id="data">The data</h2>
<p>Built on {esc(s['built'])} from the stable versions of these JudaicaLink datasets. The dataset footprints is made
from the Footprints API (2026-10) and keeps its records, fields and identifiers.</p>
<div class="jl-scroll"><table class="jl-table"><thead><tr><th>Dataset</th><th>Version</th><th>Licence</th>
<th>What the map takes</th></tr></thead><tbody>{rows}</tbody></table></div>
<p>Footprints: Jewish Books Through Time and Place, ed. Michelle Chesner et al., under
<a href="https://creativecommons.org/licenses/by-sa/4.0/" class="jl-ext">CC BY-SA 4.0</a>. The base map is made
from <a href="https://www.naturalearthdata.com/" class="jl-ext">Natural Earth</a> 1:50m (public domain) and is part
of this site. All data of the map: <a href="{base}data/footprints.json">footprints.json</a>.</p>

<h2>Using the map</h2>
<ul>
<li>Drag the timeline or type the years; <em>Play</em> moves the window forward.</li>
<li>Choose a country, or <em>Draw area</em> and drag a rectangle on the map.</li>
<li>The address of the page keeps the selection, so it can be shared. <code>{base}?iri=…</code> opens the map at a
Footprints record or an entity page of JudaicaLink.</li>
</ul>
</main>
"""
    return page(base, "About · Footprints · JudaicaLink Mannheim", body,
                "How the Footprints map of JudaicaLink Mannheim is made.", versions, css)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--store", required=True, type=Path)
    ap.add_argument("--index", required=True, type=Path, help="the data index (judaicalink-data catalog/dataindex.json)")
    ap.add_argument("--out", default=ROOT / "dist", type=Path)
    ap.add_argument("--base", default="/footprints/", help="the path of the showcase on the host")
    args = ap.parse_args()

    store = model.Store(args.store, args.index)
    f = model.Footprints(store)
    countries = Countries(ROOT / "assets" / "basemap.json")
    data = data_file(f, countries)
    stats = dict(f.stats)
    stats["built"] = datetime.date.today().isoformat()
    versions = dict(sorted(store.used.items()))
    licences = {slug: licence_of(store, slug) for slug in versions}

    out = args.out
    if out.exists():
        shutil.rmtree(out)
    (out / "data").mkdir(parents=True)
    (out / "assets").mkdir()
    (out / "about").mkdir()
    data["versions"] = versions
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    (out / "data" / "footprints.json").write_bytes(raw)
    (out / "data" / "resolve.json").write_text(json.dumps(f.resolve, separators=(",", ":")), encoding="utf-8")
    for name in ("fp.css", "fp.js", "basemap.json"):
        shutil.copy(ROOT / "assets" / name, out / "assets" / name)

    base = args.base
    v = lambda name: f"{base}assets/{name}?v={asset_hash(out / 'assets' / name)}"
    data_src = f"{base}data/footprints.json?v={hashlib.sha256(raw).hexdigest()[:10]}"
    (out / "index.html").write_text(index_page(base, versions, v("fp.css"), v("fp.js"), data_src, v("basemap.json")),
                                    encoding="utf-8")
    (out / "about" / "index.html").write_text(about_page(base, versions, licences, stats, v("fp.css")),
                                              encoding="utf-8")
    (out / "build.json").write_text(json.dumps({"built": stats["built"], "versions": versions, "counts": stats},
                                               indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for k, n in sorted(f.stats.items()):
        print(f"{n:9,} {k}", file=sys.stderr)
    print(f"footprints.json {len(raw):,} bytes", file=sys.stderr)


if __name__ == "__main__":
    main()
