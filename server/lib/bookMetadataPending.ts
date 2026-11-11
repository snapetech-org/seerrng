const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/** Explicit preparation or outage contracts defer metadata, never a generic 503. */
export const getBookMetadataPendingRetryMs = (
  error: unknown
): number | undefined => {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth++) {
    seen.add(current);
    const value = record(current);
    const response = record(value?.response);
    const data = record(response?.data);
    if (
      response?.status === 503 &&
      (data?.code === 'metadata_pending' ||
        data?.code === 'metadata_unavailable')
    ) {
      const seconds = data.retryAfterSeconds;
      return typeof seconds === 'number' && Number.isFinite(seconds)
        ? Math.min(900, Math.max(60, seconds)) * 1000
        : 60_000;
    }
    current = value?.cause;
  }
  return undefined;
};
