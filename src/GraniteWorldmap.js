import { html, css, LitElement } from 'lit';
import * as L from 'leaflet/dist/leaflet-src.esm.js';

/**
 * URL of the Leaflet stylesheet. It is injected into the shadow root because
 * styles added to `<head>` do not cross the shadow boundary, so without this
 * the map tiles, controls and popups would be laid out incorrectly.
 */
const DEFAULT_LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

/** Rendered size, in pixels, of the Google-Maps-style pin marker. */
const MARKER_WIDTH = 26;
const MARKER_HEIGHT = 39;

/**
 * SVG of a Google-Maps-style teardrop pin. The shape is anchored at its bottom
 * tip and its colors are driven by CSS custom properties (see `static styles`),
 * so it stays themeable from outside the shadow root.
 *
 * `intensityFactor` is the normalized density (0 at intensity 1 … 1 at intensity
 * 5); it is passed as an internal CSS variable that scales the pin opacity.
 *
 * @param {number} intensityFactor - 0..1 density factor (numeric, injection-safe)
 */
const pinSvg = intensityFactor => `
  <svg class="granite-worldmap-marker" style="--_granite-worldmap-intensity:${intensityFactor}" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path class="granite-worldmap-pin" d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 24 12 24s12-15.6 12-24C24 5.373 18.627 0 12 0z"/>
    <circle class="granite-worldmap-pin-hole" cx="12" cy="12" r="4.5"/>
  </svg>
`;

/** HTML-escape a value coming from user data before interpolating it. */
const escapeHtml = value =>
  String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Clamp `intensity` to an integer in 1..5; non-numeric values default to 1. */
const clampIntensity = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
};

/**
 * Build the popup HTML for a location. With a non-empty `entries` array it
 * renders a header (`title`/`name`) plus a list of linked rows; otherwise it
 * falls back to the single-line `name` (optionally linked by `url`). Every
 * interpolated string is HTML-escaped.
 *
 * When the list is longer than `maxEntries` rows it is capped to roughly that
 * many rows and becomes scrollable (the header stays pinned above it). Pass
 * `0` to never cap it.
 *
 * @param {object} location - the location object
 * @param {number} maxEntries - row threshold above which the list scrolls
 */
const popupHtml = (location, maxEntries) => {
  const entries = Array.isArray(location.entries) ? location.entries : [];

  if (entries.length) {
    const header = location.title || location.name;
    const headerHtml = header
      ? `<div class="granite-worldmap-popup-header">${escapeHtml(header)}</div>`
      : '';
    const items = entries
      .map(entry => {
        const label = escapeHtml(entry.label);
        const labelHtml = entry.url
          ? `<a href="${escapeHtml(entry.url)}">${label}</a>`
          : label;
        const metaHtml =
          entry.meta == null || entry.meta === ''
            ? ''
            : `<span class="granite-worldmap-popup-meta">${escapeHtml(
                entry.meta,
              )}</span>`;
        return `<li>${labelHtml}${metaHtml}</li>`;
      })
      .join('');
    // Beyond the threshold, cap the list to ~maxEntries rows and let it scroll.
    const scrollable = maxEntries > 0 && entries.length > maxEntries;
    const listClass = scrollable
      ? 'granite-worldmap-popup-list granite-worldmap-popup-list--scroll'
      : 'granite-worldmap-popup-list';
    const listStyle = scrollable
      ? ` style="--_granite-worldmap-popup-rows:${maxEntries}"`
      : '';
    return `${headerHtml}<ul class="${listClass}"${listStyle}>${items}</ul>`;
  }

  // Single-line fallback (unchanged): `name`, optionally linked by `url`.
  const name = escapeHtml(location.name);
  if (location.url) {
    return `<a href="${escapeHtml(location.url)}">${name}</a>`;
  }
  return name;
};

/**
 * `<granite-worldmap>` renders an interactive Leaflet world map with a marker
 * for every entry of its `locations` property.
 *
 * Each location is an object. Only `lat` and `lng` are required; every other
 * field is optional and backward-compatible:
 *
 * ```js
 * {
 *   lat: Number,        // required
 *   lng: Number,        // required
 *   name: String,       // single-line popup text, linked by `url` when present
 *   url: String,        // makes `name` a link in the popup
 *   title: String,      // hover tooltip; falls back to `name`
 *   entries: [          // popup list, one row per event at this location
 *     { label: String, meta: String, url?: String }
 *   ],
 *   intensity: Number,  // 1 (default) … 5, clamped; scales marker density
 * }
 * ```
 *
 * Clicking a marker dispatches a `granite-worldmap-marker-click` CustomEvent
 * whose `detail` is the matching location object.
 *
 * @fires granite-worldmap-marker-click - when a marker is clicked; detail = location
 *
 * @cssprop --granite-worldmap-height - Map height (default 400px)
 * @cssprop --granite-worldmap-bg - Background behind the tiles (default #aad3df)
 * @cssprop --granite-worldmap-border-radius - Map border radius (default 0)
 * @cssprop --granite-worldmap-marker-color - Pin fill (default #ea4335)
 * @cssprop --granite-worldmap-marker-border-color - Pin outline (default #b31412)
 * @cssprop --granite-worldmap-marker-hole-color - Pin center hole (default #7a0e08)
 * @cssprop --granite-worldmap-marker-opacity - Pin opacity at intensity 1 (default 0.7)
 * @cssprop --granite-worldmap-marker-intensity-max-opacity - Pin opacity at intensity 5 (default 1)
 * @cssprop --granite-worldmap-popup-meta-color - Popup meta/year text color (default #888)
 * @cssprop --granite-worldmap-popup-row-height - Per-row height used to size the scrollable list (default 1.6em)
 * @cssprop --granite-worldmap-popup-scrollbar-color - Scrollbar thumb color of a scrollable popup list (default rgba(0,0,0,0.35))
 */
export class GraniteWorldmap extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: var(--granite-worldmap-height, 400px);
    }

    #map {
      width: 100%;
      height: 100%;
      background: var(--granite-worldmap-bg, #aad3df);
      border-radius: var(--granite-worldmap-border-radius, 0);
    }

    /* Reset Leaflet's default div-icon chrome. */
    .granite-worldmap-icon {
      background: transparent;
      border: none;
    }

    /* The pin, rendered through L.divIcon and themeable via CSS vars.
       Opacity interpolates from the floor (--granite-worldmap-marker-opacity,
       used at intensity 1) up to the ceiling
       (--granite-worldmap-marker-intensity-max-opacity, used at intensity 5),
       driven by the per-marker density factor --_granite-worldmap-intensity
       (0..1) set inline in the pin SVG. At intensity 1 the factor is 0, so the
       opacity equals the floor — identical to pre-intensity behavior. */
    .granite-worldmap-marker {
      display: block;
      width: 100%;
      height: 100%;
      cursor: pointer;
      --_granite-worldmap-intensity: 0;
      opacity: calc(
        var(--granite-worldmap-marker-opacity, 0.7) +
          (
            var(--granite-worldmap-marker-intensity-max-opacity, 1) - var(
                --granite-worldmap-marker-opacity,
                0.7
              )
          ) *
          var(--_granite-worldmap-intensity)
      );
      transform-origin: bottom center;
      transition: transform 0.1s ease-out;
      filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.35));
      overflow: visible;
    }

    .granite-worldmap-marker:hover {
      transform: scale(1.15);
    }

    .granite-worldmap-pin {
      fill: var(--granite-worldmap-marker-color, #ea4335);
      stroke: var(--granite-worldmap-marker-border-color, #b31412);
      stroke-width: 0.5;
    }

    .granite-worldmap-pin-hole {
      fill: var(--granite-worldmap-marker-hole-color, #7a0e08);
    }

    /* Multi-entry popup list (rendered when a location has entries). */
    .granite-worldmap-popup-header {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .granite-worldmap-popup-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    /* Long lists are capped to ~--_granite-worldmap-popup-rows rows (set inline
       from the popup-max-entries property) and scroll, keeping the header
       pinned above. --granite-worldmap-popup-row-height is the per-row estimate
       used to derive that height. */
    .granite-worldmap-popup-list--scroll {
      max-height: calc(
        var(--_granite-worldmap-popup-rows, 10) *
          var(--granite-worldmap-popup-row-height, 1.6em)
      );
      overflow-y: scroll;
      /* Keep the scrollbar clear of the row text. */
      padding-right: 4px;
    }

    /* WebKit/Blink: force a persistent classic scrollbar. Without this, macOS
       overlay scrollbars stay hidden until you scroll, so a long list looks
       complete. The standard scrollbar-width/scrollbar-color properties are
       deliberately NOT set here: Chrome would honor them and then ignore these
       ::-webkit-scrollbar rules, reverting to a hidden overlay bar. They are
       applied for Firefox instead, in the @supports block below. */
    .granite-worldmap-popup-list--scroll::-webkit-scrollbar {
      width: 8px;
    }

    .granite-worldmap-popup-list--scroll::-webkit-scrollbar-thumb {
      background: var(
        --granite-worldmap-popup-scrollbar-color,
        rgba(0, 0, 0, 0.35)
      );
      border-radius: 4px;
    }

    /* Firefox (no ::-webkit-scrollbar support): a thin, always-present bar. */
    @supports not selector(::-webkit-scrollbar) {
      .granite-worldmap-popup-list--scroll {
        scrollbar-width: thin;
        scrollbar-color: var(
            --granite-worldmap-popup-scrollbar-color,
            rgba(0, 0, 0, 0.35)
          )
          transparent;
      }
    }

    .granite-worldmap-popup-list li + li {
      margin-top: 2px;
    }

    .granite-worldmap-popup-meta {
      margin-left: 0.4em;
      color: var(--granite-worldmap-popup-meta-color, #888);
    }
  `;

  static properties = {
    /** Array of `{ lat, lng, name?, url? }` locations to mark on the map. */
    locations: { type: Array },
    /** Initial zoom level (ignored once markers are fitted, see `fitMarkers`). */
    zoom: { type: Number },
    /** Initial `[lat, lng]` center. */
    center: { type: Array },
    /** Tile layer URL template. */
    tileUrl: { type: String, attribute: 'tile-url' },
    /** Tile layer attribution HTML. */
    attribution: { type: String },
    /** URL of the Leaflet stylesheet injected into the shadow root. */
    leafletCssUrl: { type: String, attribute: 'leaflet-css-url' },
    /** When true, the viewport is fitted to the markers' bounding box. */
    fitMarkers: { type: Boolean, attribute: 'fit-markers' },
    /** Row count above which a popup's `entries` list scrolls (0 disables). */
    popupMaxEntries: { type: Number, attribute: 'popup-max-entries' },
  };

  constructor() {
    super();
    this.locations = [];
    this.zoom = 2;
    this.center = [20, 0];
    this.tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.attribution =
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    this.leafletCssUrl = DEFAULT_LEAFLET_CSS;
    this.fitMarkers = true;
    this.popupMaxEntries = 10;
    this._map = null;
    this._markerLayer = null;
  }

  render() {
    return html`
      <link rel="stylesheet" href=${this.leafletCssUrl} />
      <div id="map"></div>
    `;
  }

  firstUpdated() {
    const container = this.renderRoot.querySelector('#map');
    this._map = L.map(container, {
      center: this.center,
      zoom: this.zoom,
      worldCopyJump: true,
    });
    L.tileLayer(this.tileUrl, { attribution: this.attribution }).addTo(
      this._map,
    );
    this._markerLayer = L.layerGroup().addTo(this._map);
    this._renderMarkers();
    // Leaflet measures its container on init; inside a shadow root the layout
    // may not be settled yet, so recompute the size on the next frame.
    requestAnimationFrame(() => this._map && this._map.invalidateSize());
  }

  updated(changed) {
    if (changed.has('locations') && this._map) {
      this._renderMarkers();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._map) {
      this._map.remove();
      this._map = null;
      this._markerLayer = null;
    }
  }

  _renderMarkers() {
    if (!this._markerLayer) return;
    this._markerLayer.clearLayers();

    const bounds = [];
    (this.locations || []).forEach(location => {
      const lat = Number(location.lat);
      const lng = Number(location.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      // intensity 1..5 → density factor 0..1 (intensity 1 keeps current opacity).
      const intensityFactor = (clampIntensity(location.intensity) - 1) / 4;

      const icon = L.divIcon({
        className: 'granite-worldmap-icon',
        html: pinSvg(intensityFactor),
        iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
        // Anchor at the bottom tip of the pin so it points at the coordinate.
        iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT],
        popupAnchor: [0, -MARKER_HEIGHT + 4],
      });

      const marker = L.marker([lat, lng], {
        icon,
        // Hover tooltip is decoupled from the popup: prefer `title`, fall
        // back to `name`.
        title: location.title ?? location.name ?? '',
        keyboard: true,
      });

      const hasEntries =
        Array.isArray(location.entries) && location.entries.length > 0;
      if (hasEntries || location.name) {
        marker.bindPopup(popupHtml(location, this.popupMaxEntries));
      }

      marker.on('click', () => {
        this.dispatchEvent(
          new CustomEvent('granite-worldmap-marker-click', {
            detail: location,
            bubbles: true,
            composed: true,
          }),
        );
      });

      marker.addTo(this._markerLayer);
      bounds.push([lat, lng]);
    });

    if (this.fitMarkers && bounds.length) {
      this._map.fitBounds(bounds, { padding: [30, 30], maxZoom: 6 });
    }
  }
}
