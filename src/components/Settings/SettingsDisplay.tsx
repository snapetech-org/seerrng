import Button from '@app/components/Common/Button';
import {
  SettingsDisplayContext,
  settingsDisplayMessages as messages,
  useSettingsDisplay,
} from '@app/components/Settings/settingsDisplayContext';
import { useUser } from '@app/hooks/useUser';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useIntl } from 'react-intl';

export function SettingsDisplayProvider({ children }: { children: ReactNode }) {
  const groups = useRef(new Map<HTMLElement, () => void>());
  const register = useCallback((element: HTMLElement, open: () => void) => {
    groups.current.set(element, open);
    return () => {
      groups.current.delete(element);
    };
  }, []);
  const reveal = useCallback((element: HTMLElement) => {
    for (const [panel, open] of groups.current)
      if (panel.contains(element)) open();
  }, []);
  const { user, loading } = useUser();
  const key = user ? `seerr.settings.compact:${user.id}` : undefined;
  const [stored, setStored] = useState<{ key?: string; compact: boolean }>({
    compact: false,
  });
  useEffect(() => {
    if (!key) return;
    let compact = false;
    try {
      compact = window.localStorage.getItem(key) === 'true';
    } catch {
      /* The in-memory preference still works when storage is unavailable. */
    }
    setStored({ key, compact });
  }, [key]);
  const compact = stored.key === key && stored.compact;
  return (
    <SettingsDisplayContext.Provider
      value={{
        compact,
        register,
        reveal,
        ready: !loading && !!key && stored.key === key,
        toggle: () => {
          if (!key) return;
          const next = !compact;
          setStored({ key, compact: next });
          try {
            window.localStorage.setItem(key, String(next));
          } catch {
            /* Keep the current session's choice. */
          }
        },
      }}
    >
      {children}
    </SettingsDisplayContext.Provider>
  );
}

export function SettingsDisplayControl() {
  const intl = useIntl();
  const { compact, ready, toggle } = useSettingsDisplay();
  return (
    <Button
      type="button"
      buttonSize="standard"
      aria-pressed={compact}
      disabled={!ready}
      onClick={toggle}
      title={intl.formatMessage(messages.compactHelp)}
    >
      {intl.formatMessage(messages.compact)}
    </Button>
  );
}
export {
  settingsDisplayMessages,
  useSettingsDisplay,
} from '@app/components/Settings/settingsDisplayContext';
