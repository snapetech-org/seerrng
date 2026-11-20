import type { DiscoverNetworkData } from '@server/constants/discover';
import {
  isSafeDiscoverCompanyLogoPath,
  parseDiscoverCompanyList,
  readDiscoverCompanyList,
} from '@server/lib/discoverCompanyList';

export const isSafeDiscoverNetworkLogoPath = (
  value: unknown
): value is string => isSafeDiscoverCompanyLogoPath(value, 'network');

export const parseDiscoverNetworkList = (value: unknown) =>
  parseDiscoverCompanyList(value, 'network');

export const readDiscoverNetworkList = (
  value: string | null | undefined,
  defaults: readonly DiscoverNetworkData[]
): {
  networks: readonly DiscoverNetworkData[];
  usesDefaults: boolean;
  isMalformed: boolean;
} => {
  const result = readDiscoverCompanyList(value, defaults, 'network');

  return {
    networks: result.companies,
    usesDefaults: result.usesDefaults,
    isMalformed: result.isMalformed,
  };
};
