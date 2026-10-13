// Runs before first paint (classic script in <head>): applies the saved look without a flash. Mirrors theme.js applyPrefs.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('jll.prefs') || '{}'), r = document.documentElement, s = r.style;
    r.setAttribute('data-theme', p.theme || 'sakura');
    ['density:cozy', 'pattern:theme', 'cards:theme', 'buttons:theme', 'motion:full', 'map:theme'].forEach(function (x) {
      var k = x.split(':'); if (p[k[0]] && p[k[0]] !== k[1]) r.setAttribute('data-' + k[0], p[k[0]]);
    });
    if (p.radius != null) s.setProperty('--rs', String(p.radius / 100));
    if (p.text != null) s.setProperty('--ts', String(p.text / 100));
    if (/^#[0-9a-f]{6}$/i.test(p.accent || '')) {
      s.setProperty('--accent', p.accent);
      s.setProperty('--accent-deep', 'color-mix(in srgb, ' + p.accent + ' 70%, #000)');
      s.setProperty('--accent-soft', 'color-mix(in srgb, ' + p.accent + ' 16%, var(--surface))');
      s.setProperty('--ink-accent', 'color-mix(in srgb, ' + p.accent + ' 75%, var(--text))');
      var n = parseInt(p.accent.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      s.setProperty('--accent-ink', (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.5 ? '#161616' : '#ffffff');
    }
    var F = { rounded: ["'Nunito', sans-serif", "'M PLUS Rounded 1c', 'Nunito', sans-serif"], serif: ["'Lora', serif", "'Cormorant Garamond', 'Lora', serif"], sans: ["'Source Sans 3', sans-serif", "'Rubik', 'Source Sans 3', sans-serif"], mono: ["'JetBrains Mono', monospace", "'JetBrains Mono', monospace"], bold: ["'Rubik', sans-serif", "'Unbounded', 'Rubik', sans-serif"], editorial: ["'IBM Plex Sans', sans-serif", "'Playfair Display', serif"], zenmaru: ["'Zen Maru Gothic', 'Nunito', sans-serif", "'Zen Maru Gothic', 'Nunito', sans-serif"], rocknroll: ["'Nunito', sans-serif", "'RocknRoll One', 'Nunito', sans-serif"], reggae: ["'Nunito', sans-serif", "'Reggae One', 'Nunito', sans-serif"], dotgothic: ["'DotGothic16', 'Nunito', sans-serif", "'DotGothic16', 'Nunito', sans-serif"], dela: ["'Nunito', sans-serif", "'Dela Gothic One', 'Nunito', sans-serif"], potta: ["'Nunito', sans-serif", "'Potta One', 'Nunito', sans-serif"], mochiy: ["'Nunito', sans-serif", "'Mochiy Pop One', 'Nunito', sans-serif"], hachi: ["'Hachi Maru Pop', 'Nunito', sans-serif", "'Hachi Maru Pop', 'Nunito', sans-serif"] };
    if (F[p.font]) { s.setProperty('--font-b', F[p.font][0]); s.setProperty('--font-d', F[p.font][1]); }
  } catch (e) {}
})();
