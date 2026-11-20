import type { DiscoverStudioData } from '@server/constants/discover';
import {
  isSafeDiscoverCompanyLogoPath,
  parseDiscoverCompanyList,
  readDiscoverCompanyList,
} from '@server/lib/discoverCompanyList';

export const isSafeDiscoverStudioLogoPath = (value: unknown): value is string =>
  isSafeDiscoverCompanyLogoPath(value, 'studio');

export const parseDiscoverStudioList = (value: unknown) =>
  parseDiscoverCompanyList(value, 'studio');

export const readDiscoverStudioList = (
  value: string | null | undefined,
  defaults: readonly DiscoverStudioData[]
): {
  studios: readonly DiscoverStudioData[];
  usesDefaults: boolean;
  isMalformed: boolean;
} => {
  const result = readDiscoverCompanyList(value, defaults, 'studio');

  return {
    studios: result.companies,
    usesDefaults: result.usesDefaults,
    isMalformed: result.isMalformed,
  };
};
