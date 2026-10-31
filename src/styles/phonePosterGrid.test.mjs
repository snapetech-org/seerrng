import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';

const css = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const root = postcss.parse(css);
const interfaceThemes = Object.fromEntries(
  ['seerrOrig', 'seerrNGJ'].map((id) => [
    id,
    postcss.parse(
      readFileSync(
        new URL(`../../themes/${id}/theme.css`, import.meta.url),
        'utf8'
      )
    ),
  ])
);

const rootDefinitions = new Set();
root.walkRules((rule) => {
  if (rule.selectors.some((selector) => selector.trim() === ':root'))
    rule.walkDecls(/^--/, (decl) => rootDefinitions.add(decl.prop));
});

const mediaRules = (predicate) => {
  const found = [];
  root.walkAtRules('media', (media) => {
    if (predicate(media.params))
      media.walkRules((rule) => found.push({ media, rule }));
  });
  return found;
};

test('each theme owns its two-up narrow-phone poster width', () => {
  for (const [id, stylesheet] of Object.entries(interfaceThemes)) {
    const media = [];
    stylesheet.walkAtRules('media', (rule) => media.push(rule));
    const narrow = media.find((rule) => /max-width:\s*389px/.test(rule.params));
    assert.ok(narrow, `${id} supplies a sub-390px poster width override`);
    let width;
    narrow.walkDecls('--poster-width', (decl) => (width = decl));
    assert.ok(width, `${id} overrides --poster-width`);
    assert.match(width.value, /100vw/, `${id} fits two posters per row`);
    assert.match(
      width.parent.selector,
      new RegExp(`data-interface-theme=['\"]${id}['\"]`)
    );
  }
});

test('custom properties used by root-level overrides are defined at :root', () => {
  // A var() that is only defined on a descendant (for example .page-layout) is
  // invalid at :root, which made --poster-width empty and collapsed posters.
  for (const { rule } of mediaRules(() => true)) {
    if (!rule.selectors.some((selector) => selector.includes(':root')))
      continue;
    rule.walkDecls((decl) => {
      for (const match of decl.value.matchAll(/var\((--[a-z\d-]+)/g))
        assert.ok(
          rootDefinitions.has(match[1]),
          `${decl.prop} in ${rule.selector} uses ${match[1]}, which is not defined at :root`
        );
    });
  }
});

test('coarse pointers get a larger shared action target without touching the 16px default', () => {
  const [entry] = mediaRules((params) => /pointer:\s*coarse/.test(params));
  assert.ok(entry, 'a coarse-pointer override exists');
  const rem = (prop) =>
    parseFloat(
      entry.rule.nodes.find(
        (node) => node.type === 'decl' && node.prop === prop
      )?.value
    );
  assert.ok(rem('--action-control-height') >= 1.5, 'at least 24px');
  assert.ok(rem('--poster-control-height') >= 1.5, 'at least 24px');
});

test('vertical card grids use fixed poster-width columns so posters never overlap', () => {
  const rules = [];
  root.walkRules('ul.cards-vertical', (rule) => rules.push(rule));
  const columns = rules
    .flatMap((rule) => rule.nodes)
    .find(
      (node) => node.type === 'decl' && node.prop === 'grid-template-columns'
    );
  assert.equal(columns?.value, 'repeat(auto-fill, var(--poster-width))');
});

test('secondary poster actions hide only for fine hover pointers, never on touch', () => {
  const hiding = [];
  root.walkRules((rule) => {
    if (!/association-slot/.test(rule.selector)) return;
    rule.walkDecls('opacity', (decl) => {
      if (decl.value === '0') hiding.push(rule);
    });
  });
  assert.equal(hiding.length, 1, 'exactly one rule hides the slots');
  const media = hiding[0].parent;
  assert.equal(media.type, 'atrule');
  assert.match(media.params, /hover:\s*hover/);
  assert.match(media.params, /pointer:\s*fine/);
  assert.match(hiding[0].selector, /:not\(:hover\)/);
  assert.match(hiding[0].selector, /:not\(:focus-within\)/);
  const noClicks = hiding[0].nodes.find(
    (node) => node.type === 'decl' && node.prop === 'pointer-events'
  );
  assert.equal(noClicks?.value, 'none', 'invisible controls cannot be pressed');
});

test('the shared control height meets the 24px WCAG 2.2 minimum', () => {
  const heights = {};
  root.walkRules(':root', (rule) =>
    rule.walkDecls(/^--(action|poster)-control(-content)?-height$/, (decl) => {
      heights[decl.prop] = decl.value;
    })
  );
  assert.equal(heights['--action-control-height'], '1.5rem');
  assert.equal(heights['--poster-control-height'], '1.5rem');
  // Glyphs stay 14px: only the hit area grows.
  assert.equal(heights['--action-control-content-height'], '0.875rem');
  assert.equal(heights['--poster-control-content-height'], '0.875rem');
});
