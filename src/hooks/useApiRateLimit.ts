import { apiRateLimit } from '@app/utils/apiRateLimit';
import { useEffect, useState, useSyncExternalStore } from 'react';

const serverSnapshot = () => 0;

export default function useApiRateLimit(): number {
  const retryAt = useSyncExternalStore(
    apiRateLimit.subscribe,
    apiRateLimit.getSnapshot,
    serverSnapshot
  );
  const [now, setNow] = useState(Date.now);
  const active = retryAt > now;
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [retryAt, active]);
  return Math.max(0, Math.ceil((retryAt - now) / 1000));
}
