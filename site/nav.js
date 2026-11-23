/* Shared site navigation — single source of truth for cross-page nav.
 *
 * Each page sets <body data-site="dagbok|niva|flode|reading|tala|listening|kurs|ova|forms|sok"> and loads
 * this script (./nav.js at the site root, ../nav.js from a sub-folder).
 * Öva (ova/) has no tab since 2026-11-15 — Flöde covers quick review — but the page
 * still loads this nav and stays reachable from links (e.g. Läsning's 🎯 去复习). Kurs (kurs/) got its
 * tab on 2026-11-15 right after Flöde; Nivå (niva/, by level) got one on 2026-11-21 right after
 * Dagbok (by date). Läsning, Tala and Lyssna lost their tabs on 2026-11-23: their texts and episodes
 * are reached level by level through Nivå (and day by day through Dagbok), so while one of them is
 * open the Nivå tab is highlighted instead (PARENT). 6 tabs, ~60 px each at 360 px. The script
 * injects an identical nav into every page: a sticky top bar on desktop and a
 * fixed bottom tab bar on phones (styled by .siteNav rules in styles.css).
 *
 * hrefs are computed relative to the current page's depth, so the same data works
 * whether the page lives at the site root (Dagbok) or one folder down.
 */
(function () {
  var SITE = (document.body && document.body.dataset.site) || 'dagbok';
  var atRoot = SITE === 'dagbok';
  var base = atRoot ? '' : '../';

  // Order = tab order on phones; Dagbok (home) first, the Sök tool last.
  var DEST = [
    { id: 'dagbok', icon: '📅', label: 'Dagbok', href: atRoot ? './' : '../' },
    { id: 'niva', icon: '🪜', label: 'Nivå', href: base + 'niva/' },
    { id: 'flode', icon: '🌊', label: 'Flöde', href: base + 'flode/' },
    { id: 'kurs', icon: '📘', label: 'Kurs', href: base + 'kurs/' },
    { id: 'forms', icon: '📐', label: 'Former', href: base + 'forms/' },
    { id: 'sok', icon: '🔍', label: 'Sök', href: base + 'sok/' }
  ];
  // Pages without a tab of their own light up the tab they are reached from.
  var PARENT = { reading: 'niva', tala: 'niva', listening: 'niva' };
  var HERE = PARENT[SITE] || SITE;

  var nav = document.createElement('nav');
  nav.className = 'siteNav';
  nav.setAttribute('aria-label', '站点导航');

  var parts = ['<div class="siteNavInner">'];
  for (var i = 0; i < DEST.length; i++) {
    var d = DEST[i];
    var active = d.id === HERE;
    parts.push(
      '<a class="siteNavTab' + (active ? ' active' : '') + '" href="' + d.href + '"' +
      (active ? ' aria-current="' + (d.id === SITE ? 'page' : 'true') + '"' : '') + '>' +
      '<span class="siteNavIcon" aria-hidden="true">' + d.icon + '</span>' +
      '<span class="siteNavLabel">' + d.label + '</span>' +
      '</a>'
    );
  }
  parts.push('</div>');
  nav.innerHTML = parts.join('');

  document.body.insertBefore(nav, document.body.firstChild);
})();
