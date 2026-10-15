// Runs before first paint (classic script in <head>): applies the saved look without a flash. Mirrors theme.js applyPrefs.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem('jll.prefs') || '{}'), r = document.documentElement;
    r.setAttribute('data-theme', p.theme || 'sakura');
    ['motion:full', 'map:theme'].forEach(function (x) {
      var k = x.split(':'); if (p[k[0]] && p[k[0]] !== k[1]) r.setAttribute('data-' + k[0], p[k[0]]);
    });
  } catch (e) {}
})();
