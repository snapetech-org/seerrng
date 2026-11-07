import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(path.resolve('package.json'));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { IntlProvider } = require('react-intl');
const { JSDOM } = require('jsdom');
const modules = new Map();

// Execute the real rating transforms, safe-URL gate and components in memory.
// Only visual SVG assets and the tooltip shell are replaced; no requests run.
const loadModule = (file) => {
  if (modules.has(file)) return modules.get(file);
  const compiledModule = { exports: {} };
  modules.set(file, compiledModule.exports);
  const javascript = ts.transpileModule(
    fs.readFileSync(path.resolve(file), 'utf8'),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: file,
    }
  ).outputText;
  const imports = (id) => {
    if (id === '@app/hooks/useUpstreamTheme') return () => false;
    if (id === '@app/components/Common/Tooltip') {
      return ({ children }) => children;
    }
    if (id.startsWith('@app/assets/') && id.endsWith('.svg')) {
      return (props) =>
        React.createElement('svg', { ...props, 'data-test-icon': id });
    }
    if (id.startsWith('@app/')) {
      const stem = path.join('src', id.slice('@app/'.length));
      const source = [stem + '.tsx', stem + '.ts'].find((candidate) =>
        fs.existsSync(path.resolve(candidate))
      );
      assert.ok(source, 'Unresolved test dependency: ' + id);
      return loadModule(source);
    }
    assert.ok(
      ['react', 'react/jsx-runtime', 'react-intl'].includes(id),
      'Unexpected runtime dependency: ' + id
    );
    return require(id);
  };
  new Function('require', 'module', 'exports', javascript)(
    imports,
    compiledModule,
    compiledModule.exports
  );
  modules.set(file, compiledModule.exports);
  return compiledModule.exports;
};

const { default: VideoRatings, getVideoRatingItems } = loadModule(
  'src/components/MediaDetails/VideoRatings.tsx'
);
const { default: CollectionRatings } = loadModule(
  'src/components/CollectionDetails/CollectionRatings.tsx'
);
const sources = ['critics', 'audience', 'imdb', 'metacritic', 'trakt', 'tmdb'];
const base = { mediaType: 'movie', id: 42 };
const full = {
  ...base,
  voteAverage: 8.1,
  voteCount: 12,
  ratings: {
    rt: {
      criticsScore: 74,
      audienceScore: 92,
      url: 'https://www.rottentomatoes.com/m/example',
    },
    imdb: { criticsScore: 7.4, url: 'https://www.imdb.com/title/tt123/' },
    mdblist: { metacriticRating: 68, traktRating: 8.3 },
  },
};

const render = (Component, props) => {
  const html = renderToStaticMarkup(
    React.createElement(
      IntlProvider,
      { locale: 'en' },
      React.createElement(Component, props)
    )
  );
  const fragment = JSDOM.fragment(html);
  const slots = [...fragment.querySelectorAll('.media-rating-link')];
  return {
    fragment,
    slots,
    values: slots.map(
      (slot) => slot.querySelector('.media-rating-value').textContent
    ),
  };
};

const video = (props) => {
  const result = render(VideoRatings, props);
  assert.deepEqual(
    getVideoRatingItems(props).map((item) => item.source),
    sources
  );
  assert.equal(result.slots.length, 6);
  assert.ok(
    result.slots.every((slot) => slot.dataset.ratingLayout === 'fixed')
  );
  assert.ok(result.slots[0].querySelector('svg[data-test-icon*="rt_"]'));
  assert.ok(result.slots[1].querySelector('svg[data-test-icon*="rt_aud_"]'));
  assert.ok(result.slots[2].querySelector('svg[data-test-icon$="imdb.svg"]'));
  assert.equal(
    result.slots[3].querySelector('.media-rating-brand').textContent,
    'MC'
  );
  assert.ok(result.slots[4].querySelector('svg[data-test-icon$="trakt.svg"]'));
  assert.ok(
    result.slots[5].querySelector('svg[data-test-icon$="tmdb_logo.svg"]')
  );
  return result;
};

test('absent video ratings retain six provider slots and exact unknown placeholders', () => {
  const result = video(base);
  assert.deepEqual(result.values, Array(6).fill('--'));
  assert.equal(result.fragment.querySelectorAll('a').length, 0);
});

test('partial and complete video ratings keep the same source order and real values', () => {
  const partial = video({ ...base, ratings: { rt: { criticsScore: 42 } } });
  assert.deepEqual(partial.values, ['42%', '--', '--', '--', '--', '--']);
  const complete = video(full);
  assert.deepEqual(complete.values, ['74%', '92%', '7.4', '68%', '8.3', '81%']);
  for (const link of complete.fragment.querySelectorAll('a')) {
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noreferrer');
  }
});

test('initial loading reserves all slots while revalidation preserves known video scores', () => {
  const absent = video({ ...base, loading: true });
  assert.deepEqual(absent.values, Array(6).fill('--'));
  assert.ok(
    absent.slots.every((slot) =>
      /loading/i.test(slot.getAttribute('aria-label'))
    )
  );
  const partial = video({
    ...base,
    loading: true,
    ratings: { rt: { criticsScore: 42 } },
  });
  assert.deepEqual(partial.values, ['42%', '--', '--', '--', '--', '--']);
  assert.doesNotMatch(partial.slots[0].getAttribute('aria-label'), /loading/i);
  const complete = video({ ...full, loading: true });
  assert.deepEqual(complete.values, ['74%', '92%', '7.4', '68%', '8.3', '81%']);
});

test('zero is a valid score, but a TMDB score without votes remains unknown', () => {
  const zeros = {
    ...base,
    voteAverage: 0,
    voteCount: 1,
    ratings: {
      rt: { criticsScore: 0, audienceScore: 0 },
      imdb: { criticsScore: 0 },
      mdblist: { metacriticRating: 0, traktRating: 0 },
    },
  };
  assert.deepEqual(video(zeros).values, ['0%', '0%', '0.0', '0%', '0.0', '0%']);
  assert.equal(video({ ...zeros, voteCount: 0 }).values[5], '--');
});

test('nonfinite and out-of-range scores never render fabricated numeric values', () => {
  for (const invalid of [NaN, Infinity, -1, 101]) {
    const result = video({
      ...base,
      voteAverage: invalid,
      voteCount: 1,
      ratings: {
        rt: { criticsScore: invalid, audienceScore: invalid },
        imdb: { criticsScore: invalid },
        mdblist: { metacriticRating: invalid, traktRating: invalid },
      },
    });
    assert.deepEqual(result.values, Array(6).fill('--'));
    assert.equal(result.fragment.querySelectorAll('a').length, 0);
  }
  assert.deepEqual(
    video({
      ...base,
      voteAverage: 10.1,
      voteCount: 1,
      ratings: { imdb: { criticsScore: 10.1 }, mdblist: { traktRating: 10.1 } },
    }).values,
    Array(6).fill('--')
  );
});

test('invalid primary scores use valid metadata fallback without losing valid zero', () => {
  const result = video({
    ...base,
    ratings: {
      rt: { criticsScore: NaN, audienceScore: 101 },
      imdb: { criticsScore: -1 },
      mdblist: { rtRating: 0, rtUserRating: 88, imdbRating: 7.8 },
    },
  });
  assert.deepEqual(result.values, ['0%', '88%', '7.8', '--', '--', '--']);
});

test('TMDB links match the actual movie or TV media type', () => {
  for (const mediaType of ['movie', 'tv']) {
    const result = video({ ...full, mediaType });
    assert.equal(
      result.slots[5].getAttribute('href'),
      `https://www.themoviedb.org/${mediaType}/42`
    );
  }
});

test('unsafe provider links never become clickable and validated IMDb IDs can link', () => {
  for (const unsafe of [
    'javascript:alert(1)',
    '//attacker.example/path',
    'https://user:password@example.com/',
    'https://example.com/path\nnext',
  ]) {
    const result = video({
      ...full,
      ratings: {
        ...full.ratings,
        rt: { ...full.ratings.rt, url: unsafe },
        imdb: { ...full.ratings.imdb, url: unsafe },
      },
    });
    assert.ok(
      result.slots.slice(0, 3).every((slot) => slot.tagName === 'SPAN')
    );
    assert.deepEqual(result.values, ['74%', '92%', '7.4', '68%', '8.3', '81%']);
  }
  const fallback = video({
    ...base,
    ratings: { mdblist: { imdbRating: 7.4, imdbId: 'tt123' } },
  });
  assert.equal(
    fallback.slots[2].getAttribute('href'),
    'https://www.imdb.com/title/tt123'
  );
  const malformed = video({
    ...base,
    ratings: { mdblist: { imdbRating: 7.4, imdbId: 'tt123/evil' } },
  });
  assert.equal(malformed.slots[2].tagName, 'SPAN');
});

test('collection defaults remain distinct from reserved video placeholder behavior', () => {
  const ratings = getVideoRatingItems(full);
  const loading = render(CollectionRatings, { ratings, loading: true });
  assert.deepEqual(loading.values, Array(6).fill('…'));
  assert.equal(loading.fragment.querySelectorAll('a').length, 0);
  const unknown = render(CollectionRatings, {
    ratings: getVideoRatingItems(base),
  });
  assert.deepEqual(unknown.values, Array(6).fill('—'));
  assert.ok(
    unknown.slots.every((slot) => !slot.hasAttribute('data-rating-layout'))
  );
});
