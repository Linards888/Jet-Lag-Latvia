import { html, useEffect, useRef, useState } from '/vendor/preact.js';
import { Ico } from './ui.js';
import { t } from './i18n.js';

/*  Generic Leaflet wrapper.
    items: [{k:'marker'|'circle'|'line', ...}]   munis: GeoJSON (administrative units)   muniColor(props) -> colour
    Layers are rebuilt only when their content actually changes, so popups stay open while live data refreshes. */
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
const LV_BOUNDS = [[55.1, 20.2], [58.8, 29.0]];  // the map cannot be dragged away from Latvia
const themeKey = () => document.documentElement.getAttribute('data-theme') || 'sakura';

export function LMap({ items = [], munis, muniColor, onMuniClick, onMapClick, fitKey, fitTo, overlay, panel, cls = '' }) {
  const el = useRef(), wrap = useRef(), S = useRef({}), cb = useRef({});
  const [full, setFull] = useState(false);
  cb.current = { onMuniClick, onMapClick, muniColor };

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: true, worldCopyJump: false, minZoom: 5.5, zoomSnap: 0.25, maxBounds: LV_BOUNDS, maxBoundsViscosity: 1 }).setView([56.88, 24.9], 7);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    S.current = { map, group: L.layerGroup().addTo(map), muni: null, fitted: null, muniKey: null, itemKey: null };
    map.on('click', (e) => cb.current.onMapClick && cb.current.onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const settle = () => { map.invalidateSize(); if (S.current.refit) S.current.refit(); };
    let last = 0;
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { const w = el.current ? el.current.clientWidth : 0; if (w && Math.abs(w - last) > 1) { last = w; settle(); } }) : null;
    if (ro) ro.observe(el.current);
    const t1 = setTimeout(settle, 150);
    return () => { clearTimeout(t1); if (ro) ro.disconnect(); map.remove(); };
  }, []);

  // municipalities (territory colouring)
  const muniKey = munis ? themeKey() + JSON.stringify(munis.features.map((f) => (muniColor ? muniColor(f.properties) : '')))  : '';
  useEffect(() => {
    const s = S.current;
    if (!s.map || !munis || s.muniKey === muniKey) return;
    s.muniKey = muniKey;
    if (s.muni) s.map.removeLayer(s.muni);
    s.muni = L.geoJSON(munis, {
      style: (f) => {
        const c = cb.current.muniColor ? cb.current.muniColor(f.properties) : null;
        return c ? { color: css('--text'), weight: 1, opacity: 0.35, fillColor: c, fillOpacity: 0.45 } : { color: css('--accent'), weight: 1, opacity: 0.5, fillColor: css('--accent'), fillOpacity: 0.1 };
      },
      onEachFeature: (f, layer) => {
        layer.bindTooltip(Object.assign(document.createElement('span'), { textContent: f.properties.name }), { sticky: true, className: 'lbl' });
        layer.on('click', (e) => { if (cb.current.onMuniClick) { L.DomEvent.stopPropagation(e); cb.current.onMuniClick(f.properties); } });
      },
    }).addTo(s.map);
    s.muni.bringToBack();
  }, [muniKey]);

  // markers / circles / lines
  const itemKey = JSON.stringify(items);
  useEffect(() => {
    const s = S.current;
    if (!s.map || s.itemKey === itemKey) return;
    s.itemKey = itemKey;
    s.group.clearLayers();
    for (const it of items) {
      let layer;
      if (it.k === 'circle') layer = L.circle([it.lat, it.lng], { radius: it.r, color: it.color || '#fff', weight: it.weight || 2, fillOpacity: it.fill ?? 0.12, dashArray: it.dash ? '6 6' : null, interactive: !!it.popup });
      else if (it.k === 'line') layer = L.polyline(it.pts, { color: it.color || '#fff', weight: it.weight || 3, dashArray: it.dash ? '6 6' : null, opacity: 0.9 });
      else {
        const icon = it.shape === 'dot'
          ? L.divIcon({ className: '', html: `<div class="cdot ${it.dim ? 'off' : ''}" style="background:${it.color}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
          : L.divIcon({ className: '', html: `<div class="pin" style="background:${it.color}"><span>${String(it.text || '').replace(/[<>&"']/g, '')}</span></div>`, iconSize: [26, 26], iconAnchor: [4, 26] });
        layer = L.marker([it.lat, it.lng], { icon, zIndexOffset: it.z || 0 });
        if (it.label) layer.bindTooltip(Object.assign(document.createElement('span'), { textContent: it.label }), { permanent: !!it.perm, direction: 'top', offset: [it.shape === 'dot' ? 0 : 9, it.shape === 'dot' ? -8 : -22], className: 'lbl' });
      }
      if (it.popup) layer.bindPopup(it.popup);
      if (it.onClick) layer.on('click', () => it.onClick());
      layer.addTo(s.group);
    }
  }, [itemKey]);

  // optional raster overlay (used for the seekers' "where can the hider be" picture)
  const ovKey = overlay ? overlay.key : '';
  useEffect(() => {
    const s = S.current;
    if (!s.map) return;
    if (s.overlay) { s.map.removeLayer(s.overlay); s.overlay = null; }
    if (overlay) { s.overlay = L.imageOverlay(overlay.url, overlay.bounds, { opacity: overlay.opacity ?? 1, interactive: false }).addTo(s.map); if (s.muni) s.muni.bringToBack(); }
  }, [ovKey]);

  // fullscreen: a fixed overlay everywhere, the real Fullscreen API (and a landscape lock) where the browser allows it
  const toggleFull = () => {
    const on = !full;
    setFull(on);
    try {
      if (on) {
        const r = wrap.current.requestFullscreen ? wrap.current.requestFullscreen() : null;
        if (r && r.then) r.then(() => screen.orientation.lock('landscape')).catch(() => {});
      } else {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        screen.orientation.unlock();
      }
    } catch {}
  };
  useEffect(() => {
    const out = () => { if (!document.fullscreenElement) setFull(false); };
    const esc = (e) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', out); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('fullscreenchange', out); window.removeEventListener('keydown', esc); };
  }, []);
  useEffect(() => {
    if (full) document.body.style.overflow = 'hidden';
    const id = setTimeout(() => { const s = S.current; if (s.map) s.map.invalidateSize(); }, 150);
    return () => {
      clearTimeout(id);
      if (full) { document.body.style.overflow = ''; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    };
  }, [full]);

  // fit view when fitKey changes
  useEffect(() => {
    const s = S.current;
    if (!s.map || s.fitted === fitKey) return;
    s.fitted = fitKey;
    s.refit = () => { if (fitTo && fitTo.length) s.map.fitBounds(fitTo, { padding: [30, 30], maxZoom: 13 }); else s.map.fitBounds([[55.65, 20.9], [58.05, 28.3]]); };
    s.refit();
  }, [fitKey]);

  return html`<div class="mapwrap ${full ? 'full' : ''}" ref=${wrap}><div class="map ${cls}" ref=${el}></div>
    <button class="map-full" aria-label=${t(full ? 'map.exit_fullscreen' : 'map.fullscreen')} title=${t(full ? 'map.exit_fullscreen' : 'map.fullscreen')} onClick=${toggleFull}><${Ico} n=${full ? 'shrink' : 'expand'} size=${18} /></button>
    ${panel && html`<div class="map-panel">${panel}</div>`}</div>`;
}
