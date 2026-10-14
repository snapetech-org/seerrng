import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getSafeHref,
  getSafeHttpsHref,
  getSafeMarkdownHref,
  isExternalHref,
} from './safeUrl';

describe('safe browser URLs', () => {
  it('accepts declared external protocols and same-origin paths', () => {
    assert.strictEqual(
      getSafeHref('https://media.example/watch'),
      'https://media.example/watch'
    );
    assert.strictEqual(getSafeHref('plex://play/item'), 'plex://play/item');
    assert.strictEqual(getSafeHref('/movie/1'), '/movie/1');
    assert.strictEqual(getSafeHref('#details'), '#details');
    assert.strictEqual(isExternalHref('https://media.example/watch'), true);
  });

  it('rejects scripts, protocol-relative URLs, userinfo, and controls', () => {
    for (const href of [
      'javascript:alert(1)',
      '//attacker.example/path',
      'https://trusted.example@attacker.example/path',
      'https://user:password@example.com/path',
      'https://example.com/path\nnext',
      '/\\attacker.example/path',
      'https:\\attacker.example/path',
    ]) {
      assert.strictEqual(getSafeHref(href), undefined, href);
      assert.strictEqual(isExternalHref(href), false, href);
    }
  });

  it('allows only HTTPS or same-origin links in provider markdown', () => {
    assert.strictEqual(
      getSafeMarkdownHref('https://github.com/snapetech-org/seerrng'),
      'https://github.com/snapetech-org/seerrng'
    );
    assert.strictEqual(getSafeMarkdownHref('/docs/release'), '/docs/release');
    assert.strictEqual(getSafeMarkdownHref('#changes'), '#changes');
    assert.strictEqual(
      getSafeHttpsHref('HTTPS://GITHUB.COM/snapetech-org/seerrng'),
      'https://github.com/snapetech-org/seerrng'
    );

    for (const href of [
      'http://github.com/snapetech-org/seerrng',
      '//attacker.example/release',
      '/\\attacker.example/release',
      'javascript:alert(1)',
    ]) {
      assert.strictEqual(getSafeMarkdownHref(href), '', href);
      assert.strictEqual(getSafeHttpsHref(href), undefined, href);
    }
  });
});
