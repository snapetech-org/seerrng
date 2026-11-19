import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  extractPageMetadata,
  fetchSharedPage,
} from '@server/lib/resolve/fetchSafe';
import {
  pickAutoSelected,
  scoreCandidate,
  titleSimilarity,
} from '@server/lib/resolve/match';
import {
  classifyLink,
  findIsbns,
  findUrls,
  parseTextList,
  parseTitleLine,
} from '@server/lib/resolve/parsers';
import { sniffImageType } from '@server/lib/resolve/vision';

describe('text list parsing', () => {
  it('splits a bulleted and numbered message into titles', () => {
    const items = parseTextList(
      '1. Dune by Frank Herbert\n- Project Hail Mary (2021)\n* The Hobbit'
    );
    assert.deepEqual(
      items.map((item) => [item.query, item.creator, item.year]),
      [
        ['Dune', 'Frank Herbert', undefined],
        ['Project Hail Mary', undefined, 2021],
        ['The Hobbit', undefined, undefined],
      ]
    );
  });

  it('splits a single comma line only when every part is a short title', () => {
    assert.equal(parseTextList('Dune, Neuromancer, Snow Crash').length, 3);
    assert.equal(
      parseTextList(
        'I loved this book, it was great and I stayed up all night reading the whole thing twice in a row'
      ).length,
      1
    );
  });

  it('keeps a type hint and removes duplicates', () => {
    const [first] = parseTextList('Arrival (movie)\nArrival (movie)');
    assert.equal(first.typeHint, 'movie');
    assert.equal(parseTextList('Arrival (movie)\nArrival (movie)').length, 1);
  });

  it('ignores links when reading titles', () => {
    assert.equal(parseTextList('https://example.com/x').length, 0);
    assert.deepEqual(
      findUrls('see https://a.example/x and (https://b.example/y).'),
      ['https://a.example/x', 'https://b.example/y']
    );
  });

  it('parses a title line with a creator', () => {
    assert.equal(
      parseTitleLine('Neuromancer — William Gibson')?.creator,
      'William Gibson'
    );
  });
});

describe('ISBN detection', () => {
  it('finds valid ISBN-13 and ISBN-10 values and ignores bad checksums', () => {
    assert.deepEqual(findIsbns('ISBN 978-0-547-92822-7 and 0-306-40615-2'), [
      '9780547928227',
      '9780306406157',
    ]);
    assert.deepEqual(findIsbns('978-0-547-92822-8'), []);
  });
});

describe('link classification', () => {
  it('recognises the sources SeerrNG reads directly', () => {
    assert.deepEqual(classifyLink('https://www.imdb.com/title/tt0111161/'), {
      provider: 'imdb',
      id: 'tt0111161',
    });
    assert.equal(
      classifyLink('https://store.steampowered.com/app/620/').id,
      '620'
    );
    assert.equal(
      classifyLink('https://www.themoviedb.org/movie/550-fight-club').type,
      'movie'
    );
    assert.equal(
      classifyLink('https://open.spotify.com/track/abc').provider,
      'music-stream'
    );
    assert.equal(classifyLink('https://example.org/page').provider, 'generic');
  });

  it('requires complete provider hostnames before classifying a link', () => {
    for (const url of [
      'https://evilimdb.com/title/tt0111161/',
      'https://www.imdb.com.attacker.test/title/tt0111161/',
      'https://letterboxd.com.attacker.test/film/example/',
      'https://goodreads.com.attacker.test/book/show/1',
      'https://amazon.com.attacker.test/dp/0123456789',
      'https://audible.attacker.test/pd/example/0123456789',
    ]) {
      assert.equal(classifyLink(url).provider, 'generic', url);
    }

    assert.equal(
      classifyLink('https://www.amazon.co.uk/dp/0123456789').provider,
      'amazon'
    );
    assert.equal(
      classifyLink('https://www.audible.com.au/pd/example/0123456789').provider,
      'audible'
    );
  });
});

describe('matching', () => {
  it('scores exact titles at 1 and unrelated titles low', () => {
    assert.equal(titleSimilarity('The Hobbit', 'hobbit'), 1);
    assert.ok(titleSimilarity('The Hobbit', 'Moby Dick') < 0.3);
  });

  it('rewards a matching creator and year', () => {
    const base = scoreCandidate({ query: 'Dune' }, { title: 'Dune' });
    const withCreator = scoreCandidate(
      { query: 'Dune', creator: 'Frank Herbert' },
      { title: 'Dune', creator: 'Frank Herbert' }
    );
    assert.ok(withCreator >= base * 0.99);
  });

  it('auto-selects only a clear winner', () => {
    assert.equal(pickAutoSelected([1, 0.4]), 0);
    assert.equal(pickAutoSelected([0.95, 0.9]), undefined);
    assert.equal(pickAutoSelected([0.7]), undefined);
    assert.equal(pickAutoSelected([]), undefined);
  });
});

describe('page metadata', () => {
  it('reads JSON-LD before Open Graph', () => {
    const html = `<head><meta property="og:title" content="Fallback"/>
      <script type="application/ld+json">{"@type":"Book","name":"The Hobbit","author":{"name":"J.R.R. Tolkien"},"isbn":"978-0-547-92822-7","datePublished":"1937-09-21"}</script></head>`;
    const meta = extractPageMetadata(html);
    assert.equal(meta.title, 'The Hobbit');
    assert.equal(meta.creator, 'J.R.R. Tolkien');
    assert.equal(meta.year, 1937);
    assert.equal(meta.type, 'Book');
  });

  it('falls back to the page title', () => {
    assert.equal(
      extractPageMetadata('<title>Portal 2 on Steam</title>').title,
      'Portal 2 on Steam'
    );
  });

  it('reads only metadata attributes and preserves the first matching value', () => {
    const metadata = extractPageMetadata(`
      <meta data-property="og:title" content="Ignored">
      <meta content="Reader's Guide" PROPERTY='OG:TITLE'>
      <meta property="og:title" content="Later title">
      <meta name="isbn" content="978-0-547-92822-7">
    `);
    assert.equal(metadata.title, "Reader's Guide");
    assert.equal(metadata.isbn, '9780547928227');
  });

  it('decodes HTML entities once and preserves invalid numeric references', () => {
    const metadata = extractPageMetadata(
      '<meta property="og:title" content="&amp;lt;script&amp;gt; &#x110000;">'
    );
    assert.equal(metadata.title, '&lt;script&gt; &#x110000;');
  });
});

describe('safety', () => {
  it('sniffs image types from bytes, not from a declared type', () => {
    assert.equal(
      sniffImageType(Buffer.from('89504e470d0a1a0a0000000d', 'hex')),
      'image/png'
    );
    assert.equal(
      sniffImageType(Buffer.from('ffd8ffe000104a4649460001', 'hex')),
      'image/jpeg'
    );
    assert.equal(
      sniffImageType(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
      ),
      undefined
    );
    assert.equal(
      sniffImageType({ length: 12 } as unknown as Buffer),
      undefined
    );
    assert.equal(sniffImageType('untrusted image input'), undefined);
    assert.equal(sniffImageType(new Array(12).fill(0)), undefined);
  });

  it('refuses private and non-http addresses', async () => {
    await assert.rejects(fetchSharedPage('http://127.0.0.1/secret'));
    await assert.rejects(fetchSharedPage('file:///etc/passwd'));
    await assert.rejects(
      fetchSharedPage('http://169.254.169.254/latest/meta-data')
    );
  });
});
