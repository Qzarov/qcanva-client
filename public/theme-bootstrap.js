(function () {
  var preference = 'system';
  try {
    var stored = window.localStorage.getItem('qcanva:theme:v1');
    if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;
  } catch (_) {
    // Storage is optional; System with a light fallback remains deterministic.
  }

  var prefersDark = false;
  if (preference === 'system') {
    try {
      prefersDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) {
      prefersDark = false;
    }
  }

  var effectiveTheme = preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
  var root = document.documentElement;
  root.setAttribute('data-theme', effectiveTheme);
  root.style.colorScheme = effectiveTheme;

  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', effectiveTheme === 'light' ? '#f5f7f4' : '#071307');
})();
