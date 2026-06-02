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
 */
const PIN_SVG = `
  <svg class="granite-worldmap-marker" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path class="granite-worldmap-pin" d="M12 0C5.373 0 0 5.373 0 12c0 8.4 12 24 12 24s12-15.6 12-24C24 5.373 18.627 0 12 0z"/>
    <circle class="granite-worldmap-pin-hole" cx="12" cy="12" r="4.5"/>
  </svg>
`;

/**
 * `<granite-worldmap>` renders an interactive Leaflet world map with a marker
 * for every entry of its `locations` property.
 *
 * Each location is an object: `{ lat, lng, name?, url? }`. Only `lat` and `lng`
 * are required; `name` is shown in a popup and `url` (when present) is exposed
 * in the popup as a link.
 *
 * Clicking a marker dispatches a `granite-worldmap-marker-click` CustomEvent
 * whose `detail` is the matching location object.
 *
 * @fires granite-worldmap-marker-click - when a marker is clicked; detail = location
 *
 * @cssprop --granite-worldmap-height - Map height (default 400px)
 * @cssprop --granite-worldmap-bg - Background behind the tiles (default #aad3df)
 * @cssprop --granite-worldmap-border-radius - Map border radius (default 0)
 * @cssprop --granite-worldmap-marker-color - Marker dot fill (default #e4002b)
 * @cssprop --granite-worldmap-marker-border-color - Marker dot border (default #fff)
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
       The default opacity is below 1 on purpose: markers stacked on the same
       location accumulate and render darker/bolder the more there are. */
    .granite-worldmap-marker {
      display: block;
      width: 100%;
      height: 100%;
      cursor: pointer;
      opacity: var(--granite-worldmap-marker-opacity, 0.7);
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

      const icon = L.divIcon({
        className: 'granite-worldmap-icon',
        html: PIN_SVG,
        iconSize: [MARKER_WIDTH, MARKER_HEIGHT],
        // Anchor at the bottom tip of the pin so it points at the coordinate.
        iconAnchor: [MARKER_WIDTH / 2, MARKER_HEIGHT],
        popupAnchor: [0, -MARKER_HEIGHT + 4],
      });

      const marker = L.marker([lat, lng], {
        icon,
        title: location.name || '',
        keyboard: true,
      });

      if (location.name) {
        marker.bindPopup(this._popupHtml(location));
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

  _popupHtml(location) {
    const name = this._escape(location.name);
    if (location.url) {
      const url = this._escape(location.url);
      return `<a href="${url}">${name}</a>`;
    }
    return name;
  }

  _escape(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
