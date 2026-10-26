# 0001 A static map built from the store, with the map engine of jlma-atlas

Status: accepted · Date: 2026-10-26

## Context

Footprints: Jewish Books Through Time and Place records where copies of Jewish books were at a time: owners,
sellers, censors, libraries. JudaicaLink has the whole of it since footprints 2026-10-26 (from the API). Its own site
shows each record, and a map per record; what it does not show is the whole: where books were printed, where their
copies went and when. The platform prefers static showcases (platform decision 0001), and the Atlas (jlma-atlas
0001) already draws a world map without tiles or libraries.

## Decision

- `build.py` reads the stable version of footprints (and of ep, for the resolve map) from a store, the versions named
  by the data index, and writes a static site: the map page, an about page, `data/footprints.json` (the records as
  columns), `data/resolve.json` and the assets. Python standard library only; the RDF reader is the one of
  judaicalink-data, copied as in jlma-atlas.
- The browser part is the map engine of jlma-atlas (Web Mercator on a canvas, the Natural Earth base map
  `assets/basemap.json`, panning and zooming, timeline, area filter, search, the address as state), copied into
  `assets/fp.js` and changed for the records of Footprints. A copy, not a shared library: showcases stay working
  without upkeep, each with the code it was built with.
- Pages follow the platform contract: `/kit/1/jl.css`, the platform bar by SSI, own CSS prefixed `fp-`, paths below
  `/footprints/` (`--base`).

## Consequences

No request leaves the site; the data file is about 0.85 MB compressed. A new version of footprints means: build,
check (`tools/check_dist.py`), deploy.
