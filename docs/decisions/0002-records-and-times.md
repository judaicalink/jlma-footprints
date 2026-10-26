# 0002 What is on the map: imprints and footprints, each at its place and in its time

Status: accepted · Date: 2026-10-26

## Decision

- **Printed:** an imprint (edition) at its place of printing (`vocab:place`) in its year (`vocab:publicationDate`).
- **Footprints:** a footprint at its place in its time (`vocab:associatedDate`). Both dates are EDTF in the data
  (judaicalink-data decision 0035); the map reads them as a first and a last year: an uncertain or approximate date
  is its year ("1924~"), a decade its ten years ("186x"), a period its years ("1900?~/1961?~"), an open end the known
  year ("1948~/unknown", "../1862"). A record is in the time window when its years meet it. The timeline counts a
  period once, spread over its decades.
- Records without a place or a date are not on the map; they are listed with their copy, work or person.
- **Places** are the place records of Footprints with their coordinates (Footprints copies them from GeoNames); the
  place pages of JudaicaLink are not used, so the map shows Footprints as it is. Areas are present-day countries.
- **Persons** are the persons of Footprints in their roles (author, printer, owner, seller, …; the role properties of
  footprints). Footprints has several records for some persons; they are shown as they are, and the platform's view of
  each record leads to the entity page that joins them.
- The evidence of a footprint (`vocab:medium`: owner signature, library catalogue, …) can be chosen as a filter.
