const byteUnits: Intl.NumberFormatOptions['unit'][] = [
  'byte',
  'kilobyte',
  'megabyte',
  'gigabyte',
  'terabyte',
  'petabyte',
];

type UnitDisplay = NonNullable<Intl.NumberFormatOptions['unitDisplay']>;
type IntlUnit = NonNullable<Intl.NumberFormatOptions['unit']>;

const unitFormatters = new Map<string, Intl.NumberFormat>();

export const formatUnit = (
  value: number,
  unit: IntlUnit,
  locale = 'en',
  maximumFractionDigits = 1,
  unitDisplay: UnitDisplay = 'long'
): string => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const precision = Number.isFinite(maximumFractionDigits)
    ? Math.max(0, Math.min(20, Math.floor(maximumFractionDigits)))
    : 1;
  const key = `${locale}:${unit}:${unitDisplay}:${precision}`;
  let formatter = unitFormatters.get(key);

  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay,
        maximumFractionDigits: precision,
      });
    } catch {
      formatter = new Intl.NumberFormat('en', {
        style: 'unit',
        unit,
        unitDisplay,
        maximumFractionDigits: precision,
      });
    }
    unitFormatters.set(key, formatter);
  }

  return formatter.format(safeValue);
};

export const formatDurationMinutes = (minutes: number, locale = 'en'): string =>
  formatUnit(minutes, 'minute', locale, 0, 'long');

export const formatDurationParts = (
  hours: number,
  minutes: number,
  locale = 'en'
): string => {
  const safeHours = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const safeMinutes = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const parts = [
    ...(safeHours > 0 ? [formatUnit(safeHours, 'hour', locale, 0)] : []),
    ...(safeMinutes > 0 || safeHours === 0
      ? [formatDurationMinutes(safeMinutes, locale)]
      : []),
  ];

  return formatLocalizedList(parts, locale, 'conjunction', ' ');
};

export const formatLocalizedList = (
  values: readonly (string | null | undefined)[],
  locale = 'en',
  type: Intl.ListFormatType = 'conjunction',
  fallbackSeparator = ', '
): string => {
  const list = values.filter((value): value is string => Boolean(value));
  try {
    return new Intl.ListFormat(locale, { style: 'long', type }).format(list);
  } catch {
    return list.join(fallbackSeparator);
  }
};

export const formatBytes = (
  bytes: number,
  decimals = 2,
  locale = 'en'
): string => {
  const safeBytes = Number.isFinite(bytes) ? bytes : 0;
  const precision = Number.isFinite(decimals)
    ? Math.max(0, Math.min(20, Math.floor(decimals)))
    : 2;
  const absoluteBytes = Math.abs(safeBytes);
  const unitIndex =
    absoluteBytes > 0
      ? Math.min(
          Math.floor(Math.log(absoluteBytes) / Math.log(1024)),
          byteUnits.length - 1
        )
      : 0;
  const unit = byteUnits[unitIndex] ?? 'byte';
  const scaledBytes = safeBytes / 1024 ** unitIndex;
  return formatUnit(scaledBytes, unit, locale, precision, 'short');
};
