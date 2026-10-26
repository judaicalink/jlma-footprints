# jlma-footprints: Footprints on mannheim.judaicalink.org

A static showcase of JudaicaLink Mannheim: a map of where Jewish books were printed and where their copies went, from
the data of [Footprints: Jewish Books Through Time and Place](https://footprints.ctl.columbia.edu/), at
<https://mannheim.judaicalink.org/footprints/>.

- **Printed** (imprints at their place of printing) and **footprints** (a copy at a place at a time: owners, sellers,
  censors, libraries), filtered by time, area and kind of evidence.
- **Journeys**: the ways of the copies from their printing through their footprints, drawn as lines between places.
- Select a place, a book, a copy (its way, station by station) or a person; every record links to the Footprints site
  and to its view in the knowledge graph; `/footprints/?iri=<IRI>` opens the map at a record or entity page.
- Light and dark, phones, no cookies, **no requests to third parties** (the base map is part of the site).

Decisions: [`docs/decisions/`](docs/decisions/).

## Build

Python ≥ 3.11, standard library only. The data are the stable versions of footprints and ep in a store (layout
`<slug>/<version>/<path>`, as published at <https://archive.judaicalink.org/store/>), named by the data index of
judaicalink-data:

```sh
python3 build.py --store ~/lokal/judaicalink/store --index ../judaicalink-data/catalog/dataindex.json --out dist
python3 tools/check_dist.py dist         # platform bar, kit stylesheet, assets, consistency of the data
python3 -m unittest discover tests
python3 tools/serve.py                   # preview at http://localhost:8130/footprints/
```

About 20 seconds; `dist/` is about 3.5 MB (1 MB compressed). `dist/build.json` names the data versions and counts.

## Deploy

With the platform repository [judaicalink-mannheim](https://github.com/judaicalink/judaicalink-mannheim) (registry
entry `path = "footprints"`, static):

```sh
../judaicalink-mannheim/host/deploy.sh lima-mannheim footprints dist   # the local test VM
../judaicalink-mannheim/host/deploy.sh <ssh-host> footprints dist      # mannheim.judaicalink.org
```

## Layout

| Path | What |
|---|---|
| `build.py` | the build: data files, map page, about page |
| `fp/model.py` | Footprints as read from the data: places, persons, works, imprints, copies, footprints, times |
| `fp/geo.py`, `fp/rdf.py` | the present-day country of a point; the RDF reader of judaicalink-data (both copied from jlma-atlas) |
| `assets/fp.js`, `assets/fp.css` | the map, timeline, filters, panel and search (the map engine of jlma-atlas) |
| `assets/basemap.json` | the base map (Natural Earth 1:50m), from jlma-atlas |
| `tools/check_dist.py`, `tools/serve.py` | check a build; preview it locally |

## Data and credits

Footprints: Jewish Books Through Time and Place, ed. Michelle Chesner et al., CC BY-SA 4.0, through the JudaicaLink
dataset footprints. Base map: Natural Earth (public domain).
