import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import postcss from 'postcss';
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const propertyValues = (stylesheet, selector, property) => {
  const values = [];
  postcss.parse(stylesheet).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    for (const node of rule.nodes ?? [])
      if (node.type === 'decl' && node.prop === property)
        values.push(node.value.replace(/\s+/g, ' '));
  });
  return values;
};
const verifyPairedTracks = (stylesheet) => {
  for (const role of ['.media-detail-rows', '.card-table']) {
    const selector = `.detail-paired-column-span ${role}.detail-paired-columns`;
    assert.deepEqual(
      propertyValues(stylesheet, selector, 'grid-column'),
      ['1 / -1'],
      'paired table spans its parent tracks'
    );
    assert.deepEqual(
      propertyValues(stylesheet, selector, 'grid-template-columns'),
      ['subgrid'],
      'paired table inherits parent tracks'
    );
  }
};
test('shared middle groups center as one unit and stretch across their allotted rows', () => {
  const css = read('./globals.css');
  assert.match(
    css,
    /\.detail-paired-columns > \.media-detail-column-divider,\s*\.detail-paired-simple-columns > \.media-detail-column-divider,[\s\S]*?width: max-content;\s*max-width: 100%;\s*justify-self: center;\s*align-self: stretch;/
  );
  assert.match(
    css,
    /\.detail-three-column-grid:not\(:has\(> \.detail-paired-column-span\)\)\s*> \.media-detail-column-divider:nth-child\(2\)/
  );
});
const files = [
  'MediaDetails/MovieSummaryCard.tsx',
  'TvDetails/SeriesDetailsLayout.tsx',
  'BookDetails/BookDetailsLayout.tsx',
  'MusicDetails/MusicDetailsLayout.tsx',
  'Blocklist/index.tsx',
  'IssueDetails/IssueMediaSummary.tsx',
  'IssueList/IssueItem/index.tsx',
  'Requests/index.tsx',
  ...['Book', 'Movie', 'Music', 'Tv'].map(
    (x) => `RequestModal/${x}RequestModal.tsx`
  ),
];
for (const file of files)
  test(`${file} shares proportional columns instead of a fixed first value width`, () => {
    const source = read(`../components/${file}`);
    assert.match(source, /detail-paired-column-span/);
    assert.match(source, /detail-paired-columns/);
    for (const line of source
      .split('\n')
      .filter(
        (line) =>
          line.includes('className=') && line.includes('detail-paired-columns')
      )) {
      assert.doesNotMatch(
        line,
        /grid-cols-\[|gap-x-/,
        'Local utilities must not override the shared column tracks or gaps'
      );
    }
    assert.doesNotMatch(source, /card:grid-cols-\[max-content_0\.75rem_6rem/);
  });
test('paired spans share intrinsic parent tracks without fixed proportions', () => {
  const css = read('./globals.css');
  verifyPairedTracks(css);
  const span = postcss
    .parse(css)
    .nodes.flatMap((node) => node.nodes ?? [])
    .find(
      (node) =>
        node.type === 'rule' &&
        node.selectors?.includes('.detail-paired-column-span')
    );
  assert.ok(span);
  for (const declaration of span.nodes.filter(
    (node) => node.type === 'decl' && /^padding(?:-|$)/.test(node.prop)
  ))
    assert.equal(
      declaration.value,
      '0',
      'paired spans must not add padding to shared parent tracks'
    );
  assert.match(
    css,
    /\.collection-summary-table\s*\{\s*grid-template-columns:\s*max-content minmax\(0, 1fr\)\s+fit-content\(\s*var\(--detail-last-column-limit\)\s*\)/
  );
  assert.match(
    read('../components/MusicDetails/MusicDetailsLayout.tsx'),
    /detail-paired-column-span min-w-0/
  );
});

test('paired table verification rejects copied tracks instead of shared subgrid', () => {
  const root = postcss.parse(read('./globals.css'));
  let changed = 0;
  root.walkRules((rule) => {
    if (
      !rule.selectors.includes(
        '.detail-paired-column-span .card-table.detail-paired-columns'
      )
    )
      return;
    rule.walkDecls('grid-template-columns', (decl) => {
      decl.value = '1fr 1fr';
      changed++;
    });
  });
  assert.equal(changed, 1);
  assert.throws(
    () => verifyPairedTracks(root.toString()),
    /paired table inherits parent tracks/
  );
});

test('all three-column details layouts use the shared responsive grid', () => {
  for (const file of [
    ...files,
    'MovieDetails/MovieDetailsLayout.tsx',
    'MusicDetails/MusicDetailsLayout.tsx',
    'Association/AssociationDetailCard.tsx',
  ]) {
    const source = read(`../components/${file}`);
    assert.match(source, /detail-three-column-grid/, file);
    assert.doesNotMatch(source, /card:grid-cols-3/, file);
  }
  const css = read('./globals.css');
  assert.doesNotMatch(css, /--detail-(first|middle|final)-column-share/);
  assert.ok(
    propertyValues(
      css,
      '.detail-three-column-grid',
      '--card-table-default-details-columns'
    ).includes('minmax(0, 1fr)'),
    'narrow details stack into one track'
  );
  assert.ok(
    propertyValues(
      css,
      '.detail-three-column-grid',
      '--card-table-default-details-columns'
    ).some((value) =>
      /fit-content\(\s*var\(--detail-first-column-limit\)\s*\) minmax\(0, 1fr\) fit-content\(var\(--detail-last-column-limit\)\)/.test(
        value
      )
    ),
    'wide details retain intrinsic side tracks'
  );
  assert.ok(
    propertyValues(
      css,
      '.movie-summary-fields-with-ratings',
      '--card-table-default-details-columns'
    ).includes(
      'max-content 0.75rem fit-content(var(--detail-first-value-limit)) 0.75rem minmax(0, 1fr) fit-content(var(--detail-last-column-limit))'
    ),
    'paired summaries retain shared six-track defaults'
  );
  for (const selector of [
    '.detail-three-column-grid',
    '.movie-summary-fields-with-ratings',
  ])
    assert.ok(
      propertyValues(css, selector, 'grid-template-columns').some(
        (value) =>
          value.startsWith('var(') &&
          value.includes('--card-table-details-columns')
      ),
      'details consume their independent configuration'
    );
  assert.match(
    css,
    /\.detail-paired-simple-columns\s*\{[^}]*grid-template-columns: subgrid;/
  );
  for (const file of files) {
    for (const line of read(`../components/${file}`)
      .split('\n')
      .filter(
        (line) =>
          line.includes('className=') &&
          line.includes('detail-paired-column-span')
      )) {
      assert.doesNotMatch(
        line,
        /card:col-span-2/,
        'Local spans cannot override the six shared parent tracks'
      );
    }
  }
});

test('details titles share their optical alignment without local negative margins', () => {
  for (const file of files
    .filter((file) => !file.includes('MovieSummaryCard'))
    .concat([
      'MusicDetails/MusicDetailsLayout.tsx',
      'Association/AssociationDetailCard.tsx',
      'RequestModal/CollectionRequestModal.tsx',
    ])) {
    const source = read(`../components/${file}`);
    if (file === 'RequestModal/CollectionRequestModal.tsx') {
      assert.match(
        source,
        /<CollectionSummaryCard/,
        'collection requests retain their shared summary consumer'
      );
      const summary = read(
        '../components/CollectionDetails/CollectionSummaryCard.tsx'
      );
      assert.match(
        summary,
        /collection-summary-title/,
        'shared collection summary retains its title role'
      );
      for (const line of summary
        .split('\n')
        .filter((line) => line.includes('collection-summary-title')))
        assert.doesNotMatch(
          line,
          /-mt-/,
          'shared collection title has no local optical offset'
        );
      continue;
    }
    assert.match(source, /detail-summary-title/, file);
    for (const line of source
      .split('\n')
      .filter((line) => line.includes('detail-summary-title')))
      assert.doesNotMatch(line, /-mt-/, file);
  }
});
test('collection defaults to HD and filters both playback buttons without a hidden default fallback', () => {
  const source = read('../components/CollectionDetails/index.tsx');
  assert.match(source, /useState<'hd' \| '4k'>\('hd'\)/);
  assert.match(source, /autoSelectAvailable=\{false\}/);
  assert.match(source, /collectionPartHasQuality\(part, playbackQuality\)/);
  assert.match(source, /collectionMediaIds=\{effectivePlaybackMediaIds\}/);
  assert.match(source, /mediaIds=\{effectivePlaybackMediaIds\}/);
  assert.doesNotMatch(source, /resolveCanonicalPlaybackSelection/);
});
test('collection trailer belongs to the first chronological member, not the selected playback member', () => {
  const source = read('../components/CollectionDetails/index.tsx');
  assert.match(source, /const firstPart = orderedParts\[0\]/);
  assert.match(
    source,
    /memberById\.get\(firstPart.id\)\?\.details\?\.relatedVideos/
  );
  assert.match(source, /buttonType="trailer"/);
});
