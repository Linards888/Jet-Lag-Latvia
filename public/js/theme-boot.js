// Runs before first paint (classic script in <head>): applies the saved theme without a flash.
(function () {
  try {
    var t = localStorage.getItem('jll.theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
