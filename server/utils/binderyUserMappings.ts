/** Administrative identity links; display names and email are not proof of identity. */
export const parseBinderyUserMappings = (
  value: unknown
): { value: Record<string, number> } | { error: string } => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { error: 'Bindery requester mappings must be an object.' };
  }
  const entries = Object.entries(value);
  if (entries.length > 1000) {
    return {
      error: 'At most 1000 Bindery requester mappings may be configured.',
    };
  }
  for (const [seerrId, binderyId] of entries) {
    if (
      !/^[1-9][0-9]{0,9}$/.test(seerrId) ||
      Number(seerrId) > 2_147_483_647 ||
      typeof binderyId !== 'number' ||
      !Number.isSafeInteger(binderyId) ||
      binderyId < 1 ||
      binderyId > 2_147_483_647
    ) {
      return {
        error: 'Bindery requester mappings require positive integer user IDs.',
      };
    }
  }
  return { value: Object.fromEntries(entries) as Record<string, number> };
};
