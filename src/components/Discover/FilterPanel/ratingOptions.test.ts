import { describe, expect, it } from 'vitest';
import { createTmdbRatingOptions } from './ratingOptions';

describe('TMDB rating threshold options', () => {
  const options = createTmdbRatingOptions('Any');

  it('offers every tenth-point threshold from 0.1 through 10.0', () => {
    expect(options).toHaveLength(101);
    expect(options[0]).toEqual({ label: 'Any', value: 'any' });
    expect(options[1]).toMatchObject({
      label: '0.1+',
      value: '0.1-plus',
      gte: '0.1',
      score: 0.1,
    });
    expect(options.at(-1)).toMatchObject({
      label: '10.0+',
      value: '10-plus',
      gte: '10',
      score: 10,
    });
  });

  it('keeps existing whole-number URL option values stable', () => {
    expect(options.find((option) => option.gte === '7')).toMatchObject({
      label: '7.0+',
      value: '7-plus',
      gte: '7',
      score: 7,
    });
  });
});
