(function () {
  var KEY = 'felicia-theme';
  var STORAGE = typeof localStorage !== 'undefined' ? localStorage : null;

  function getStored() {
    try {
      return STORAGE && STORAGE.getItem(KEY);
    } catch (e) {
      return null;
    }
  }

  function setStored(value) {
    try {
      if (STORAGE) STORAGE.setItem(KEY, value);
    } catch (e) {}
  }

  function getPreferred() {
    var stored = getStored();
    if (stored === 'dark' || stored === 'light') return stored;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    return 'light';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function init() {
    apply(getPreferred());
  }

  function toggle() {
    var current = document.documentElement.getAttribute('data-theme') || 'light';
    var next = current === 'dark' ? 'light' : 'dark';
    setStored(next);
    apply(next);
    return next;
  }

  init();
  window.FeliciaTheme = { toggle: toggle, get: function () { return document.documentElement.getAttribute('data-theme') || 'light'; } };
})();
