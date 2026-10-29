import { appDataPath } from '@server/utils/appDataVolume';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  INTERFACE_THEME_IDS,
  parseInterfaceTheme,
  type InterfaceThemeManifest,
} from './interfaceTheme';
import {
  MAX_INSTALLED_INTERFACE_THEME_CSS_BYTES,
  MAX_INSTALLED_INTERFACE_THEMES,
  MAX_INTERFACE_THEME_CSS_BYTES,
  MAX_INTERFACE_THEME_MANIFEST_BYTES,
  validateInterfaceThemePackage,
  type InterfaceThemePackage,
} from './interfaceThemePackage';

const CUSTOM_THEME_DIRECTORY_NAME = 'interface-themes';
const builtInIds = new Set<string>(INTERFACE_THEME_IDS);

let packageCache: Map<string, InterfaceThemePackage> | undefined;

const builtInThemeRoot = (): string => {
  const compiledRoot = path.resolve(__dirname, '../interface-themes');
  if (
    existsSync(path.join(compiledRoot, INTERFACE_THEME_IDS[0], 'manifest.json'))
  ) {
    return compiledRoot;
  }
  return path.resolve(process.cwd(), 'themes');
};

const regularFile = (filename: string, maxBytes: number): string => {
  const stat = lstatSync(filename);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maxBytes) {
    throw new Error('Theme package file is not a supported regular file.');
  }
  return readFileSync(filename, 'utf8');
};

const readPackageDirectory = (
  directory: string,
  expectedId: string
): InterfaceThemePackage => {
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error('Theme package directory is not a supported directory.');
  }
  const manifestText = regularFile(
    path.join(directory, 'manifest.json'),
    MAX_INTERFACE_THEME_MANIFEST_BYTES
  );
  const css = regularFile(
    path.join(directory, 'theme.css'),
    MAX_INTERFACE_THEME_CSS_BYTES
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('Theme manifest is not valid JSON.');
  }
  return validateInterfaceThemePackage(manifest, css, expectedId);
};

const loadPackages = (): Map<string, InterfaceThemePackage> => {
  const packages = new Map<string, InterfaceThemePackage>();
  const builtInRoot = builtInThemeRoot();

  for (const id of INTERFACE_THEME_IDS) {
    packages.set(id, readPackageDirectory(path.join(builtInRoot, id), id));
  }

  const customRoot = path.join(appDataPath(), CUSTOM_THEME_DIRECTORY_NAME);
  if (existsSync(customRoot)) {
    const rootStat = lstatSync(customRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error('The installed interface theme path is not a directory.');
    }

    let totalCssBytes = 0;
    let customCount = 0;
    const entries = readdirSync(customRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const id = parseInterfaceTheme(entry.name);
      if (
        !id ||
        builtInIds.has(id) ||
        customCount >= MAX_INSTALLED_INTERFACE_THEMES
      ) {
        continue;
      }
      try {
        const loaded = readPackageDirectory(
          path.join(customRoot, entry.name),
          id
        );
        const cssBytes = Buffer.byteLength(loaded.css, 'utf8');
        if (
          totalCssBytes + cssBytes >
          MAX_INSTALLED_INTERFACE_THEME_CSS_BYTES
        ) {
          continue;
        }
        totalCssBytes += cssBytes;
        customCount += 1;
        packages.set(id, loaded);
      } catch {
        // Invalid packages are not listed or served. The user can remove or
        // repair the package without taking the application theme API down.
      }
    }
  }

  return packages;
};

const installedPackages = (): Map<string, InterfaceThemePackage> => {
  if (!packageCache) packageCache = loadPackages();
  return packageCache;
};

export const listInstalledInterfaceThemes = (): InterfaceThemeManifest[] =>
  [...installedPackages().values()]
    .map(({ manifest }) => manifest)
    .sort((left, right) => {
      if (builtInIds.has(left.id) && builtInIds.has(right.id)) {
        return (
          INTERFACE_THEME_IDS.indexOf(
            left.id as (typeof INTERFACE_THEME_IDS)[number]
          ) -
          INTERFACE_THEME_IDS.indexOf(
            right.id as (typeof INTERFACE_THEME_IDS)[number]
          )
        );
      }
      if (builtInIds.has(left.id)) return -1;
      if (builtInIds.has(right.id)) return 1;
      return left.name.localeCompare(right.name);
    });

export const getInstalledInterfaceTheme = (
  value: unknown
): InterfaceThemePackage | undefined => {
  const id = parseInterfaceTheme(value);
  return id ? installedPackages().get(id) : undefined;
};

export const isInstalledInterfaceTheme = (value: unknown): boolean =>
  getInstalledInterfaceTheme(value) !== undefined;

/** Test helper: package installation is intentionally discovered on restart. */
export const resetInterfaceThemeRegistryForTests = (): void => {
  packageCache = undefined;
};
