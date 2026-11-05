import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(
  new URL('../components/MediaDetails/seriesTreeData.ts', import.meta.url),
  'utf8'
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const compiled = { exports: {} };
new Function('exports', javascript)(compiled.exports);
const {
  buildSeriesTreeData,
  selectedTreeEpisodeIds,
  treeSelectionToPlaybackIds,
} = compiled.exports;

const seasons = [
  { seasonNumber: 1, episodeCount: 2 },
  { seasonNumber: 2, episodeCount: 1 },
];
const metadata = [
  {
    seasonNumber: 1,
    episodes: [
      { id: 101, episodeNumber: 1, name: 'First', airDate: '2023-07-23' },
      { id: 102, episodeNumber: 2, name: 'Second', airDate: '' },
    ],
  },
  {
    seasonNumber: 2,
    episodes: [{ id: 201, episodeNumber: 1, name: '' }],
  },
];
const catalog = {
  groups: [
    { index: 1, items: [{ index: 1, id: 'plex-s1e1' }] },
    { index: 2, items: [{ index: 1, id: 'plex-s2e1' }] },
  ],
};
const watched = {
  seasons: [
    { seasonNumber: 1, episodes: [{ episodeNumber: 1, watched: true }] },
    { seasonNumber: 2, episodes: [{ episodeNumber: 1, watched: false }] },
  ],
};
const build = (playback = catalog, episodeData = metadata, status = watched) =>
  buildSeriesTreeData(
    seasons,
    episodeData,
    playback,
    status,
    (number) => `Season ${String(number).padStart(2, '0')}`,
    'Untitled'
  );

test('tree availability and playback identity match season plus episode, not metadata IDs', () => {
  const data = build();
  assert.deepEqual(
    [...data.playbackIdsByEpisode],
    [
      [101, 'plex-s1e1'],
      [201, 'plex-s2e1'],
    ]
  );
  assert.equal(data.seasons[0].episodes[1].available, false);
  assert.equal(data.seasons[1].episodes[0].available, true);
  assert.equal(data.seasons[1].name, 'Season 02');
});

test('only mapped available episode IDs enter playback commands; duplicates are removed', () => {
  const data = build();
  assert.deepEqual(
    treeSelectionToPlaybackIds(
      data.playbackIdsByEpisode,
      [201, 102, 101, 101, 999]
    ),
    ['plex-s1e1', 'plex-s2e1']
  );
  assert.deepEqual(
    treeSelectionToPlaybackIds(data.playbackIdsByEpisode, []),
    []
  );
});

test('parent playback selection round-trips through the tree across collapsed seasons', () => {
  const data = build();
  const ids = selectedTreeEpisodeIds(data.playbackIdsByEpisode, ['plex-s2e1']);
  assert.deepEqual(ids, [201]);
  assert.deepEqual(treeSelectionToPlaybackIds(data.playbackIdsByEpisode, ids), [
    'plex-s2e1',
  ]);
});

test('quality changes use exact replacement catalog IDs and reject previous-quality IDs', () => {
  const data = build({
    groups: [{ index: 1, items: [{ index: 1, id: 'plex-4k-s1e1' }] }],
  });
  assert.deepEqual(
    selectedTreeEpisodeIds(data.playbackIdsByEpisode, ['plex-s1e1']),
    []
  );
  assert.deepEqual(
    treeSelectionToPlaybackIds(data.playbackIdsByEpisode, [101, 201]),
    ['plex-4k-s1e1']
  );
});

test('missing catalog and metadata never manufacture playable rows or lose known episode totals', () => {
  const data = build(undefined, []);
  // Passing undefined uses build's default argument; exercise the real absent catalog separately.
  const missing = buildSeriesTreeData(
    seasons,
    metadata,
    undefined,
    undefined,
    String,
    'Untitled'
  );
  assert.equal(missing.playbackIdsByEpisode.size, 0);
  assert.equal(missing.seasons[0].episodes[0].available, false);
  assert.equal(missing.seasons[0].episodes[0].watched, undefined);
  assert.equal(data.seasons[0].episodeCount, 2);
  assert.deepEqual(data.seasons[0].episodes, []);
});

test('release dates and watched/unknown status retain source truth', () => {
  const data = build();
  assert.equal(data.seasons[0].episodes[0].releaseDate, '2023-07-23');
  assert.equal(data.seasons[0].episodes[1].releaseDate, undefined);
  assert.equal(data.seasons[0].episodes[0].watched, true);
  assert.equal(data.seasons[0].episodes[1].watched, undefined);
  assert.equal(data.seasons[1].episodes[0].watched, false);
  assert.equal(data.seasons[1].episodes[0].name, 'Untitled');
});

test('source-file indicators survive projection without granting playback selection', () => {
  const source = { sourceType: 'sonarr', hd: true, fourK: false };
  const data = build(undefined, [
    {
      seasonNumber: 1,
      episodes: [
        {
          id: 101,
          episodeNumber: 1,
          name: 'File present',
          availabilitySources: [source],
        },
      ],
    },
  ]);
  assert.deepEqual(data.seasons[0].episodes[0].availabilitySources, [source]);
  // Explicitly pass an empty playback catalog: files do not grant playback.
  const unavailable = build({ groups: [] }, [
    {
      seasonNumber: 1,
      episodes: [
        {
          id: 101,
          episodeNumber: 1,
          name: 'File present',
          availabilitySources: [source],
        },
      ],
    },
  ]);
  assert.equal(unavailable.seasons[0].episodes[0].available, false);
  assert.equal(unavailable.playbackIdsByEpisode.size, 0);
});
