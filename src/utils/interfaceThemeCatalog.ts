import type { InterfaceThemeManifest } from '@server/utils/interfaceTheme';
import seerrNGJ from '@themes/seerrNGJ/manifest.json';
import seerrOrig from '@themes/seerrOrig/manifest.json';

/** Built-in picker fallback; the package manifests remain the source of truth. */
const toBuiltInInterfaceThemeManifest = (
  manifest: typeof seerrOrig,
  expectedId: InterfaceThemeManifest['id']
): InterfaceThemeManifest => {
  if (
    manifest.formatVersion !== 1 ||
    manifest.themeApiVersion !== 1 ||
    manifest.id !== expectedId ||
    (manifest.navigation !== 'flat' && manifest.navigation !== 'grouped') ||
    (manifest.activeNavigationIcon !== 'outline' &&
      manifest.activeNavigationIcon !== 'filled')
  ) {
    throw new Error(`Invalid built-in interface theme manifest: ${expectedId}`);
  }

  const navigation: InterfaceThemeManifest['navigation'] =
    manifest.navigation === 'flat' ? 'flat' : 'grouped';
  const activeNavigationIcon: InterfaceThemeManifest['activeNavigationIcon'] =
    manifest.activeNavigationIcon === 'outline' ? 'outline' : 'filled';

  return {
    ...manifest,
    formatVersion: 1,
    themeApiVersion: 1,
    navigation,
    activeNavigationIcon,
  };
};

export const BUILT_IN_INTERFACE_THEME_MANIFESTS: InterfaceThemeManifest[] = [
  toBuiltInInterfaceThemeManifest(seerrOrig, 'seerrOrig'),
  toBuiltInInterfaceThemeManifest(seerrNGJ, 'seerrNGJ'),
];
