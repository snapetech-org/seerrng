export const BLOCKLIST_NAVIGATION_COUNT_KEY = '/api/v1/blocklist/count';

const blocklistMutationMethods = new Set(['delete', 'patch', 'post', 'put']);

export const isBlocklistMutationRequest = (
  method: string | undefined,
  url: string | undefined
): boolean => {
  if (!method || !url || !blocklistMutationMethods.has(method.toLowerCase())) {
    return false;
  }

  try {
    const pathname = new URL(url, 'http://seerrng.local').pathname;
    return (
      pathname === '/api/v1/blocklist' ||
      pathname.startsWith('/api/v1/blocklist/')
    );
  } catch {
    return false;
  }
};

export const shouldShowBlocklistNavigation = ({
  count,
  hasError,
  isBlocklistRoute,
}: {
  count?: number;
  hasError: boolean;
  isBlocklistRoute: boolean;
}): boolean => isBlocklistRoute || hasError || (count ?? 0) > 0;
