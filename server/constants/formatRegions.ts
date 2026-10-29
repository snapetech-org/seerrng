import { countries } from 'country-flag-icons';

export const formatRegionCodes: readonly string[] = countries;

const formatRegionCodeSet: ReadonlySet<string> = new Set(formatRegionCodes);

export const isAvailableFormatRegion = (
  value: unknown
): value is string =>
  typeof value === 'string' && formatRegionCodeSet.has(value);
