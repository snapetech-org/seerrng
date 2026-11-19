export const themeColors = [
  ['--theme-page-bg', '--bg', 'Page Background'],
  ['--theme-control-surface', '--surface', 'Surface'],
  ['--theme-control-surface-hover', '--surface-2', 'Raised Surface'],
  ['--theme-control-border', '--line', 'Border'],
  ['--theme-heading-text', '--ink', 'Primary Text'],
  ['--palette-blue', '--accent', 'Accent'],
] as const;

export const isThemeColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
