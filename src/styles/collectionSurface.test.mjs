import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { styleContract } from './cssContract.mjs';
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const assertNativeDeclaration = (contract, selector, property, expected) => {
  const values = contract
    .rulesFor(selector)
    .flatMap((rule) =>
      rule.nodes
        .filter((node) => node.type === 'decl' && node.prop === property)
        .map((node) => `${node.value}${node.important ? ' !important' : ''}`)
    );
  assert.deepEqual(values, [expected], `${selector} owns ${property} once`);
  assert.equal(contract.applies(selector).size, 0, `${selector} is native CSS`);
};
const assertFramedConsumer = (source) => {
  const classes = [...source.matchAll(/className="([^"]*)"/g)]
    .map((match) => match[1].split(/\s+/))
    .filter((tokens) => tokens.includes('detail-item-surface'));
  assert.ok(classes.length, 'consumer attaches the shared fill');
  for (const tokens of classes) {
    assert.ok(
      tokens.includes('app-card-sub'),
      'consumer attaches the shared frame'
    );
    for (const token of tokens)
      assert.doesNotMatch(
        token,
        /^(?:rounded(?:-|$)|border(?:-|$)|bg-)/,
        'consumer cannot compete with surface or frame'
      );
  }
};
const assertSharedSurface = (css) => {
  const contract = styleContract(css);
  assertNativeDeclaration(
    contract,
    '.detail-item-surface',
    'background-color',
    'rgb(var(--color-gray-900) / 0.3)'
  );
  // Framed consumers use the shared masked frame. Legacy standalone consumers
  // keep geometry only through the low-specificity fallback that excludes it.
  const standalone =
    ':where(.detail-item-surface:not(.app-card-sub):not(.app-card-inset))';
  assertNativeDeclaration(
    contract,
    standalone,
    'border',
    '1px solid rgb(var(--color-gray-700))'
  );
  assertNativeDeclaration(
    contract,
    standalone,
    'border-radius',
    'var(--control-corner-radius)'
  );
  for (const rule of contract.rulesFor('.detail-item-surface')) {
    for (const node of rule.nodes.filter((node) => node.type === 'decl'))
      assert.doesNotMatch(
        node.prop,
        /^border(?:-|$)/,
        'surface must not own frame geometry'
      );
  }
  const frame = ':is(.app-card-sub, .app-card-inset)';
  assertNativeDeclaration(contract, frame, '--app-card-frame-width', '1px');
  assertNativeDeclaration(contract, frame, 'border-radius', '0.5rem');
  const frameBody = ':is(.app-card-main, .app-card-sub, .app-card-inset)';
  assertNativeDeclaration(contract, frameBody, 'border-width', '0 !important');
  const decoration = frameBody + '::after';
  assertNativeDeclaration(
    contract,
    decoration,
    'padding',
    'var(--app-card-frame-width)'
  );
  assertNativeDeclaration(
    contract,
    decoration,
    'background',
    'var(--app-card-frame-background)'
  );
  assertNativeDeclaration(contract, decoration, 'mask-composite', 'exclude');
  assertNativeDeclaration(contract, decoration, 'pointer-events', 'none');
  assertNativeDeclaration(
    contract,
    '.detail-item-interactive:hover',
    'background-color',
    'rgb(var(--color-indigo-500) / 0.15)'
  );
  assertNativeDeclaration(
    contract,
    '.detail-item-interactive:hover',
    'border-color',
    'rgb(var(--color-indigo-400))'
  );
};
test('cast, crew and collection items share the same 30-percent surface', () => {
  const css = read('./globals.css');
  assertSharedSurface(css);
  for (const file of [
    'MediaDetails/ExpandableCreditList.tsx',
    'CollectionDetails/CollectionSummaryCard.tsx',
    'CollectionDetails/index.tsx',
  ]) {
    assertFramedConsumer(read('../components/' + file));
  }
});
test('surface consumer check rejects missing shared owners and competing utilities', () => {
  const source = read(
    '../components/CollectionDetails/CollectionSummaryCard.tsx'
  );
  for (const mutant of [
    source.replace('app-card-sub ', ''),
    source.replace('detail-item-surface ', ''),
    source.replace('detail-item-surface ', 'detail-item-surface rounded-lg '),
  ])
    assert.throws(() => assertFramedConsumer(mutant), assert.AssertionError);
});
test('surface check rejects competing geometry, lost frame and changed hover paint', () => {
  const css = read('./globals.css');
  const hoverRules = styleContract(css).rulesFor(
    '.detail-item-interactive:hover'
  );
  const hoverPaint = hoverRules.flatMap((rule) =>
    rule.nodes.filter(
      (node) => node.type === 'decl' && node.prop === 'background-color'
    )
  );
  assert.equal(
    hoverPaint.length,
    1,
    'mutant targets one shared hover paint owner'
  );
  hoverPaint[0].value = 'transparent';
  const changedHoverPaint = hoverPaint[0].root().toString();
  for (const mutant of [
    css + '\n.detail-item-surface { border-radius: 1rem; }',
    css.replace(
      ':where(.detail-item-surface:not(.app-card-sub):not(.app-card-inset))',
      '.detail-item-surface'
    ),
    css.replace('mask-composite: exclude;', 'mask-composite: add;'),
    changedHoverPaint,
  ])
    assert.throws(() => assertSharedSurface(mutant), assert.AssertionError);
});

test('surface check rejects loss of the shared grouped fill owner', () => {
  const css = read('./globals.css');
  assert.throws(
    () =>
      assertSharedSurface(
        css.replace('.detail-item-surface,', '.unrelated-surface,')
      ),
    assert.AssertionError
  );
});
test('collection disclosure is a single standard subcard with an inline overview', () => {
  const collection = read(
    '../components/CollectionDetails/CollectionSummaryCard.tsx'
  );
  assert.match(
    collection,
    /detail-item-surface detail-summary-card media-detail-collection-card/
  );
  assert.doesNotMatch(
    collection,
    /refreshed-card-surface|refreshed-inset-surface|collection-summary-overview-text/
  );
  assert.match(
    collection,
    /<dd className="collection-summary-overview-value">/
  );
  assert.equal((collection.match(/<section\b/g) ?? []).length, 1);
});

test('media-page overview expands fully and genres occupy the last two rows', () => {
  const css = read('./globals.css');
  const contract = styleContract(css);
  const overview = contract.applies('.collection-summary-overview-value');
  assert.ok(overview.has('col-end-[-1]'));
  assert.equal(
    contract.declaration('.collection-summary-overview-value', 'overflow-wrap'),
    'anywhere'
  );
  assert.equal(
    contract.declaration('.collection-summary-overview-value', 'max-height'),
    undefined
  );
  for (const token of overview)
    assert.doesNotMatch(token, /line-clamp|overflow-hidden/);
  const rows = contract
    .rulesFor('.collection-summary-table')
    .flatMap((rule) =>
      rule.nodes.filter(
        (node) => node.type === 'decl' && node.prop === 'grid-template-rows'
      )
    );
  assert.equal(rows.length, 2);
  assert.match(
    rows[0].value,
    /repeat\(3, minmax\(var\(--detail-row-height\), auto\)\)/
  );
  assert.match(
    rows[1].value,
    /repeat\(2, minmax\(var\(--detail-row-height\), auto\)\)/
  );
  assert.equal(
    contract.declaration('.collection-summary-genres-value', 'grid-row'),
    '2 / 4'
  );
});

test('collection page overview is inside its first details table, not a separate card', () => {
  const page = read('../components/CollectionDetails/index.tsx');
  const table = page.slice(
    page.indexOf('<dl className="collection-summary-table'),
    page.indexOf(
      '</dl>',
      page.indexOf('<dl className="collection-summary-table')
    )
  );
  assert.match(table, /collection-summary-overview-value/);
  assert.match(table, /data.overview/);
  assert.ok(
    table.indexOf('collection-summary-overview-label') <
      table.indexOf('collection-summary-genres-label')
  );
  assert.equal((page.match(/messages.overview\)/g) ?? []).length, 1);
  assert.match(
    page,
    /detail-item-surface detail-summary-card collection-summary-header/
  );
  assert.match(page, /collection-summary-poster-image/);
});

test('collection and media detail dividers consume the selected theme width', () => {
  const css = read('./globals.css');
  assert.match(
    read('./interfaceThemes/shared.css'),
    /--detail-divider-width: var\(--interface-detail-divider-width\);/
  );
  for (const [theme, width] of [
    ['seerrOrig', '2px'],
    ['seerrNGJ', '2px'],
    ['persiusNG', '1px'],
  ]) {
    assert.ok(
      read(`../../themes/${theme}/theme.css`).includes(
        `--interface-detail-divider-width: ${width};`
      )
    );
  }
  assert.doesNotMatch(css, /--detail-divider-width:\s*\d/);
  assert.match(
    css,
    /\.collection-summary-table::after\s*\{[^}]*width: var\(--detail-divider-width\)/
  );
  assert.match(
    css,
    /\.media-detail-column-divider\s*\{[^}]*border-top-width: var\(--detail-divider-width\)/
  );
  assert.doesNotMatch(css, /\.collection-summary-table::before/);
  assert.doesNotMatch(
    css,
    /\.media-detail-collection-card \.collection-summary-/
  );
});
