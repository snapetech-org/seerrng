export function duration(minutes?: number): string | undefined {
  if (!minutes || !Number.isFinite(minutes) || minutes < 0) return undefined;
  const total = Math.floor(minutes);
  return total >= 60
    ? `${Math.floor(total / 60)}h ${total % 60}m`
    : `${total}m`;
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .map((word) => Array.from(word)[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toLocaleUpperCase();
}

export function avatarTone(name: string): number {
  return (
    Array.from(name).reduce(
      (hash, letter) => (hash * 31 + (letter.codePointAt(0) ?? 0)) >>> 0,
      0
    ) % 8
  );
}

/** Date-only catalog values must not move a day in western time zones. */
export function calendarDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    12
  );
  return Number.isFinite(date.getTime()) ? date : undefined;
}
