"""Footprints as read from the data: places, persons, works, imprints, copies and footprints, with their times.

Everything comes from the stable version of the dataset footprints in a store (layout <slug>/<version>/<path>, the
version named by the data index), and the entity pages (ep) for the resolve map. Decisions 0002 and 0003 say what is
taken and why.
"""

import collections
import json
import re
from pathlib import Path

from .rdf import IRI, Literal, read_triples

DATA = "http://data.judaicalink.org/data/"
FP = DATA + "footprints/"
V = FP + "vocab/"
EP = DATA + "ep/"
JL = "http://data.judaicalink.org/ontology/"
RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"
SKOS_PREF = "http://www.w3.org/2004/02/skos/core#prefLabel"
WKT = "http://www.opengis.net/ont/geosparql#asWKT"
DCT = "http://purl.org/dc/terms/"
GNDO = "https://d-nb.info/standards/elementset/gnd#"
NOW = 2026
KINDS = ["writtenwork", "imprint", "book", "footprint", "person", "place"]
# the persons of a record in a role: the role properties of footprints (one per role), labelled by the vocabulary;
# not roles: the structure of the records
NOT_ROLES = {V + "person", V + "actor", V + "owners", V + "currentOwners", DCT + "isReplacedBy"}
STANDARD_ROLES = {GNDO + "author": "Author", GNDO + "editor": "Editor", DCT + "publisher": "Publisher"}


def parse_wkt(s):
    m = re.search(r"point\s*\(\s*([+-]?\d+(?:\.\d+)?)\s+([+-]?\d+(?:\.\d+)?)\s*\)", s, re.I)
    if not m:
        return None
    lon, lat = float(m.group(1)), float(m.group(2))
    if not (-180 <= lon <= 180 and -90 <= lat <= 90) or (lon == 0 and lat == 0):
        return None
    return round(lon, 4), round(lat, 4)


def edtf_years(s):
    """The first and last year an EDTF value can mean, or None: "1924~" (1924, 1924), "1900?~/1961?~" (1900, 1961),
    "186x" (1860, 1869), "157x?~" (1570, 1579), "1948~/unknown" and "../1950" (the known end twice), "1650-03-12"."""
    ends = []
    for part in (s or "").split("/"):
        m = re.match(r"\s*-?(\d{2,3}[\dxX])", part)
        if not m:
            ends.append(None)
            continue
        y = m.group(1).lower()
        ends.append((int(y.replace("x", "0")), int(y.replace("x", "9"))))
    known = [e for e in ends if e]
    if not known:
        return None
    lo, hi = known[0][0], known[-1][1]
    if lo > hi or hi > NOW or lo < 1000:
        return None
    return lo, hi


def number(iri, kind):
    """The API id of a footprints record IRI of that kind, or None."""
    p = FP + kind + "/"
    return int(iri[len(p):]) if iri.startswith(p) and iri[len(p):].isdigit() else None


def text(objs):
    for o in objs:
        if isinstance(o, Literal) and o.value.strip():
            return " ".join(o.value.split())
    return ""


class Store:
    """The files of the stable version of each dataset, from the data index."""

    def __init__(self, store, index):
        self.root = Path(store)
        self.index = json.loads(Path(index).read_text(encoding="utf-8"))["datasets"]
        self.used = {}

    def triples(self, slug, name=None):
        e = self.index[slug]
        v = next(x for x in e["versions"] if x["version"] == e["stable"])
        self.used[slug] = e["stable"]
        for f in v["files"]:
            p = f["path"]
            if p.endswith("-meta.ttl.gz") or not re.search(r"\.(ttl|nt)(\.gz)?$", p) or (name and name not in p):
                continue
            yield from read_triples(self.root / slug / e["stable"] / p)


class Footprints:
    def __init__(self, store, with_resolve=True):
        self.store = store
        self.stats = collections.Counter()
        self._read()
        self._model()
        self.resolve = self._resolve() if with_resolve else {}

    def _read(self):
        rec = collections.defaultdict(lambda: collections.defaultdict(list))
        self.role_label = dict(STANDARD_ROLES)
        for s, p, o in self.store.triples("footprints"):
            if s.startswith(V):
                if p == RDFS_LABEL and isinstance(o, Literal):
                    self.role_label.setdefault(s, o.value)
                continue
            if s.startswith(FP):
                rec[s][p].append(o)
        self.rec = rec

    def roles_of(self, s):
        """[(role label, person iri)] of a record, in a fixed order."""
        out = []
        for p, objs in self.rec[s].items():
            if p in NOT_ROLES:
                continue
            for o in objs:
                if isinstance(o, IRI) and o.startswith(FP + "person/") and p in self.role_label:
                    out.append((self.role_label[p], str(o)))
        return sorted(set(out))

    def _model(self):
        r = self.rec
        by = collections.defaultdict(list)
        for s in r:
            m = re.match(re.escape(FP) + r"([a-z]+)/(\d+)$", s)
            if m and m.group(1) in KINDS:
                by[m.group(1)].append(s)
        for k in by:
            by[k].sort(key=lambda s: int(s.rsplit("/", 1)[1]))
        self.places = []
        self.place_ix = {}
        for s in by["place"]:
            c = next((parse_wkt(o.value) for o in r[s].get(WKT, []) if parse_wkt(o.value)), None)
            if not c:
                self.stats["places without coordinates"] += 1
                continue
            self.place_ix[s] = len(self.places)
            self.places.append({"id": number(s, "place"), "label": text(r[s].get(SKOS_PREF, [])), "lon": c[0],
                                "lat": c[1]})
        self.persons, self.person_ix = [], {}

        def person(iri):
            if iri not in self.person_ix:
                self.person_ix[iri] = len(self.persons)
                self.persons.append({"id": number(iri, "person"), "name": text(r[iri].get(SKOS_PREF, [])) or "(no name)"})
            return self.person_ix[iri]

        for s in by["person"]:
            person(s)
        roles = []
        role_ix = {}

        def actors(s):
            out = []
            for label, p in self.roles_of(s):
                if label not in role_ix:
                    role_ix[label] = len(roles)
                    roles.append(label)
                out.append((role_ix[label], person(p)))
            return out

        self.works, self.work_ix = [], {}
        for s in by["writtenwork"]:
            self.work_ix[s] = len(self.works)
            self.works.append({"id": number(s, "writtenwork"), "title": text(r[s].get(V + "title", []))
                               or text(r[s].get(SKOS_PREF, [])), "actors": actors(s)})
        self.imprints, self.imprint_ix = [], {}
        for s in by["imprint"]:
            w = next((self.work_ix[str(o)] for o in r[s].get(V + "work", []) if str(o) in self.work_ix), -1)
            years = next((edtf_years(o.value) for o in r[s].get(V + "publicationDate", []) if edtf_years(o.value)), None)
            place = next((self.place_ix[str(o)] for o in r[s].get(V + "place", []) if str(o) in self.place_ix), -1)
            self.imprint_ix[s] = len(self.imprints)
            self.imprints.append({"id": number(s, "imprint"), "work": w, "title": text(r[s].get(V + "title", [])),
                                  "years": years, "date": text(r[s].get(DCT + "issued", [])), "place": place,
                                  "actors": actors(s)})
            self.stats["imprints"] += 1
            if years and place >= 0:
                self.stats["imprints with a year and a place"] += 1
        self.copies, self.copy_ix = [], {}
        for s in by["book"]:
            imp = next((self.imprint_ix[str(o)] for o in r[s].get(V + "imprint", []) if str(o) in self.imprint_ix), -1)
            cur = next((person(str(o)) for o in r[s].get(V + "currentOwner", []) if isinstance(o, IRI)), -1)
            self.copy_ix[s] = len(self.copies)
            self.copies.append({"id": number(s, "book"), "imprint": imp, "call": text(r[s].get(V + "callNumber", [])),
                                "owner": cur})
        media = []
        self.footprints = []
        for s in by["footprint"]:
            c = next((self.copy_ix[str(o)] for o in r[s].get(V + "copy", []) if str(o) in self.copy_ix), -1)
            if c < 0:
                self.stats["footprints without a copy (left out)"] += 1
                continue
            years = next((edtf_years(o.value) for o in r[s].get(V + "associatedDate", []) if edtf_years(o.value)), None)
            place = next((self.place_ix[str(o)] for o in r[s].get(V + "place", []) if str(o) in self.place_ix), -1)
            medium = text(r[s].get(V + "medium", []))
            if medium not in media:
                media.append(medium)
            flags = (1 if any(isinstance(o, Literal) and o.value == "true" for o in r[s].get(V + "verified", [])) else 0) \
                | (2 if r[s].get("http://xmlns.com/foaf/0.1/depiction") else 0)
            self.footprints.append({"id": number(s, "footprint"), "copy": c, "place": place, "years": years,
                                    "date": text(r[s].get(DCT + "date", [])), "medium": media.index(medium),
                                    "flags": flags, "actors": actors(s)})
            self.stats["footprints"] += 1
            if years and place >= 0:
                self.stats["footprints with a time and a place"] += 1
            elif place >= 0:
                self.stats["footprints with a place but no time"] += 1
            elif years:
                self.stats["footprints with a time but no place"] += 1
        self.roles, self.media = roles, media
        self.stats.update({"places": len(self.places), "persons": len(self.persons), "works": len(self.works),
                           "copies": len(self.copies)})

    def _resolve(self):
        """Entity page number -> the footprints record it holds (the first by KINDS, then id), for ?iri= of an entity
        page (platform decision 0007)."""
        best = {}
        for s, p, o in self.store.triples("ep", "ep.ttl"):
            if p != JL + "sameAs" or not isinstance(o, IRI) or not o.startswith(FP) or not s.startswith(EP):
                continue
            m = re.match(re.escape(FP) + r"([a-z]+)/(\d+)$", o)
            if not m or m.group(1) not in KINDS:
                continue
            n = s[len(EP):]
            if not n.isdigit():
                continue
            rank = (KINDS.index(m.group(1)), int(m.group(2)))
            if n not in best or rank < best[n][0]:
                best[n] = (rank, f"{m.group(1)}/{m.group(2)}")
        self.stats["entity pages with footprints records"] = len(best)
        return {n: v[1] for n, v in sorted(best.items(), key=lambda x: int(x[0]))}
