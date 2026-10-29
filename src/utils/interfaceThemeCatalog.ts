import type { InterfaceThemeManifest } from '@server/utils/interfaceTheme';
import seerrNGJ from '../../themes/seerrNGJ/manifest.json';
import seerrOrig from '../../themes/seerrOrig/manifest.json';

/**
 * JSON module imports widen literal fields to number/string. Validate the
 * literal contract here so the picker fallback agrees with the package schema.
 */
const assertBuiltInManifest: (
  manifest: typeof seerrOrig | typeof seerrNGJ
) => asserts manifest is InterfaceThemeManifest = (manifest) => {
  if (
    manifest.formatVersion !== 1 ||
    manifest.themeApiVersion !== 1 ||
    (manifest.navigation !== 'flat' && manifest.navigation !== 'grouped') ||
    (manifest.activeNavigationIcon !== 'outline' &&
      manifest.activeNavigationIcon !== 'filled')
  ) {
    throw new Error(
      'Invalid built-in interface theme manifest: ' + manifest.id
    );
  }
};

assertBuiltInManifest(seerrOrig);
assertBuiltInManifest(seerrNGJ);

/** Built-in picker fallback; the package manifests remain the source of truth. */
export const BUILT_IN_INTERFACE_THEME_MANIFESTS: InterfaceThemeManifest[] = [
  seerrOrig,
  seerrNGJ,
];
