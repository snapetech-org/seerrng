import type { PersonCredit } from '@server/models/Person';
import { describe, expect, it } from 'vitest';
import { groupPersonCredits, sortPersonCredits } from './personCredits';
const credit = (
  id: number,
  mediaType: 'movie' | 'tv',
  fields: Record<string, unknown> = {}
) => ({ id, mediaType, ...fields }) as PersonCredit;
describe('person credit identity and sorting', () => {
  it('keeps movie and television identities separate while grouping repeated roles', () => {
    const movie = credit(42, 'movie', {
      title: 'Movie',
      character: 'First role',
    });
    const television = credit(42, 'tv', { name: 'Television' });
    const secondRole = credit(42, 'movie', {
      title: 'Movie',
      character: 'Second role',
    });
    const groups = Object.values(
      groupPersonCredits([movie, television, secondRole])
    );
    expect(groups).toHaveLength(2);
    expect(groups).toEqual([[movie, secondRole], [television]]);
  });
  for (const direction of ['asc', 'desc'] as const) {
    it(`keeps missing and invalid dates last when sorting ${direction}`, () => {
      const known = credit(1, 'movie', { releaseDate: '2020-01-01' });
      const missing = credit(2, 'tv');
      const invalid = credit(3, 'movie', { releaseDate: 'invalid' });
      expect(
        sortPersonCredits(
          [missing, known, invalid],
          `release_date.${direction}`,
          'en'
        )
      ).toEqual([known, missing, invalid]);
    });
    it(`retains real zero-valued ratings before missing ratings when sorting ${direction}`, () => {
      const known = credit(1, 'movie', { voteAverage: 0 });
      const missing = credit(2, 'tv');
      expect(
        sortPersonCredits([missing, known], `vote_average.${direction}`, 'en')
      ).toEqual([known, missing]);
    });
  }
  it('sorts titles naturally and preserves stable ties without mutating input', () => {
    const first = credit(1, 'movie', { title: 'Part 2' });
    const second = credit(2, 'tv', { name: 'Part 10' });
    const equal = credit(3, 'movie', { title: 'part 2' });
    const source = [second, first, equal];
    expect(sortPersonCredits(source, 'title.asc', 'en')).toEqual([
      first,
      equal,
      second,
    ]);
    expect(source).toEqual([second, first, equal]);
  });
});
