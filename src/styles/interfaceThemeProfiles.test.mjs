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

const desktopDetailsGrid = (css) => {
  let result;

  postcss.parse(css).walkAtRules('media', (media) => {
    if (media.params.trim() !== '(min-width: 1024px)') return;

    media.walkRules((rule) => {
      const selectors = rule.selectors.join(',');
      if (
        !selectors.includes("[data-detail-layout='tv']") ||
        !selectors.includes("[data-detail-layout='movie']")
      ) {
        return;
      }

      const declarations = Object.fromEntries(
        rule.nodes
          .filter((node) => node.type === 'decl')
          .map((node) => [node.prop, node.value])
      );
      result = {
        columns: declarations['grid-template-columns'],
        areas: declarations['grid-template-areas'],
      };
    });
  });

  return result;
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

test('profiles select separate native compositions and source geometry', () => {
  const original = JSON.parse(
    readFileSync(
      new URL('../../themes/seerrOrig/manifest.json', import.meta.url),
      'utf8'
    )
  );
  const john = JSON.parse(
    readFileSync(
      new URL('../../themes/seerrNGJ/manifest.json', import.meta.url),
      'utf8'
    )
  );
  assert.equal(original.layout, 'upstream');
  assert.equal(john.layout, undefined);
  assert.equal(original.navigation, 'flat');
  assert.equal(john.navigation, 'grouped');
  assert.match(profiles.seerrOrig, /--poster-width: 144px;/);
  assert.match(profiles.seerrOrig, /--poster-width: 176px;/);
  assert.match(profiles.seerrNGJ, /--poster-width: 169\.2px;/);
  assert.match(profiles.seerrOrig, /upstream-media-header/);
  assert.match(profiles.seerrOrig, /upstream-media-facts/);
  assert.equal(desktopDetailsGrid(profiles.seerrOrig), undefined);
  assert.deepEqual(desktopDetailsGrid(profiles.seerrNGJ), {
    columns: 'minmax(0, 1fr) minmax(18rem, 23rem)',
    areas: "'information actions'",
  });
  for (const [name, css] of Object.entries(profiles)) {
    assert.match(css, /--interface-sidebar-width:/, name);
    assert.match(css, /--interface-button-padding-x:/, name);
    assert.match(css, /app-card-poster/, name);
    assert.match(css, /request-modal-site-surface/, name);
    assert.match(css, /settings-group-card/, name);
  }
  assert.match(desktopNavigation, /interfaceThemeDefinition\.navigation/);
  assert.match(mobileNavigation, /interfaceThemeDefinition\.navigation/);
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
      new RegExp(`:root\\[data-interface-theme=['"]${themeId}['"]\\]`),
      `${themeId} declares its design tokens on its own theme root`
    );
    assert.match(themeCss, /--poster-width:/);
  }
});

test('standalone palette example embeds current production packages without claiming renderer equivalence', () => {
  assert.equal(embeddedStylesheet('shared.css'), sharedStyles);
  assert.equal(embeddedStylesheet('seerrOrig.css'), profiles.seerrOrig);
  assert.equal(embeddedStylesheet('seerrNGJ.css'), profiles.seerrNGJ);
  const dom = new JSDOM(comparison, { pretendToBeVisual: true });
  for (const [name, expected] of [
    ['seerrOrig', '144px'],
    ['seerrNGJ', '169.2px'],
  ]) {
    const panel = dom.window.document.querySelector(
      `[data-interface-theme="${name}"]`
    );
    assert.ok(panel);
    assert.equal(
      dom.window
        .getComputedStyle(panel)
        .getPropertyValue('--poster-width')
        .trim(),
      expected
    );
  }
  dom.window.close();
});
