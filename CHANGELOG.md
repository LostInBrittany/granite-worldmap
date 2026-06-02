# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-06-02

### Added

- **Per-marker hover tooltip** via a new optional `title` field on a location,
  decoupled from the popup content (falls back to `name` when absent).
- **Multi-entry popups**: a location may carry an `entries` array
  (`{ label, meta, url? }`) rendered as a list, with a `title`/`name` header —
  ideal for aggregating several events at one city. All interpolated strings are
  HTML-escaped.
- **`intensity` field (1–5)** that scales a marker's opacity from the floor
  (`--granite-worldmap-marker-opacity`) up to the ceiling
  (`--granite-worldmap-marker-intensity-max-opacity`), so a busy location reads
  bolder with a single marker. Out-of-range values are clamped.
- New CSS custom properties: `--granite-worldmap-marker-intensity-max-opacity`
  (default `1`) and `--granite-worldmap-popup-meta-color` (default `#888`).

### Notes

- Fully backward-compatible: existing `{ lat, lng, name?, url? }` data behaves
  exactly as before (same tooltip, single-line popup, and opacity).

## [1.1.0] - 2026-06-02

### Added

- Translucent markers (`--granite-worldmap-marker-opacity`, default `0.7`) so
  that markers stacked on the same location accumulate and render darker/bolder,
  giving a quick visual density cue.

## [1.0.0] - 2026-06-02

### Added

- Initial release: a Lit web component rendering an interactive
  Leaflet + OpenStreetMap world map with a marker for each entry of its
  `locations` property (`{ lat, lng, name?, url? }`).
- Google-Maps-style SVG pin markers via `L.divIcon`, themeable through CSS
  custom properties, avoiding the broken default-image-marker issue.
- Leaflet stylesheet injected into the shadow root (configurable via
  `leaflet-css-url`) so the map renders correctly inside the component.
- `granite-worldmap-marker-click` event, marker popups, and fit-to-markers
  viewport.

[1.2.0]: https://github.com/LostInBrittany/granite-worldmap/releases/tag/v1.2.0
[1.1.0]: https://github.com/LostInBrittany/granite-worldmap/releases/tag/v1.1.0
[1.0.0]: https://github.com/LostInBrittany/granite-worldmap/releases/tag/v1.0.0
