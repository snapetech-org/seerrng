import { useUser } from '@app/hooks/useUser';
import {
  readLocalStorageValue,
  writeLocalStorageValue,
} from '@app/utils/localStorage';
import { useCallback, useEffect, useState } from 'react';

const storageKeyPrefix = 'seerr.subjectTagVisibility';

export const getSubjectTagVisibilityStorageKey = (userId?: number): string =>
  `${storageKeyPrefix}:${
    Number.isSafeInteger(userId) && (userId ?? 0) > 0 ? userId : 'anonymous'
  }`;

const isVisiblePreference = (value: string | null | undefined): boolean =>
  value !== 'hidden';

const useSubjectTagVisibility = () => {
  const { user } = useUser();
  const storageKey = getSubjectTagVisibilityStorageKey(user?.id);
  const [storedPreference, setStoredPreference] = useState<{
    key?: string;
    ready: boolean;
    visible: boolean;
  }>({ ready: false, visible: true });
  const ready = storedPreference.key === storageKey && storedPreference.ready;
  const visible =
    storedPreference.key === storageKey ? storedPreference.visible : true;

  useEffect(() => {
    setStoredPreference({
      key: storageKey,
      ready: true,
      visible: isVisiblePreference(readLocalStorageValue(storageKey)),
    });
  }, [storageKey]);

  const setVisible = useCallback(
    (nextVisible: boolean) => {
      setStoredPreference({
        key: storageKey,
        ready: true,
        visible: nextVisible,
      });
      writeLocalStorageValue(storageKey, nextVisible ? 'visible' : 'hidden');
    },
    [storageKey]
  );

  const toggleVisibility = useCallback(() => {
    setVisible(!visible);
  }, [setVisible, visible]);

  return { ready, visible, setVisible, toggleVisibility };
};

export default useSubjectTagVisibility;
