import type { InterfaceThemeManifest } from '@server/utils/interfaceTheme';
import seerrNGJ from '../../themes/seerrNGJ/manifest.json';
import seerrOrig from '../../themes/seerrOrig/manifest.json';

const parseBuiltInManifest = (
  manifest: typeof seerrOrig
): InterfaceThemeManifest => {
  if (manifest.formatVersion !== 1 || manifest.themeApiVersion !== 1) {
    throw new Error(`Unsupported built-in interface theme: ${manifest.id}`);
  }
  if (manifest.navigation !== 'flat' && manifest.navigation !== 'grouped') {
    throw new Error(`Invalid built-in navigation mode: ${manifest.id}`);
  }
  if (
    manifest.activeNavigationIcon !== 'outline' &&
    manifest.activeNavigationIcon !== 'filled'
  ) {
    throw new Error(`Invalid built-in navigation icon: ${manifest.id}`);
  }

  return {
    ...manifest,
    formatVersion: 1,
    themeApiVersion: 1,
    navigation: manifest.navigation,
    activeNavigationIcon: manifest.activeNavigationIcon,
  };
};

/** Built-in picker fallback; the package manifests remain the source of truth. */
export const BUILT_IN_INTERFACE_THEME_MANIFESTS: InterfaceThemeManifest[] = [
  parseBuiltInManifest(seerrOrig),
  parseBuiltInManifest(seerrNGJ),
];
