import { createDiscoverNavigationContextId } from '@app/utils/discoverNavigation';
import { useEffect, useState } from 'react';

const useDiscoverNavigationContextId = (
  enabled: boolean,
  contextKey?: string
): string | undefined => {
  const [context, setContext] = useState<
    { contextKey: string; contextId?: string } | undefined
  >();

  useEffect(() => {
    if (!enabled || !contextKey) {
      setContext(undefined);
      return;
    }

    setContext({
      contextKey,
      contextId: createDiscoverNavigationContextId(),
    });
  }, [contextKey, enabled]);

  return enabled && context && context.contextKey === contextKey
    ? context.contextId
    : undefined;
};

export default useDiscoverNavigationContextId;
