# 0004 Links

Status: accepted · Date: 2026-10-26

## Decision

- Every record links to its view on the platform (`/data/footprints/<kind>/<id>`, platform decision 0002), which
  shows the entity page it belongs to and so the records of the same person, place or work from other sources.
- Works and footprints link to their page on the Footprints site (`https://footprints.ctl.columbia.edu/writtenwork/<id>/`,
  `…/footprint/<id>/`; checked 2026-10-26: imprints, copies, persons and places have no page there).
- `/footprints/?iri=<IRI>` opens the map at a Footprints record (a footprint opens its copy with the footprint marked)
  or at an entity page that holds one (`data/resolve.json`: entity page number → its first Footprints record, by
  kind: work, imprint, copy, footprint, person, place). This is the `resolve` of the registry entry (platform
  decision 0007), with `datasets = ["footprints"]`.
