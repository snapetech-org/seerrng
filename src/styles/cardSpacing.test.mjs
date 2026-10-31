import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const sharedCss = readFileSync(
  new URL('./interfaceThemes/shared.css', import.meta.url),
  'utf8'
);
const themes = {
  seerrOrig: readFileSync(
    new URL('../../themes/seerrOrig/theme.css', import.meta.url),
    'utf8'
  ),
  seerrNGJ: readFileSync(
    new URL('../../themes/seerrNGJ/theme.css', import.meta.url),
    'utf8'
  ),
};
const rootVariables = (stylesheet) => {
  const variables = new Map();
  postcss.parse(stylesheet).walkRules((rule) => {
    if (!rule.selectors.some((selector) => selector.includes(':root'))) return;
    for (const node of rule.nodes ?? []) {
      if (node.type === 'decl') variables.set(node.prop, node.value);
    }
  });
  return variables;
};
const verifyThemeSpacing = (
  stylesheet,
  sectionGap,
  mainPadding,
  insetPadding
) => {
  const variables = rootVariables(stylesheet);
  assert.equal(
    variables.get('--interface-section-gap'),
    sectionGap,
    'the theme package owns its card and section spacing'
  );
  assert.equal(variables.get('--interface-main-card-padding'), mainPadding);
  assert.equal(variables.get('--interface-inset-card-padding'), insetPadding);
};

const verifySharedSpacingAliases = (stylesheet) => {
  const variables = rootVariables(stylesheet);
  assert.equal(
    variables.get('--card-layout-spacing'),
    'var(--interface-section-gap)',
    'the shared card spacing role resolves to the selected package'
  );
  assert.equal(
    variables.get('--main-card-padding'),
    'var(--interface-main-card-padding)',
    'main card padding resolves to the selected package'
  );
  assert.equal(
    variables.get('--inset-card-padding'),
    'var(--interface-inset-card-padding)',
    'inset card padding resolves to the selected package'
  );
};

test('primary action rows fill their width while disclosure rows remain left aligned', () => {
  const values = new Map();
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selectors.includes('.media-primary-action-row')) return;
    for (const node of rule.nodes ?? [])
      if (node.type === 'decl') values.set(node.prop, node.value);
  });
  assert.equal(values.get('display'), 'flex');
  assert.equal(values.get('width'), '100%');
  assert.equal(values.get('flex-wrap'), 'wrap');
  assert.equal(
    values.get('justify-content'),
    'var(--action-row-justify, space-between)'
  );
  assert.doesNotMatch(
    css.match(/\.media-detail-disclosure-row\s*\{([^}]+)\}/)?.[1] ?? '',
    /justify-between/
  );
  for (const file of [
    'MovieDetails/MovieDetailsLayout.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'BookDetails/BookDetailsLayout.tsx',
    'MusicDetails/MusicDetailsLayout.tsx',
    'CollectionDetails/index.tsx',
  ]) {
    assert.match(
      readFileSync(new URL(`../components/${file}`, import.meta.url), 'utf8'),
      /className="media-primary-action-row"/
    );
  }
});
test('built-in themes own distinct main, inset, and section spacing', () => {
  verifyThemeSpacing(themes.seerrOrig, '1.5rem', '1.5rem', '1rem');
  verifyThemeSpacing(themes.seerrNGJ, '0.75rem', '1.125rem', '0.75rem');
  verifySharedSpacingAliases(sharedCss);
  assert.match(
    css,
    /\.refreshed-card-surface,[^{]+\{\s*padding: var\(--main-card-padding\) !important/
  );
  assert.match(
    css,
    /\.refreshed-inset-surface,[^{]+\{\s*padding: var\(--inset-card-padding\) !important/
  );
  assert.doesNotMatch(
    css,
    /padding(?:-top)?: var\(--card-spacing\) !important/
  );
});

test('shared spacing rejects a changed alias and a copied spacing owner', () => {
  for (const [before, after, diagnostic] of [
    [
      '--card-layout-spacing: var(--interface-section-gap);',
      '--card-layout-spacing: 12px;',
      /the shared card spacing role resolves to the selected package/,
    ],
    [
      '--main-card-padding: var(--interface-main-card-padding);',
      '--main-card-padding: 8px;',
      /main card padding resolves to the selected package/,
    ],
  ]) {
    const broken = sharedCss.replace(before, after);
    assert.notEqual(broken, sharedCss);
    assert.throws(() => verifySharedSpacingAliases(broken), diagnostic);
  }
});
test('compound settings cards do not double their inset padding', () => {
  for (const selector of [
    'settings-service-card-content',
    'settings-rule-card-content',
  ]) {
    const body = css.match(new RegExp(`\\.${selector}\\s*\\{([^}]+)`))?.[1];
    assert.ok(body);
    assert.doesNotMatch(body, /\bp-3\b|padding:/);
  }
  assert.match(
    css,
    /padding: var\(--inset-card-padding\) var\(--inset-card-padding\) 0 !important/
  );
});

test('card stacks, inset offsets and Settings grids share the gap token, not padding', () => {
  for (const selector of [
    'card-stack > :not([hidden]) ~ :not([hidden])',
    'card-spacing-before',
    'card-spacing-after',
    'settings-service-grid',
    'settings-library-grid',
  ]) {
    const start = css.indexOf(`.${selector} {`);
    assert.ok(start >= 0, selector);
    const body = css.slice(start, css.indexOf('}', start));
    assert.match(body, /var\(--card-spacing\)/);
  }
  for (const file of [
    '../components/ManageSlideOver/index.tsx',
    '../components/ExternalMediaManageSlideOver/index.tsx',
    '../components/Requests/index.tsx',
    '../components/IssueList/index.tsx',
    '../components/Blocklist/index.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /card-stack/);
  }
});
