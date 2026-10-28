import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
import ts from 'typescript';
import { styleContract } from './cssContract.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const css = read('./globals.css');
const sharedCss = read('./interfaceThemes/shared.css');
const origThemeCss = read('../../themes/seerrOrig/theme.css');
const ngjThemeCss = read('../../themes/seerrNGJ/theme.css');

const elements = (source) => {
  const tree = ts.createSourceFile(
    'consumer.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const result = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
      result.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return result;
};
const opening = (node) => node.openingElement ?? node;
const attribute = (node, name) => {
  if (!node) return undefined;
  const value = opening(node).attributes.properties.find(
    (entry) => ts.isJsxAttribute(entry) && entry.name.text === name
  )?.initializer;
  if (!value) return undefined;
  return ts.isStringLiteral(value) ? value.text : value.expression?.getText();
};
const tag = (node) => opening(node).tagName.getText();
const hasRole = (node, role) =>
  (attribute(node, 'className') ?? '').split(/\s+/).includes(role);
const inside = (node, ancestor) => {
  for (let parent = node.parent; parent; parent = parent.parent)
    if (parent === ancestor) return true;
  return false;
};

const verifyNativeRequestRows = (source, stylesheet) => {
  const nodes = elements(source);
  const summary = nodes.find((node) => hasRole(node, 'detail-summary-card'));
  assert.ok(summary, 'request has a summary card');
  const tables = nodes.filter(
    (node) => inside(node, summary) && tag(node) === 'dl'
  );
  assert.ok(tables.length > 0, 'request summary contains definition tables');
  for (const table of tables)
    assert.ok(
      hasRole(table, 'card-table'),
      'request tables consume the shared native row owner'
    );
  for (const node of nodes.filter(
    (node) => inside(node, summary) && ['dt', 'dd'].includes(tag(node))
  )) {
    assert.ok(
      hasRole(
        node,
        tag(node) === 'dt' ? 'card-table-heading' : 'card-table-value'
      ),
      'request cells consume shared typography'
    );
    assert.ok(
      tables.some((table) => inside(node, table)),
      'request cells remain inside their table'
    );
  }
  const paired = tables.find((node) => hasRole(node, 'detail-paired-columns'));
  assert.ok(paired, 'request retains paired detail columns');
  assert.ok(
    nodes.some(
      (node) =>
        hasRole(node, 'detail-card-heading-spacing') && inside(paired, node)
    ),
    'request table follows the shared heading gap'
  );
  const values = paired.children.filter(
    (node) => ts.isJsxElement(node) && tag(node) === 'dd'
  );
  assert.equal(
    attribute(values[3], 'data-wrap'),
    'true',
    'fourth-row value wraps in the shared table'
  );
  const contract = styleContract(stylesheet);
  for (const [selector, property, expected] of [
    ['.card-table', 'grid-auto-rows', 'minmax(var(--detail-row-height), auto)'],
    ['.card-table', 'row-gap', 'var(--detail-row-gap)'],
    ['.card-table', 'line-height', 'var(--detail-row-height)'],
    ['.card-table dt', 'margin', '0'],
    ['.card-table dd', 'min-height', 'var(--detail-row-height)'],
    [".card-table-value[data-wrap='true']", 'white-space', 'normal'],
    ['.card-table.detail-paired-columns > dd:nth-of-type(4)', 'grid-row', '4'],
  ])
    assert.equal(
      contract.declaration(selector, property),
      expected,
      `request ${selector} ${property} retains its shared owner`
    );
};

test('summary posters retain their size while heading gaps follow each theme', () => {
  assert.match(css, /\.detail-card-poster\s*\{\s*width: 4rem;\s*height: 6rem;/);
  assert.match(
    css,
    /\.detail-card-poster\s*\{\s*width: 5rem;\s*height: 7\.5rem;/
  );
  assert.match(
    sharedCss,
    /--detail-heading-gap: var\(--card-spacing\);/
  );
  assert.match(origThemeCss, /--interface-section-gap: 1\.5rem;/);
  assert.match(ngjThemeCss, /--interface-section-gap: 0\.75rem;/);
  assert.match(
    css,
    /\.detail-card-heading-spacing\s*\{\s*margin-top: var\(--detail-heading-gap\)/
  );
  assert.doesNotMatch(css, /\.detail-card-poster\s*\{[^}]*height: auto/);
  assert.match(
    read('../components/IssueList/IssueItem/index.tsx'),
    /detail-card-poster/
  );
  assert.match(
    read('../components/IssueDetails/IssueMediaSummary.tsx'),
    /detail-card-poster/
  );
});

test('detail row geometry follows each theme and allows content-driven expansion', () => {
  assert.match(sharedCss, /--detail-row-height: var\(--interface-detail-row-height\);/);
  assert.match(sharedCss, /--detail-row-gap: var\(--interface-detail-row-gap\);/);
  assert.match(origThemeCss, /--interface-detail-row-height: 1rem;/);
  assert.match(ngjThemeCss, /--interface-detail-row-height: 1\.125rem;/);
  assert.match(origThemeCss, /--interface-detail-row-gap: 0\.25rem;/);
  assert.match(ngjThemeCss, /--interface-detail-row-gap: 0\.5rem;/);
  assert.match(
    css,
    /grid-auto-rows: minmax\(var\(--detail-row-height\), auto\)/
  );
  assert.match(css, /row-gap: var\(--detail-row-gap\)/);
  assert.match(css, /line-height: var\(--detail-row-height\)/);
  assert.match(
    css,
    /\.media-detail-rows dt,[^{]+\{\s*margin-block: 0;\s*min-height: var\(--detail-row-height\)/
  );
  assert.doesNotMatch(css, /\.media-detail-rows\s*\{[^}]*max-height:/);
});

const cards = [
  'IssueList/IssueItem/index.tsx',
  'IssueDetails/IssueMediaSummary.tsx',
  'MediaDetails/MovieSummaryCard.tsx',
  'TvDetails/SeriesDetailsLayout.tsx',
  'BookDetails/BookDetailsLayout.tsx',
  'MusicDetails/MusicDetailsLayout.tsx',
  'Blocklist/index.tsx',
  'Association/AssociationDetailCard.tsx',
  ...['Movie', 'Tv', 'Book', 'Music'].map(
    (type) => `RequestModal/${type}RequestModal.tsx`
  ),
];
test('media summaries retain shared paired tables and fourth-row genres across migrated roles', () => {
  for (const file of [
    'MediaDetails/MovieSummaryCard.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'BookDetails/BookDetailsLayout.tsx',
    'MusicDetails/MusicDetailsLayout.tsx',
  ]) {
    const source = read(`../components/${file}`);
    if (file.startsWith('TvDetails')) {
      assert.match(source, /card-table detail-paired-columns/);
      assert.match(source, /data-table-layout="series-title-details-table"/);
      assert.match(
        source,
        /className="card-table-value"\s+data-wrap="true"\s+data-testid="media-details-genres"/
      );
      const rows = [];
      postcss.parse(css).walkRules((rule) => {
        if (
          !rule.selectors.includes(
            '.card-table.detail-paired-columns > dd:nth-of-type(4)'
          )
        )
          return;
        for (const node of rule.nodes ?? [])
          if (node.type === 'decl' && node.prop === 'grid-row')
            rows.push(node.value);
      });
      assert.deepEqual(
        rows,
        ['4'],
        'semantic genre values retain the fourth shared row'
      );
    } else {
      assert.match(source, /media-detail-rows detail-paired-columns/);
      assert.match(source, /card:row-start-4/);
    }
    assert.doesNotMatch(source, /detail-paired-simple-columns/);
  }
});
for (const file of cards) {
  test(`${file} uses shared rows without extra fourth-row margins`, () => {
    const source = read(`../components/${file}`);
    if (file === 'RequestModal/TvRequestModal.tsx') {
      verifyNativeRequestRows(source, css);
      return;
    }
    assert.match(
      source,
      file.startsWith('TvDetails') ? /card-table/ : /media-detail-rows/
    );
    assert.match(source, /detail-card-heading-spacing/);
    for (const line of source.split('\n')) {
      if (line.includes('card:row-start-4'))
        assert.doesNotMatch(line, /\bmt-0\.5\b/);
      if (line.includes('grid-cols-[max-content_minmax(0,1fr)]')) {
        assert.match(line, /media-detail-rows/);
        assert.doesNotMatch(line, /gap-y-|leading-[45]/);
      }
    }
  });
}

test('collection and advanced summaries share the global title gap', () => {
  for (const file of [
    'CollectionDetails/CollectionSummaryCard.tsx',
    'RequestModal/AdvancedRequester/index.tsx',
  ]) {
    assert.match(read(`../components/${file}`), /detail-card-heading-spacing/);
  }
  assert.doesNotMatch(css, /\.collection-summary-table\s*\{[^}]*mt-4/);
  assert.match(
    css,
    /\.detail-card-heading-after\s*\{\s*margin-bottom: var\(--detail-heading-gap\)/
  );
  for (const file of [
    'MovieDetails/MovieDetailsLayout.tsx',
    'TvDetails/SeriesDetailsLayout.tsx',
    'BookDetails/BookDetailsLayout.tsx',
    'MusicDetails/MusicDetailsLayout.tsx',
  ]) {
    const source = read(`../components/${file}`);
    assert.match(source, /detail-card-heading-after/);
    assert.doesNotMatch(source, /media-inset-heading mb-3/);
  }
});

test('native request row verification rejects missing roles and broken effective CSS', () => {
  const source = read('../components/RequestModal/TvRequestModal.tsx');
  for (const [before, after, diagnostic] of [
    [
      'className="card-table detail-paired-columns"',
      'className="detail-paired-columns"',
      /shared native row owner/,
    ],
    [
      'detail-card-heading-spacing detail-three-column-grid',
      'detail-three-column-grid',
      /shared heading gap/,
    ],
    ['data-wrap="true"', 'data-wrap="false"', /fourth-row value wraps/],
  ]) {
    const broken = source.replace(before, after);
    assert.notEqual(broken, source);
    assert.throws(() => verifyNativeRequestRows(broken, css), diagnostic);
  }
  const brokenRoot = postcss.parse(css);
  brokenRoot.walkRules((rule) => {
    if (rule.selectors.includes('.card-table'))
      rule.walkDecls('grid-auto-rows', (decl) => {
        decl.value = '1rem';
      });
  });
  const brokenCss = brokenRoot.toString();
  assert.notEqual(brokenCss, css);
  assert.throws(
    () => verifyNativeRequestRows(source, brokenCss),
    /grid-auto-rows retains its shared owner/
  );
});

test('album and book supplemental details do not repeat summary fields', () => {
  for (const [file, id, removed, retained] of [
    [
      'MusicDetails/MusicDetailsLayout.tsx',
      'music-additional-details',
      ['status', 'releaseDate', 'albumType', 'runtime', 'trackCount', 'artist'],
      ['musicBrainz', 'artistType', 'origin'],
    ],
    [
      'BookDetails/BookDetailsLayout.tsx',
      'book-additional-details',
      ['firstPublished', 'pages', 'editions', 'author'],
      ['publisher', 'edition', 'openLibrary', 'isbnCandidates'],
    ],
  ]) {
    const source = read(`../components/${file}`);
    const details = source.slice(source.indexOf(`id="${id}"`));
    for (const field of removed)
      assert.ok(
        !details.includes(`messages.${field})`),
        `${file}: duplicate ${field}`
      );
    for (const field of retained)
      assert.ok(
        details.includes(`messages.${field})`),
        `${file}: missing ${field}`
      );
    assert.equal((details.match(/<dl /g) ?? []).length, 3);
  }
});

const verifySeriesDisclosurePlacement = (source) => {
  const nodes = elements(source);
  const summary = nodes.find((node) => hasRole(node, 'detail-summary-card'));
  const row = nodes.find((node) => tag(node) === 'ReorderableDisclosureRow');
  const panels = nodes.find((node) => tag(node) === 'OrderedDisclosurePanels');
  assert.ok(
    summary && row && panels,
    'series retains summary, disclosure controls and ordered panels'
  );
  assert.ok(
    summary.end < row.getStart() && row.end < panels.getStart(),
    'series controls and panels follow the summary'
  );
  assert.equal(
    attribute(row, 'order'),
    attribute(panels, 'order'),
    'controls and panels consume the same committed order'
  );
  assert.ok(attribute(row, 'order'), 'disclosures have a committed order');
  const overview = nodes.find(
    (node) =>
      inside(node, row) &&
      tag(node) === 'DetailDisclosureButton' &&
      attribute(node, 'key') === 'overview'
  );
  assert.ok(
    overview && attribute(overview, 'controls'),
    'overview control targets an identified panel'
  );
  const panel = nodes.find(
    (node) =>
      inside(node, panels) &&
      attribute(node, 'id') === attribute(overview, 'controls')
  );
  assert.ok(overview && panel, 'overview control targets its ordered panel');
  assert.ok(
    nodes.some(
      (node) =>
        inside(node, panels) &&
        tag(node) === 'Fragment' &&
        attribute(node, 'key') === attribute(overview, 'key') &&
        inside(panel, node)
    ),
    'overview panel shares its control reorder key'
  );
  assert.match(panel.getText(), /data\.tagline/);
  assert.match(panel.getText(), /data\.overview/);
  assert.equal(
    (source.match(/data\.overview\b/g) ?? []).length,
    1,
    'synopsis has one disclosure owner'
  );
  assert.ok(
    nodes.some(
      (node) =>
        tag(node) === 'SeriesSeasonEpisodeBrowser' && inside(node, panels)
    ),
    'series browser remains in the ordered panel group'
  );
};

test('accepted series Overview shares disclosure ordering while movie overview precedes its disclosures', () => {
  verifySeriesDisclosurePlacement(
    read('../components/TvDetails/SeriesDetailsLayout.tsx')
  );
  for (const [file, followingContent] of [
    ['MovieDetails/MovieDetailsLayout.tsx', 'media-rating-row'],
  ]) {
    const source = read(`../components/${file}`);
    const summary = source.indexOf(
      file.startsWith('TvDetails') ? 'detail-summary-card' : '<MovieSummaryCard'
    );
    const overview = source.indexOf('messages.overview', summary);
    const disclosures = source.indexOf(
      file.startsWith('TvDetails')
        ? '<ReorderableDisclosureRow'
        : 'media-detail-disclosure-row',
      overview
    );
    const following = source.indexOf(followingContent, disclosures);

    assert.ok(summary >= 0, file);
    assert.ok(summary < overview, file);
    assert.ok(overview < disclosures, file);
    assert.ok(disclosures < following, file);
  }
});

test('series Overview verification rejects mismatched order, detached panels and duplicate synopsis', () => {
  const source = read('../components/TvDetails/SeriesDetailsLayout.tsx');
  for (const [before, after, diagnostic] of [
    [
      '<OrderedDisclosurePanels order={disclosureOrder}>',
      '<OrderedDisclosurePanels order={otherOrder}>',
      /same committed order/,
    ],
    [
      '<Fragment key="overview">',
      '<Fragment key="detached">',
      /control reorder key/,
    ],
    [
      '{data.overview ||',
      '{data.overview || data.overview ||',
      /one disclosure owner/,
    ],
  ]) {
    const broken = source.replace(before, after);
    assert.notEqual(broken, source);
    assert.throws(() => verifySeriesDisclosurePlacement(broken), diagnostic);
  }
});

test('heading gap check rejects a restored independent optical spacing value', () => {
  const broken = sharedCss.replace(
    '--detail-heading-gap: var(--card-spacing);',
    '--detail-heading-gap: 14px;'
  );
  assert.notEqual(broken, sharedCss);
  assert.throws(
    () =>
      assert.match(
        broken,
        /--detail-heading-gap: var\(--card-spacing\);/,
        'heading gap consumes the card spacing owner'
      ),
    /heading gap consumes the card spacing owner/
  );
});

test('series request season and episode tables use equal-width columns', () => {
  assert.match(
    read('../components/Common/SeriesSeasonEpisodeSelector.tsx'),
    /grid min-w-0 gap-2 sm:grid-cols-2/
  );
});

test('button rows share card gaps without legacy modal margins', () => {
  const shared = css.match(
    /\.app-action-row,[^{]+\{\s*gap: var\(--card-spacing\);/
  )?.[0];
  assert.ok(shared);
  for (const selector of [
    'app-modal-actions',
    'media-detail-disclosure-row',
    'media-primary-action-row',
    'request-status-action-row',
    'settings-card-actions',
    'settings-page-actions',
  ]) {
    assert.ok(shared.includes(selector), selector);
  }
  const modal = read('../components/Common/Modal/index.tsx');
  assert.match(modal, /app-modal-actions/);
  assert.doesNotMatch(modal, /className="ml-3/);
  for (const file of ['ManageSlideOver', 'ExternalMediaManageSlideOver']) {
    assert.doesNotMatch(
      read(`../components/${file}/index.tsx`),
      /!mt-\[5px\]|space-y-\[5px\]/
    );
  }
});
