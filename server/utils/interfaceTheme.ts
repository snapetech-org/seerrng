/** Stable identifiers for the selectable application interface systems. */
export const DEFAULT_INTERFACE_THEME_ID = 'seerrOrig';
export const INTERFACE_THEME_IDS = ['seerrOrig', 'seerrNGJ'] as const;

export type InterfaceThemeId = (typeof INTERFACE_THEME_IDS)[number];

export const parseInterfaceTheme = (value: unknown): InterfaceThemeId | null =>
  typeof value === 'string' &&
  INTERFACE_THEME_IDS.includes(value as InterfaceThemeId)
    ? (value as InterfaceThemeId)
    : null;
