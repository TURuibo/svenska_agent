/* Shared site navigation — single source of truth for cross-page nav.
 *
 * Each page sets <body data-site="dagbok|reading|listening|forms|sok"> and loads
 * this script (./nav.js at the site root, ../nav.js from a sub-folder). The script
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
    { id: 'reading', icon: '📖', label: 'Läsning', href: base + 'reading/' },
    { id: 'listening', icon: '🎧', label: 'Lyssna', href: base + 'listening/' },
    { id: 'forms', icon: '📐', label: 'Former', href: base + 'forms/' },
    { id: 'sok', icon: '🔍', label: 'Sök', href: base + 'sok/' }
  ];

  var nav = document.createElement('nav');
  nav.className = 'siteNav';
  nav.setAttribute('aria-label', '站点导航');

  var parts = ['<div class="siteNavInner">'];
  for (var i = 0; i < DEST.length; i++) {
    var d = DEST[i];
    var active = d.id === SITE;
    parts.push(
      '<a class="siteNavTab' + (active ? ' active' : '') + '" href="' + d.href + '"' +
      (active ? ' aria-current="page"' : '') + '>' +
      '<span class="siteNavIcon" aria-hidden="true">' + d.icon + '</span>' +
      '<span class="siteNavLabel">' + d.label + '</span>' +
      '</a>'
    );
  }
  parts.push('</div>');
  nav.innerHTML = parts.join('');

  document.body.insertBefore(nav, document.body.firstChild);
})();
