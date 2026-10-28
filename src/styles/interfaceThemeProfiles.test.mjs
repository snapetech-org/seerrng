import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const profiles = {
  seerrOrig: readFileSync(
    new URL('./interfaceThemes/seerrOrig.css', import.meta.url),
    'utf8'
  ),
  seerrNGJ: readFileSync(
    new URL('./interfaceThemes/seerrNGJ.css', import.meta.url),
    'utf8'
  ),
};
const requestListItem = readFileSync(
  new URL('../components/RequestList/RequestItem/index.tsx', import.meta.url),
  'utf8'
);
const blocklistCard = readFileSync(
  new URL('../components/Blocklist/index.tsx', import.meta.url),
  'utf8'
);
const appLayout = readFileSync(
  new URL('../components/Layout/index.tsx', import.meta.url),
  'utf8'
);
const desktopNavigation = readFileSync(
  new URL('../components/Layout/Sidebar/index.tsx', import.meta.url),
  'utf8'
);
const mobileNavigation = readFileSync(
  new URL('../components/Layout/MobileMenu/index.tsx', import.meta.url),
  'utf8'
);
const comparison = readFileSync(
  new URL('../../docs/interface-themes/theme-comparison.html', import.meta.url),
  'utf8'
);

const cssToken = (css, name) => {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`));
  assert.ok(match, `expected CSS token --${name}`);
  return match[1].trim();
};

test('interface profiles own visibly different layout and geometry tokens', () => {
  assert.notEqual(profiles.seerrOrig, profiles.seerrNGJ);

  for (const token of [
    'interface-sidebar-width',
    'interface-page-gutter',
    'interface-card-radius',
    'interface-control-radius',
    'interface-section-gap',
    'poster-width',
  ]) {
    assert.notEqual(
      cssToken(profiles.seerrOrig, token),
      cssToken(profiles.seerrNGJ, token),
      `expected --${token} to differ between profiles`
    );
  }

  assert.match(profiles.seerrOrig, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(
    profiles.seerrNGJ,
    /grid-template-columns: 5rem minmax\(0, 1fr\);/
  );
  assert.match(
    profiles.seerrOrig,
    /grid-template-areas: 'actions' 'information';/
  );
  assert.match(
    profiles.seerrNGJ,
    /grid-template-areas: 'information actions';/
  );
  assert.match(
    profiles.seerrOrig,
    /\.app-pinned-filter-group\s*\{\s*display: flex;\s*flex-direction: column;/
  );
  assert.match(
    profiles.seerrNGJ,
    /\.app-pinned-filter-group\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(
    profiles.seerrOrig,
    /grid-template-columns: repeat\(auto-fill, minmax\(12rem, 1fr\)\);/
  );
  assert.match(
    profiles.seerrNGJ,
    /grid-template-columns: repeat\(auto-fill, minmax\(7\.5rem, 1fr\)\);/
  );
  assert.match(
    profiles.seerrOrig,
    /\.preview-route-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/
  );
  assert.match(
    profiles.seerrNGJ,
    /\.preview-route-grid\s*\{\s*grid-template-columns: minmax\(0, 1\.1fr\) minmax\(0, 0\.9fr\);/
  );
  assert.match(
    profiles.seerrOrig,
    /\.settings-page-content\s*\{\s*display: flex;\s*flex-direction: column;/
  );
  assert.match(
    profiles.seerrNGJ,
    /\.settings-page-content:has\(\s*> \.section,\s*> \.settings-group-card,\s*> \.settings-library-card\s*\)\s*\{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
  );
  assert.match(desktopNavigation, /interfaceTheme === 'seerrNGJ' && selected/);
  assert.match(mobileNavigation, /interfaceTheme === 'seerrNGJ' && isActive/);
  assert.match(comparison, /data-interface-theme="seerrOrig"/);
  assert.match(comparison, /data-interface-theme="seerrNGJ"/);
  assert.equal(
    comparison.match(
      /<button aria-current="page">Movies<\/button><button>Series<\/button><button>Books<\/button><button>Music<\/button>/g
    )?.length,
    2,
    'both panels should use the same media controls'
  );
  assert.equal(
    comparison.match(/<h3 class="settings-group-heading">Catalog sync<\/h3>/g)
      ?.length,
    2,
    'both panels should use the same admin cards'
  );
  assert.equal(
    comparison.match(/The Glass Horizon/g)?.length,
    2,
    'both panels should use the same media sample'
  );
});

test('both profiles style the current shared route-family contracts', () => {
  const routeRoles = [
    '.app-card-poster',
    '.media-detail-card',
    '.app-detail-summary-grid',
    '.settings-group-card',
    '.app-data-table',
    '.request-modal-site-surface',
    '.issue-summary-card',
    "[data-interface-role='main-content']",
    "[data-interface-role='request-card']",
    "[data-interface-role='blocklist-card']",
  ];

  for (const [name, css] of Object.entries(profiles)) {
    for (const role of routeRoles) {
      assert.ok(css.includes(role), `${name} is missing ${role}`);
    }
    assert.match(css, /data-detail-layout='tv'/);
    assert.match(css, /data-detail-layout='movie'/);
    assert.ok(css.includes("[data-testid='media-details-poster']"));
  }

  assert.match(requestListItem, /data-interface-role="request-card"/);
  assert.match(blocklistCard, /data-interface-role="blocklist-card"/);
  assert.match(appLayout, /data-interface-role="main-content"/);
});
