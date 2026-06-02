# granite-worldmap

A [Lit](https://lit.dev) web component that renders an interactive world map
(Leaflet + OpenStreetMap) with a marker for every location in its `locations`
property — in the spirit of the speaker maps shown on [Noti.st](https://noti.st)
profiles, but with no API key and no billing account required.

![granite-worldmap rendering an interactive world map with Google-Maps-style pin markers on several cities](assets/screenshot.jpg)

## Install

Published on npm as [`@granite-elements/granite-worldmap`](https://www.npmjs.com/package/@granite-elements/granite-worldmap):

```bash
npm install @granite-elements/granite-worldmap
```

## Usage

```html
<script type="module">
  import '@granite-elements/granite-worldmap/granite-worldmap.js';
</script>

<granite-worldmap id="map"></granite-worldmap>

<script type="module">
  document.querySelector('#map').locations = [
    { name: 'Paris', lat: 48.8566, lng: 2.3522, url: '/talks/paris' },
    { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
    { name: 'Boston', lat: 42.3601, lng: -71.0589 },
  ];
</script>
```

`locations` is an array of objects. Only `lat` and `lng` are required; every
other field is optional and backward-compatible:

| Field       | Type   | Required | Description                                                                 |
| ----------- | ------ | -------- | --------------------------------------------------------------------------- |
| `lat`       | Number | yes      | Latitude                                                                    |
| `lng`       | Number | yes      | Longitude                                                                   |
| `name`      | String | no       | Single-line popup text; also the hover tooltip if `title` is absent         |
| `url`       | String | no       | When present, makes `name` a link inside the popup                          |
| `title`     | String | no       | Hover tooltip text (e.g. `"City, Country"`); falls back to `name`           |
| `entries`   | Array  | no       | Rows rendered as a list in the popup — see below                            |
| `intensity` | Number | no       | `1` (default) … `5`, clamped; scales marker density/opacity                 |

> Coordinates are required because Leaflet positions markers by lat/lng. If you
> only have place names, geocode them first (e.g. via OpenStreetMap's Nominatim)
> and feed the resulting coordinates in.

### Aggregating several events at one location

When a city hosts several events, give the marker a `title` (shown on hover), an
`entries` list (shown in the popup on click), and an `intensity` (the more events,
the bolder the marker):

```js
{
  lat: 41.3874,
  lng: 2.1686,
  title: 'Barcelona, Spain',     // hover tooltip
  intensity: 3,                   // 3 events → denser marker (clamped 1–5)
  entries: [                      // popup list, newest first
    { label: 'DevBCN',  meta: '2025', url: '/talks/2025/devbcn/' },
    { label: 'DevBCN',  meta: '2024', url: '/talks/2024/devbcn/' },
    { label: 'BCN JUG', meta: '2024', url: '/talks/2024/bcn-jug/' },
  ],
}
```

Each `entries` row is `{ label, meta, url? }`: `label` is the event name (linked
by `url` when present) and `meta` is muted secondary text such as the year. The
popup shows `title` (or `name`) as a header above the list. All interpolated
strings are HTML-escaped.

## Properties / attributes

| Property         | Attribute          | Type    | Default                          | Description                                          |
| ---------------- | ------------------ | ------- | -------------------------------- | ---------------------------------------------------- |
| `locations`      | —                  | Array   | `[]`                             | Locations to mark                                    |
| `zoom`           | `zoom`             | Number  | `2`                              | Initial zoom (overridden by `fitMarkers`)            |
| `center`         | —                  | Array   | `[20, 0]`                        | Initial `[lat, lng]` center                          |
| `tileUrl`        | `tile-url`         | String  | OpenStreetMap tiles              | Tile layer URL template                              |
| `attribution`    | `attribution`      | String  | OpenStreetMap attribution        | Tile attribution HTML                                |
| `fitMarkers`     | `fit-markers`      | Boolean | `true`                           | Fit the viewport to the markers' bounds              |
| `leafletCssUrl`  | `leaflet-css-url`  | String  | unpkg Leaflet CSS                | Stylesheet injected into the shadow root (see below) |

## Events

`granite-worldmap-marker-click` — fired when a marker is clicked. `event.detail`
is the matching location object.

```js
map.addEventListener('granite-worldmap-marker-click', e => {
  console.log(e.detail.name);
});
```

## Styling

The component is themeable through CSS custom properties:

| Custom property                                 | Default   | Description                              |
| ----------------------------------------------- | --------- | ---------------------------------------- |
| `--granite-worldmap-height`                     | `400px`   | Map height                               |
| `--granite-worldmap-bg`                         | `#aad3df` | Background behind tiles                  |
| `--granite-worldmap-border-radius`              | `0`       | Map border radius                        |
| `--granite-worldmap-marker-color`               | `#ea4335` | Pin fill                                 |
| `--granite-worldmap-marker-border-color`        | `#b31412` | Pin outline                              |
| `--granite-worldmap-marker-hole-color`          | `#7a0e08` | Pin center hole                          |
| `--granite-worldmap-marker-opacity`             | `0.7`     | Pin opacity at `intensity` 1 (the floor) |
| `--granite-worldmap-marker-intensity-max-opacity` | `1`     | Pin opacity at `intensity` 5 (the ceiling) |
| `--granite-worldmap-popup-meta-color`           | `#888`    | Popup meta/year text color               |

### Marker density

Each location's `intensity` (1–5) scales the marker's opacity from the floor
(`--granite-worldmap-marker-opacity`, `0.7`, used at intensity 1) up to the
ceiling (`--granite-worldmap-marker-intensity-max-opacity`, `1`, used at
intensity 5):

```
opacity = floor + (ceiling - floor) * (clamp(intensity, 1, 5) - 1) / 4
// floor 0.7, ceiling 1 → 1:0.70  2:0.775  3:0.85  4:0.925  5:1.0
```

So a city with many events reads bolder than a one-off location, with a single
marker per city. Lower the floor (or raise nothing) for stronger contrast.

Markers are also slightly translucent by default, so if you instead render
multiple markers at the same coordinate they still accumulate and darken where
they overlap. Set the opacity to `1` to disable both effects.

## A note on Leaflet + Shadow DOM

Two things make Leaflet behave inside a web component's shadow root, and this
component handles both for you:

1. **Stylesheet injection.** Leaflet's CSS, normally added to `<head>`, does not
   cross the shadow boundary. The component injects a `<link>` to the Leaflet
   stylesheet inside its shadow root (configurable via `leaflet-css-url`).
2. **SVG pin markers.** Instead of Leaflet's default image-based markers (whose
   image paths frequently break under bundlers and shadow DOM), markers are
   rendered as Google-Maps-style `L.divIcon` SVG pins styled with the CSS custom
   properties above.

## Development

```bash
npm install
npm start        # serves the demo at /demo/ with live reload
npm test         # web-test-runner
```

## License

MIT
