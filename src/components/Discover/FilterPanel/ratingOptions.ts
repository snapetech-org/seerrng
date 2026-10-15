import type { RatingOption } from './CompactFilterSelect';

export const createTmdbRatingOptions = (anyLabel: string): RatingOption[] => [
  { label: anyLabel, value: 'any' },
  ...Array.from({ length: 100 }, (_, index) => {
    const score = (index + 1) / 10;
    const scoreValue = Number.isInteger(score)
      ? score.toString()
      : score.toFixed(1);

    return {
      label: score.toFixed(1) + '+',
      value: scoreValue + '-plus',
      gte: scoreValue,
      score,
    };
  }),
];
