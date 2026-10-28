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
