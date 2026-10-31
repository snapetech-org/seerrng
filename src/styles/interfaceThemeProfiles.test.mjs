import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import postcss from 'postcss';

const sharedStyles = readFileSync(
  new URL('./interfaceThemes/shared.css', import.meta.url),
  'utf8'
);
const globalStyles = readFileSync(
  new URL('./globals.css', import.meta.url),
  'utf8'
);
const profiles = {
  seerrOrig: readFileSync(
    new URL('../../themes/seerrOrig/theme.css', import.meta.url),
    'utf8'
  ),
  seerrNGJ: readFileSync(
    new URL('../../themes/seerrNGJ/theme.css', import.meta.url),
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
  let token;
  postcss.parse(css).walkDecls(`--${name}`, (declaration) => {
    token ??= declaration.value;
  });
  assert.ok(token, `expected CSS token --${name}`);
  return token.trim();
};

const embeddedStylesheet = (name) => {
  const document = new JSDOM(comparison).window.document;
  const stylesheet = [
    ...document.querySelectorAll('style[data-profile-stylesheet]'),
  ].find(
    (candidate) => candidate.getAttribute('data-profile-stylesheet') === name
  );
  assert.ok(stylesheet, `preview is missing embedded ${name}`);
  return stylesheet.textContent?.slice(1) ?? '';
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

  assert.match(profiles.seerrOrig, /--poster-width: 150px;/);
  assert.match(profiles.seerrNGJ, /--poster-width: 169\.2px;/);

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
    /grid-template-columns: repeat\(auto-fill, minmax\(var\(--poster-width\), 1fr\)\);/
  );
  assert.match(
    profiles.seerrNGJ,
    /grid-template-columns: repeat\(auto-fill, minmax\(var\(--poster-width\), 1fr\)\);/
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
  assert.match(desktopNavigation, /interfaceThemeDefinition\.navigation/);
  assert.match(mobileNavigation, /interfaceThemeDefinition\.navigation/);
  assert.match(desktopNavigation, /activeNavigationIcon === 'filled'/);
  assert.match(mobileNavigation, /activeNavigationIcon ===/);
  assert.match(comparison, /data-interface-theme="seerrOrig"/);
  assert.match(comparison, /data-interface-theme="seerrNGJ"/);
  assert.doesNotMatch(
    readFileSync(new URL('../pages/_app.tsx', import.meta.url), 'utf8'),
    /seerrOrig\.css|seerrNGJ\.css/
  );
  assert.match(
    readFileSync(new URL('../pages/_document.tsx', import.meta.url), 'utf8'),
    /api\/v1\/interface-themes\/seerrOrig\/theme\.css/
  );
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

test('theme design tokens live in packages while global CSS keeps shared roles', () => {
  const globalDesignTokens = new Set();
  postcss.parse(globalStyles).walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.trim() === ':root')) return;
    for (const node of rule.nodes ?? []) {
      if (node.type === 'decl') globalDesignTokens.add(node.prop);
    }
  });
  const packageOwnedTokens = [
    '--sidebar-navigation-group-gap',
    '--compact-control-height',
    '--profile-menu-row-height',
    '--card-layout-spacing',
    '--main-card-padding',
    '--inset-card-padding',
    '--detail-row-height',
    '--card-table-font-size',
    '--card-title-font-size',
    '--page-heading-font-size',
    '--card-compact-height',
    '--detail-first-column-limit',
    '--button-padding-x',
    '--button-content-gap',
    '--dropdown-menu-surface',
  ];
  for (const token of packageOwnedTokens) {
    assert.ok(
      !globalDesignTokens.has(token),
      `global CSS must not set package-owned ${token}`
    );
    assert.ok(
      sharedStyles.includes(`${token}:`),
      `shared component CSS must resolve ${token}`
    );
  }
  for (const [themeId, themeCss] of Object.entries(profiles)) {
    assert.match(
      themeCss,
      new RegExp(`:root\\[data-interface-theme=['\"]${themeId}['\"]\\]`),
      `${themeId} declares its design tokens on its own theme root`
    );
    assert.match(themeCss, /--poster-width:/);
  }
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
      posterWidth: getComputedStyle(panel)
        .getPropertyValue('--poster-width')
        .trim(),
      designTokens: Object.fromEntries(
        [
          '--interface-sidebar-width',
          '--interface-section-gap',
          '--interface-card-radius',
          '--interface-main-card-padding',
          '--interface-button-padding-x',
          '--interface-card-compact-height',
        ].map((token) => [
          token,
          getComputedStyle(panel).getPropertyValue(token).trim(),
        ])
      ),
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

  assert.equal(original.posterWidth, '150px');
  assert.equal(john.posterWidth, '169.2px');
  for (const token of Object.keys(original.designTokens)) {
    assert.ok(
      original.designTokens[token],
      `SeerrOrig preview computes ${token}`
    );
    assert.ok(john.designTokens[token], `SeerrNGJ preview computes ${token}`);
    assert.notEqual(
      original.designTokens[token],
      john.designTokens[token],
      `${token} must resolve differently in the two production packages`
    );
  }
  assert.equal(original.filters.display, 'flex');
  assert.equal(original.filters.flexDirection, 'column');
  assert.equal(john.filters.display, 'grid');
  assert.equal(john.filters.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(
    original.posters.gridTemplateColumns,
    'repeat(auto-fill, minmax(var(--poster-width), 1fr))'
  );
  assert.equal(
    john.posters.gridTemplateColumns,
    'repeat(auto-fill, minmax(var(--poster-width), 1fr))'
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
