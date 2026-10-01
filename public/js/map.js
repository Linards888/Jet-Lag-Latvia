import { html, useEffect, useRef } from '/vendor/preact.js';

/*  Generic Leaflet wrapper.
    items: [{k:'marker'|'circle'|'line', ...}]   munis: GeoJSON (administrative units)   muniColor(props) -> colour
    Layers are rebuilt only when their content actually changes, so popups stay open while live data refreshes. */
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#888';
const themeKey = () => document.documentElement.getAttribute('data-theme') || 'sakura';

export function LMap({ items = [], munis, muniColor, onMuniClick, onMapClick, fitKey, fitTo, cls = '' }) {
  const el = useRef(), S = useRef({}), cb = useRef({});
  cb.current = { onMuniClick, onMapClick, muniColor };

  useEffect(() => {
    const map = L.map(el.current, { zoomControl: true, worldCopyJump: false }).setView([56.88, 24.9], 7);
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

  // fit view when fitKey changes
  useEffect(() => {
    const s = S.current;
    if (!s.map || s.fitted === fitKey) return;
    s.fitted = fitKey;
    s.refit = () => { if (fitTo && fitTo.length) s.map.fitBounds(fitTo, { padding: [30, 30], maxZoom: 13 }); else s.map.fitBounds([[55.65, 20.9], [58.05, 28.3]]); };
    s.refit();
  }, [fitKey]);

  return html`<div class="map ${cls}" ref=${el}></div>`;
}
