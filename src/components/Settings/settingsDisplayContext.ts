import defineMessages from '@app/utils/defineMessages';
import { createContext, useContext } from 'react';

export const settingsDisplayMessages = defineMessages(
  'components.Settings.Display',
  {
    compact: 'Compact settings',
    compactHelp:
      'Group settled options and show optional help on demand. This display preference is saved for your account on this browser.',
    help: 'Show help',
    helpFor: 'Help for {setting}',
    configured: 'Configured',
    optional: 'Not configured',
  }
);
export const SettingsDisplayContext = createContext<{
  compact: boolean;
  ready: boolean;
  toggle: () => void;
  reveal: (element: HTMLElement) => void;
  register: (element: HTMLElement, open: () => void) => () => void;
}>({
  compact: false,
  ready: false,
  toggle: () => undefined as void,
  reveal: () => undefined,
  register: () => () => undefined,
});
export const useSettingsDisplay = () => useContext(SettingsDisplayContext);
