export const themeColors = [
  [
    '--theme-page-bg',
    '--bg',
    'Page Background',
    'lumen.account.themeColor.pageBackground',
  ],
  [
    '--theme-control-surface',
    '--surface',
    'Surface',
    'lumen.account.themeColor.surface',
  ],
  [
    '--theme-control-surface-hover',
    '--surface-2',
    'Raised Surface',
    'lumen.account.themeColor.raisedSurface',
  ],
  [
    '--theme-control-border',
    '--line',
    'Border',
    'lumen.account.themeColor.border',
  ],
  [
    '--theme-overlay-menu',
    '--overlay-surface',
    'Menu and Dialog Background',
    'lumen.account.themeColor.menuDialogBackground',
  ],
  [
    '--theme-sidebar-start',
    '--sidebar-start',
    'Sidebar Background Start',
    'lumen.account.themeColor.sidebarBackgroundStart',
  ],
  [
    '--theme-sidebar-end',
    '--sidebar-end',
    'Sidebar Background End',
    'lumen.account.themeColor.sidebarBackgroundEnd',
  ],
  [
    '--theme-sidebar-border',
    '--sidebar-border',
    'Sidebar Border',
    'lumen.account.themeColor.sidebarBorder',
  ],
  [
    '--theme-sidebar-hover',
    '--sidebar-hover',
    'Sidebar Hover Background',
    'lumen.account.themeColor.sidebarHoverBackground',
  ],
  [
    '--theme-searchbar-scrolled',
    '--topbar-scrolled',
    'Scrolled Search Header',
    'lumen.account.themeColor.scrolledSearchHeader',
  ],
  [
    '--theme-heading-text',
    '--ink',
    'Primary Text',
    'lumen.account.themeColor.primaryText',
  ],
  ['--palette-blue', '--accent', 'Accent', 'lumen.account.themeColor.accent'],
] as const;

export const isThemeColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

export function normalizeThemeColor(value: unknown): string | undefined {
  if (!isThemeColor(value)) return undefined;
  const hex = value.toLowerCase().slice(1);
  return `#${hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex}`;
}
