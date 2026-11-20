import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DiscoverCompanyData } from '@server/constants/discover';
import {
  isSafeDiscoverCompanyLogoPath,
  parseDiscoverCompanyList,
  readDiscoverCompanyList,
} from './discoverCompanyList';

const company = (id: number): DiscoverCompanyData => ({
  id,
  name: `Company ${id}`,
  logoPath: `/company-${id}.png`,
});

describe('Discover company list data', () => {
  for (const kind of ['network', 'studio'] as const) {
    it(`validates bounded ${kind} lists and preserves their order`, () => {
      const maximum = Array.from({ length: 50 }, (_, index) =>
        company(index + 1)
      );
      const parsed = parseDiscoverCompanyList(
        JSON.stringify([maximum[2], maximum[0]]),
        kind
      );
      assert.deepStrictEqual(parsed, {
        value: JSON.stringify([maximum[2], maximum[0]]),
      });
      assert.ok(
        'value' in parseDiscoverCompanyList(JSON.stringify(maximum), kind)
      );
      assert.ok(
        'error' in
          parseDiscoverCompanyList(
            JSON.stringify([...maximum, company(51)]),
            kind
          )
      );
      assert.deepStrictEqual(parseDiscoverCompanyList('', kind), { value: '' });
      assert.deepStrictEqual(parseDiscoverCompanyList('[]', kind), {
        value: '[]',
      });
    });

    it(`rejects unsafe ${kind} data and falls back without hiding explicit emptiness`, () => {
      const defaults = [company(1), company(2)];
      for (const entry of [
        { ...company(0) },
        { ...company(1), id: Number.MAX_SAFE_INTEGER + 1 },
        { ...company(1), name: 'Bad\nName' },
        { ...company(1), logoPath: 'https://example.com/logo.png' },
        { ...company(1), logoPath: '//example.com/logo.png' },
        { ...company(1), logoTone: 'unknown' },
      ]) {
        assert.ok(
          'error' in parseDiscoverCompanyList(JSON.stringify([entry]), kind)
        );
      }
      assert.equal(
        isSafeDiscoverCompanyLogoPath(
          '/images/company-logos/dc-studios.png',
          kind
        ),
        kind === 'studio'
      );
      assert.deepStrictEqual(
        readDiscoverCompanyList('{broken', defaults, kind),
        {
          companies: defaults,
          usesDefaults: true,
          isMalformed: true,
        }
      );
      assert.deepStrictEqual(readDiscoverCompanyList('[]', defaults, kind), {
        companies: [],
        usesDefaults: false,
        isMalformed: false,
      });
    });
  }
});
