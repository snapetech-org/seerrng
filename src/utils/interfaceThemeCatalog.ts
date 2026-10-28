import seerrNGJ from '../../themes/seerrNGJ/manifest.json';
import seerrOrig from '../../themes/seerrOrig/manifest.json';
import type { InterfaceThemeManifest } from '@server/utils/interfaceTheme';

/** Built-in picker fallback; the package manifests remain the source of truth. */
export const BUILT_IN_INTERFACE_THEME_MANIFESTS: InterfaceThemeManifest[] = [
  seerrOrig,
  seerrNGJ,
];
