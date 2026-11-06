import type { PersonCredit } from '@server/models/Person';

export type CreditSortOption =
  | 'popularity.asc'
  | 'popularity.desc'
  | 'release_date.asc'
  | 'release_date.desc'
  | 'vote_average.asc'
  | 'vote_average.desc'
  | 'title.asc'
  | 'title.desc'
  | 'vote_count.asc'
  | 'vote_count.desc';

export const sortPersonCredits = <T extends PersonCredit>(
  credits: T[],
  sortOption: CreditSortOption,
  locale: string
): T[] => {
  const ascending = sortOption.endsWith('.asc');
  const direction = ascending ? 1 : -1;
  const field = sortOption.slice(0, sortOption.lastIndexOf('.'));
  const collator = new Intl.Collator(locale, {
    sensitivity: 'base',
    numeric: true,
  });

  return [...credits].sort((left, right) => {
    if (field === 'title') {
      const leftTitle = left.mediaType === 'movie' ? left.title : left.name;
      const rightTitle = right.mediaType === 'movie' ? right.title : right.name;
      const leftHasTitle = Boolean(leftTitle?.trim());
      const rightHasTitle = Boolean(rightTitle?.trim());
      // Keep incomplete metadata after known values in either sort direction.
      if (leftHasTitle !== rightHasTitle) return leftHasTitle ? -1 : 1;
      if (!leftHasTitle) return 0;
      return direction * collator.compare(leftTitle, rightTitle);
    }

    if (field === 'release_date') {
      const leftDate = Date.parse(
        left.mediaType === 'movie' ? left.releaseDate : left.firstAirDate
      );
      const rightDate = Date.parse(
        right.mediaType === 'movie' ? right.releaseDate : right.firstAirDate
      );
      const leftHasDate = Number.isFinite(leftDate);
      const rightHasDate = Number.isFinite(rightDate);
      // An unknown release date is not an old or future release.
      if (leftHasDate !== rightHasDate) return leftHasDate ? -1 : 1;
      if (!leftHasDate) return 0;
      return direction * (leftDate - rightDate);
    }

    const leftValue =
      field === 'popularity'
        ? left.popularity
        : field === 'vote_average'
          ? left.voteAverage
          : left.voteCount;
    const rightValue =
      field === 'popularity'
        ? right.popularity
        : field === 'vote_average'
          ? right.voteAverage
          : right.voteCount;
    const leftHasValue = Number.isFinite(leftValue);
    const rightHasValue = Number.isFinite(rightValue);
    // Keep missing provider values last instead of treating them as zero.
    if (leftHasValue !== rightHasValue) return leftHasValue ? -1 : 1;
    if (!leftHasValue) return 0;
    return direction * (leftValue - rightValue);
  });
};

export const groupPersonCredits = <
  T extends { id: number | string; mediaType?: string },
>(
  items: T[]
) =>
  items.reduce<Record<string, T[]>>((groups, item) => {
    const key = `${item.mediaType}:${item.id}`;
    groups[key] = [...(groups[key] ?? []), item];
    return groups;
  }, Object.create(null));
