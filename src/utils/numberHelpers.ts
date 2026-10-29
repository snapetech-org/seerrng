const byteUnits: Intl.NumberFormatOptions['unit'][] = [
  'byte',
  'kilobyte',
  'megabyte',
  'gigabyte',
  'terabyte',
  'petabyte',
];

const byteFormatters = new Map<string, Intl.NumberFormat>();

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
  const unit = byteUnits[unitIndex];
  const scaledBytes = safeBytes / 1024 ** unitIndex;
  const key = `${locale}:${unit}:${precision}`;
  let formatter = byteFormatters.get(key);

  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: precision,
      });
    } catch {
      formatter = new Intl.NumberFormat('en', {
        style: 'unit',
        unit,
        unitDisplay: 'short',
        maximumFractionDigits: precision,
      });
    }
    byteFormatters.set(key, formatter);
  }

  return formatter.format(scaledBytes);
};
