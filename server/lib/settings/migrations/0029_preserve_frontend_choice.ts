import type { AllSettings } from '@server/lib/settings';

// Older installs never explicitly selected the newly bundled Lumen. Preserve their
// normal native address; a fresh setup keeps the constructor's Lumen default.
export default function preserveFrontendChoice(
  settings: AllSettings
): AllSettings {
  if (settings.main && !settings.main.defaultFrontend) {
    settings.main.defaultFrontend = settings.public?.initialized
      ? 'native'
      : 'lumen';
  }
  return settings;
}
