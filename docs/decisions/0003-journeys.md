# 0003 The journey of a copy

Status: accepted · Date: 2026-10-26

## Decision

- The stations of a copy are the printing of its imprint, then its footprints in the order of their first year (then
  their last year, then their id); footprints without a date come last and are not part of the way.
- A step is two consecutive stations with a date at different places (the printing counts also without a year). Its
  time is the time of the later station: the copy had arrived by then. A step is in the selection when its time meets
  the time window and one of its two places is in the area (and, with an evidence filter, its later footprint has that
  evidence).
- The map draws the steps of all copies as one line per pair of places and direction, thicker and stronger the more
  steps it stands for; with many lines a single step is faint. The curve bends to the right of the way, so the two
  directions between two places are apart.
- A selected copy shows its way with numbered stations and arrows; a selected imprint or work the ways of all its
  copies.

## Consequences

The order of the stations is the order of the dates: where Footprints dates two footprints only roughly, the order
can be wrong; the stations list shows the dates as Footprints gives them.
