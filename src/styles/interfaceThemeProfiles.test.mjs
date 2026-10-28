import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const sharedStyles = readFileSync(
  new URL('./interfaceThemes/shared.css', import.meta.url),
  'utf8'
);
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

const embeddedStylesheet = (name) => {
  const match = comparison.match(
    new RegExp(`<style data-profile-stylesheet="${name}">([\\s\\S]*?)</style>`)
  );
  assert.ok(match, `preview is missing embedded ${name}`);
  return match[1].slice(1);
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

test('standalone comparison embeds production CSS and computes distinct layouts', () => {
  assert.equal(embeddedStylesheet('shared.css'), sharedStyles);
  assert.equal(embeddedStylesheet('seerrOrig.css'), profiles.seerrOrig);
  assert.equal(embeddedStylesheet('seerrNGJ.css'), profiles.seerrNGJ);

  const dom = new JSDOM(comparison, { pretendToBeVisual: true });
  const { document, getComputedStyle } = dom.window;
  const theme = (name) => {
    const panel = document.querySelector(`[data-interface-theme="${name}"]`);
    assert.ok(panel, `preview is missing ${name}`);
    const style = (selector) => {
      const element = panel.querySelector(selector);
      assert.ok(element, `${name} is missing ${selector}`);
      return getComputedStyle(element);
    };
    return {
      filters: style('.app-pinned-filter-group'),
      posters: style('.cards-vertical'),
      route: style('.preview-route-grid'),
      admin: style('.settings-page-content'),
      mediaTabs: style('.preview-media-tabs'),
      activeIcon: panel.querySelector(
        '[data-navigation-link-id="discover-home"] svg'
      ),
    };
  };

  const original = theme('seerrOrig');
  const john = theme('seerrNGJ');

  assert.equal(original.filters.display, 'flex');
  assert.equal(original.filters.flexDirection, 'column');
  assert.equal(john.filters.display, 'grid');
  assert.equal(john.filters.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(
    original.posters.gridTemplateColumns,
    'repeat(auto-fill, minmax(12rem, 1fr))'
  );
  assert.equal(
    john.posters.gridTemplateColumns,
    'repeat(auto-fill, minmax(7.5rem, 1fr))'
  );
  assert.equal(original.route.gridTemplateColumns, 'minmax(0, 1fr)');
  assert.equal(
    john.route.gridTemplateColumns,
    'minmax(0, 1.1fr) minmax(0, 0.9fr)'
  );
  assert.equal(original.admin.display, 'flex');
  assert.equal(john.admin.display, 'grid');
  assert.equal(original.mediaTabs.justifyContent, 'flex-start');
  assert.equal(john.mediaTabs.justifyContent, 'flex-end');
  assert.equal(original.activeIcon?.getAttribute('fill'), 'none');
  assert.equal(john.activeIcon?.getAttribute('fill'), 'currentColor');

  dom.window.close();
});
