import { DEFAULT_PREFS, type AdminConfig } from './settings';

const object = (value: unknown, field: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const webAddress = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
};

const preferenceKeys = new Set(Object.keys(DEFAULT_PREFS));
const rowKeys = new Set(Object.keys(DEFAULT_PREFS.rows));
const lockKeys = new Set([
  ...[...preferenceKeys].filter((key) => key !== 'rows'),
  ...[...rowKeys].map((key) => `rows.${key}`),
]);

export function parseCompanionConfig(text: string): AdminConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Choose a valid lumen-config.json file.');
  }
  const config = object(parsed, 'Lumen configuration');
  for (const [field, value] of Object.entries(config)) {
    switch (field) {
      case 'defaults':
        for (const [key, setting] of Object.entries(object(value, field))) {
          const valid =
            key === 'rows'
              ? Object.entries(object(setting, 'Discover rows')).every(
                  ([row, enabled]) =>
                    rowKeys.has(row) && typeof enabled === 'boolean'
                )
              : key === 'theme'
                ? typeof setting === 'string' &&
                  ['dark', 'light', 'system'].includes(setting)
                : preferenceKeys.has(key) && typeof setting === 'boolean';
          if (!valid) throw new Error(`Invalid default setting: ${key}.`);
        }
        break;
      case 'locked':
        if (
          !Array.isArray(value) ||
          !value.every((key) => typeof key === 'string' && lockKeys.has(key))
        ) {
          throw new Error('The file contains an invalid settings lock.');
        }
        break;
      case 'seerrPublicUrl':
      case 'audiobookshelfUrl':
      case 'kavitaUrl':
        if (!webAddress(value))
          throw new Error(`Invalid web address: ${field}.`);
        break;
      case 'branding':
        for (const [key, setting] of Object.entries(object(value, field))) {
          if (key === 'logo' || key === 'icon') {
            if (!webAddress(setting)) {
              throw new Error(
                'Remove companion-local logo and icon paths from the JSON. Upload those images separately in bundled Lumen.'
              );
            }
          } else if (
            !(key === 'name' && typeof setting === 'string') &&
            !(
              key === 'logoShape' &&
              typeof setting === 'string' &&
              ['rounded', 'circle', 'raw'].includes(setting)
            )
          ) {
            throw new Error(`Invalid branding setting: ${key}.`);
          }
        }
        break;
      case 'mediaServer':
        if (!['auto', 'plex', 'jellyfin', 'emby'].includes(value as string)) {
          throw new Error('Invalid media server.');
        }
        break;
      case 'mediaServerName':
        if (typeof value !== 'string')
          throw new Error('Invalid media server name.');
        break;
      case 'loginStyle':
        if (value !== 'buttons' && value !== 'form')
          throw new Error('Invalid sign-in page style.');
        break;
      default:
        throw new Error(`Unsupported Lumen setting: ${field}.`);
    }
  }
  return config as AdminConfig;
}
