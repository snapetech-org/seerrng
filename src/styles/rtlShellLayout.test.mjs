import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const css = postcss.parse(read('./globals.css'));
const visualLabCss = postcss.parse(read('./visual-lab.css'));
const ruleFor = (root, selector) => {
  let match;
  root.walkRules((rule) => {
    if (!match && rule.selectors?.includes(selector)) match = rule;
  });
  assert.ok(match, `Expected authored CSS rule for ${selector}`);
  return match;
};
const ruleMatching = (root, predicate) => {
  let match;
  root.walkRules((rule) => {
    if (!match && predicate(rule)) match = rule;
  });
  assert.ok(match, 'Expected matching authored CSS rule');
  return match;
};
const declarations = (root, selector) =>
  new Map(
    ruleFor(root, selector)
      .nodes.filter((node) => node.type === 'decl')
      .map((declaration) => [declaration.prop, declaration.value])
  );
const component = (path) => read(`../components/${path}`);

test('shell geometry uses flow-relative CSS at responsive breakpoints', () => {
  const desktop = [];
  css.walkAtRules('media', (rule) => {
    if (rule.params === '(min-width: 64rem)') desktop.push(rule);
  });
  assert.equal(desktop.length, 1);
  assert.equal(
    declarations(css, '.app-sidebar-dock').get('inset-inline-start'),
    '0'
  );
  assert.equal(
    declarations(css, '.app-layout-main-content').get('margin-inline-start'),
    'var(--app-sidebar-width)'
  );
  assert.equal(declarations(css, '.searchbar').get('inset-inline'), '0');
  assert.equal(
    declarations(desktop[0], '.searchbar').get('inset-inline-start'),
    'var(--app-sidebar-width)'
  );

  const mobileDock = declarations(css, '.app-mobile-menu-dock');
  assert.equal(mobileDock.get('inset-inline'), '0');
  assert.equal(mobileDock.get('inset-block-end'), '0');
  const mobilePanel = declarations(css, '.app-mobile-menu-panel');
  assert.equal(mobilePanel.get('inset-inline'), '0');
  assert.equal(mobilePanel.get('inset-block-start'), '0');
});

test('RTL sidebar and search roles reverse logical edges and directional artwork', () => {
  const sidebar = declarations(css, '.sidebar');
  assert.equal(
    sidebar.get('border-inline-end'),
    '1px solid rgb(var(--theme-sidebar-border))'
  );
  assert.equal(
    sidebar.get('padding-inline-start'),
    'env(safe-area-inset-left)'
  );
  assert.match(
    ruleFor(css, ":root[dir='rtl'] .sidebar").toString(),
    /padding-inline-start:\s*env\(safe-area-inset-right\)/
  );
  assert.match(
    ruleFor(css, ":root[dir='rtl'] .app-sidebar-slide-from").toString(),
    /transform:\s*translateX\(100%\)/
  );
  assert.match(
    ruleFor(css, ":root[dir='rtl'] .app-sidebar-logo").toString(),
    /object-position:\s*right center/
  );

  const search = declarations(css, '.app-search-input');
  assert.equal(search.get('padding-inline-start'), '2.5rem');
  assert.equal(
    declarations(css, '.app-search-input-icon').get('inset-inline-start'),
    '1rem'
  );
  assert.equal(
    declarations(css, '.app-search-clear-control').get('inset-inline-end'),
    '0.5rem'
  );

  const visualSidebar = declarations(visualLabCss, '.sidebar');
  assert.equal(
    visualSidebar.get('border-inline-end'),
    sidebar.get('border-inline-end')
  );
  assert.equal(
    declarations(visualLabCss, '.app-search-input').get('padding-inline-start'),
    '2.5rem'
  );
});

test('shell component wiring uses semantic directional roles', () => {
  const sidebar = component('Layout/Sidebar/index.tsx');
  const mobileMenu = component('Layout/MobileMenu/index.tsx');
  const layout = component('Layout/index.tsx');
  const themePicker = component('Layout/ThemePicker/index.tsx');

  for (const source of [sidebar, mobileMenu, layout, themePicker]) {
    assert.doesNotMatch(
      source,
      /\b(?:mr|ml|pr|pl)-(?:\d|auto|px|full)\b/,
      'changed shell roles must not encode physical inline spacing'
    );
    assert.doesNotMatch(
      source,
      /\b(?:left|right)-(?:0|full)\b/,
      'changed shell positioning must use logical insets'
    );
  }

  assert.match(sidebar, /app-sidebar-icon/);
  assert.match(sidebar, /app-sidebar-slide-from/);
  assert.match(mobileMenu, /app-mobile-menu-dock/);
  assert.match(mobileMenu, /app-mobile-menu-label/);
  assert.match(layout, /app-searchbar-side-actions/);
  assert.match(layout, /app-back-navigation-icon/);
  assert.match(themePicker, /app-theme-picker-swatches/);
  assert.match(themePicker, /app-theme-picker-selection-indicator/);

  const dropdown = declarations(css, '.app-language-picker-menu');
  assert.equal(dropdown.get('inset-inline-end'), '0');
  assert.equal(dropdown.get('margin-block-start'), '0.5rem');
  assert.match(
    ruleMatching(css, (rule) =>
      rule.selectors?.some(
        (selector) =>
          selector.includes(":root[dir='rtl']") &&
          selector.includes('.app-theme-picker-menu')
      )
    ).toString(),
    /transform-origin:\s*top left/
  );
});
