export const themeColors = [
  ['--theme-page-bg', '--bg', 'Page Background'],
  ['--theme-control-surface', '--surface', 'Surface'],
  ['--theme-control-surface-hover', '--surface-2', 'Raised Surface'],
  ['--theme-control-border', '--line', 'Border'],
  ['--theme-overlay-menu', '--overlay-surface', 'Menu and Dialog Background'],
  ['--theme-sidebar-start', '--sidebar-start', 'Sidebar Background Start'],
  ['--theme-sidebar-end', '--sidebar-end', 'Sidebar Background End'],
  ['--theme-sidebar-border', '--sidebar-border', 'Sidebar Border'],
  ['--theme-sidebar-hover', '--sidebar-hover', 'Sidebar Hover Background'],
  ['--theme-searchbar-scrolled', '--topbar-scrolled', 'Scrolled Search Header'],
  ['--theme-heading-text', '--ink', 'Primary Text'],
  ['--palette-blue', '--accent', 'Accent'],
] as const;

export const isThemeColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

export function normalizeThemeColor(value: unknown): string | undefined {
  if (!isThemeColor(value)) return undefined;
  const hex = value.toLowerCase().slice(1);
  return `#${hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex}`;
}
