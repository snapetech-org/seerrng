/** Stable identifiers for installed application interface systems. */
export const DEFAULT_INTERFACE_THEME_ID = 'seerrOrig';
export const INTERFACE_THEME_IDS = [
  'seerrOrig',
  'seerrNGJ',
  'persiusNG',
] as const;

/** Custom theme IDs are lowercase kebab-case; built-in IDs retain their names. */
export type InterfaceThemeId = string;

export type InterfaceThemeNavigation = 'flat' | 'grouped';
export type InterfaceThemeActiveNavigationIcon = 'outline' | 'filled';

export type InterfaceThemeManifest = {
  formatVersion: 1;
  themeApiVersion: 1;
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  license: string;
  navigation: InterfaceThemeNavigation;
  activeNavigationIcon: InterfaceThemeActiveNavigationIcon;
};

const customThemeIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const parseInterfaceTheme = (value: unknown): InterfaceThemeId | null =>
  typeof value === 'string' &&
  value.length <= 48 &&
  (INTERFACE_THEME_IDS.includes(
    value as (typeof INTERFACE_THEME_IDS)[number]
  ) ||
    customThemeIdPattern.test(value))
    ? value
    : null;
