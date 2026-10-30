import { themePalettes, useTheme } from '@app/context/ThemeContext';
import { useToasts } from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { Menu } from '@headlessui/react';
import {
  CheckIcon,
  MoonIcon,
  PaintBrushIcon,
  SunIcon,
} from '@heroicons/react/24/outline';
import { useRef, useState, type ReactNode } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Layout.ThemePicker', {
  themePicker: 'Theme picker',
  interfaceDesign: 'Interface design',
  colorPalette: 'Colour palette',
  darkMode: 'Dark mode',
  lightMode: 'Light mode',
  toggle: 'Toggle',
  saveError: 'Could not save your theme. Please try again.',
});

const ThemePicker = ({ triggerIcon }: { triggerIcon?: ReactNode } = {}) => {
  const intl = useIntl();
  const {
    mode,
    palette,
    interfaceTheme,
    interfaceThemes,
    setPalette,
    setInterfaceTheme,
    toggleMode,
  } = useTheme();
  const { user } = useUser();
  const { addToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const saveActive = useRef(false);
  const choosePalette = async (nextPalette: string) => {
    if (!user || saveActive.current) return;
    saveActive.current = true;
    setSaving(true);
    try {
      await setPalette(nextPalette);
    } catch {
      addToast(intl.formatMessage(messages.saveError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      saveActive.current = false;
      setSaving(false);
    }
  };

  const chooseInterfaceTheme = async (nextTheme: string) => {
    if (!user || saveActive.current) return;
    saveActive.current = true;
    setSaving(true);
    try {
      await setInterfaceTheme(nextTheme);
    } catch {
      addToast(intl.formatMessage(messages.saveError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      saveActive.current = false;
      setSaving(false);
    }
  };

  return (
    <Menu as="div" className="relative">
      <Menu.Button
        className="flex h-10 w-10 items-center justify-center rounded-full text-gray-200 ring-1 ring-gray-700 transition hover:bg-gray-800/80 hover:text-white hover:ring-gray-500 focus:ring-gray-500 focus:outline-none"
        aria-label={intl.formatMessage(messages.themePicker)}
      >
        {triggerIcon ?? <PaintBrushIcon className="h-5 w-5" />}
      </Menu.Button>
      <Menu.Items
        transition
        className="absolute end-0 z-50 mt-2 w-80 rounded-md shadow-lg transition duration-100 ease-out data-closed:scale-95 data-closed:opacity-0"
      >
        <div className="app-theme-picker-surface rounded-md p-3 ring-1 ring-gray-700 backdrop-blur">
          <Menu.Item
            as="button"
            type="button"
            onClick={toggleMode}
            className="app-button app-button-default button-standard mb-3 flex w-full justify-between px-3 py-2 text-sm"
          >
            <span className="flex items-center">
              {mode === 'dark' ? <MoonIcon /> : <SunIcon />}
              {mode === 'dark'
                ? intl.formatMessage(messages.darkMode)
                : intl.formatMessage(messages.lightMode)}
            </span>
            <span className="text-xs tracking-wide text-gray-400 uppercase">
              {intl.formatMessage(messages.toggle)}
            </span>
          </Menu.Item>
          <p className="px-1 pb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
            {intl.formatMessage(messages.interfaceDesign)}
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {interfaceThemes.map((theme) => (
              <Menu.Item
                key={theme.id}
                as="button"
                type="button"
                onClick={() => void chooseInterfaceTheme(theme.id)}
                disabled={!user || saving}
                aria-pressed={interfaceTheme === theme.id}
                aria-busy={saving}
                className={({ active }) =>
                  `flex min-w-0 items-start rounded border px-2 py-2 text-start transition ${
                    interfaceTheme === theme.id
                      ? 'border-indigo-500 bg-indigo-600/20 text-gray-100'
                      : active
                        ? 'border-gray-500 bg-gray-700 text-gray-100'
                        : 'border-gray-700 bg-gray-900/60 text-gray-200'
                  }`
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {theme.name}
                  </span>
                  <span className="block truncate text-xs text-gray-400">
                    {theme.description}
                  </span>
                </span>
                {interfaceTheme === theme.id && (
                  <CheckIcon className="ms-2 mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                )}
              </Menu.Item>
            ))}
          </div>
          <p className="px-1 pb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
            {intl.formatMessage(messages.colorPalette)}
          </p>
          <div className="scrollable-card grid max-h-96 grid-cols-2 gap-2 overflow-y-auto">
            {themePalettes.map((themePalette) => (
              <Menu.Item
                key={themePalette.id}
                as="button"
                type="button"
                onClick={() => void choosePalette(themePalette.id)}
                disabled={!user || saving}
                aria-busy={saving}
                className={({ active }) =>
                  `flex min-w-0 items-center rounded border px-2 py-2 text-start text-sm font-medium transition ${
                    palette === themePalette.id
                      ? 'border-indigo-500 bg-indigo-600/20 text-gray-100'
                      : active
                        ? 'border-gray-500 bg-gray-700 text-gray-100'
                        : 'border-gray-700 bg-gray-900/60 text-gray-200'
                  }`
                }
              >
                <span className="me-2 flex shrink-0 -space-x-1">
                  {themePalette.swatches.map((swatch) => (
                    <span
                      key={`${themePalette.id}-${swatch}`}
                      data-theme-swatch
                      className="h-4 w-4 rounded-full border border-gray-950/30"
                      style={{ backgroundColor: swatch }}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {themePalette.name}
                </span>
                {palette === themePalette.id && (
                  <CheckIcon className="ms-2 h-4 w-4 shrink-0 text-indigo-400" />
                )}
              </Menu.Item>
            ))}
          </div>
        </div>
      </Menu.Items>
    </Menu>
  );
};

export default ThemePicker;
