// today's date where the viewer is, as YYYY-MM-DD (toISOString is UTC: in the evening west of
// Greenwich it's already tomorrow). Call it at render so a page left open rolls over.
export function localToday(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
