import { randomUUID } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { appDataPath } from '../utils/appDataVolume';
import {
  INTERFACE_THEME_IDS,
  parseInterfaceTheme,
} from '../utils/interfaceTheme';
import {
  MAX_INSTALLED_INTERFACE_THEME_CSS_BYTES,
  MAX_INSTALLED_INTERFACE_THEMES,
  MAX_INTERFACE_THEME_CSS_BYTES,
  MAX_INTERFACE_THEME_MANIFEST_BYTES,
  validateInterfaceThemePackage,
} from '../utils/interfaceThemePackage';

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const themeInstallRoot = path.join(appDataPath(), 'interface-themes');
const builtInIds = new Set<string>(INTERFACE_THEME_IDS);

const usage = (): never => {
  throw new Error(
    [
      'Usage:',
      '  pnpm interface-theme:validate <theme-directory>',
      '  pnpm interface-theme:pack <theme-directory> <output.seerrtheme>',
      '  pnpm interface-theme:install <package.seerrtheme> [--replace]',
      '  pnpm interface-theme:uninstall <custom-theme-id>',
    ].join('\n')
  );
};

const readRegularFile = (filename: string, maxBytes: number): string => {
  const stat = lstatSync(filename);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maxBytes) {
    throw new Error(`Unsupported or oversized package file: ${filename}`);
  }
  return readFileSync(filename, 'utf8');
};

const readThemeDirectory = (directory: string) => {
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error('Theme source must be a real directory.');
  }
  const manifestText = readRegularFile(
    path.join(directory, 'manifest.json'),
    MAX_INTERFACE_THEME_MANIFEST_BYTES
  );
  const css = readRegularFile(
    path.join(directory, 'theme.css'),
    MAX_INTERFACE_THEME_CSS_BYTES
  );
  let manifest: unknown;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error('manifest.json is not valid JSON.');
  }
  const theme = validateInterfaceThemePackage(manifest, css);
  if (builtInIds.has(theme.manifest.id)) {
    throw new Error('Custom theme packages cannot replace built-in themes.');
  }
  return theme;
};

const readThemeBundle = (filename: string) => {
  const text = readRegularFile(filename, MAX_BUNDLE_BYTES);
  let bundle: unknown;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('Theme package is not valid JSON.');
  }
  if (
    typeof bundle !== 'object' ||
    bundle === null ||
    Array.isArray(bundle) ||
    Object.keys(bundle).some(
      (key) => !['formatVersion', 'manifest', 'css'].includes(key)
    ) ||
    (bundle as { formatVersion?: unknown }).formatVersion !== 1
  ) {
    throw new Error('Unsupported .seerrtheme package format.');
  }
  const packageValue = bundle as {
    manifest?: unknown;
    css?: unknown;
  };
  const theme = validateInterfaceThemePackage(
    packageValue.manifest,
    packageValue.css
  );
  if (builtInIds.has(theme.manifest.id)) {
    throw new Error('Custom theme packages cannot replace built-in themes.');
  }
  return theme;
};

const installTheme = (filename: string, replace: boolean): void => {
  const theme = readThemeBundle(filename);
  mkdirSync(appDataPath(), { recursive: true });
  if (existsSync(themeInstallRoot)) {
    const rootStat = lstatSync(themeInstallRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error('The configured theme install path is not a directory.');
    }
  } else {
    mkdirSync(themeInstallRoot, { recursive: true, mode: 0o755 });
  }

  const target = path.join(themeInstallRoot, theme.manifest.id);
  const targetExists = existsSync(target);
  if (targetExists && !replace) {
    throw new Error(
      `Theme "${theme.manifest.id}" is already installed; pass --replace to update it.`
    );
  }
  if (targetExists) {
    const targetStat = lstatSync(target);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error('The existing theme install target is not a directory.');
    }
  }

  let installedCount = 0;
  let installedCssBytes = 0;
  for (const entry of readdirSync(themeInstallRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const installedId = parseInterfaceTheme(entry.name);
    if (
      !installedId ||
      builtInIds.has(installedId) ||
      installedId === theme.manifest.id
    ) {
      continue;
    }
    installedCount += 1;
    const cssPath = path.join(themeInstallRoot, entry.name, 'theme.css');
    if (!existsSync(cssPath)) continue;
    const cssStat = lstatSync(cssPath);
    if (!cssStat.isSymbolicLink() && cssStat.isFile()) {
      installedCssBytes += cssStat.size;
    }
  }
  const nextCssBytes = Buffer.byteLength(theme.css, 'utf8');
  if (!targetExists && installedCount >= MAX_INSTALLED_INTERFACE_THEMES) {
    throw new Error(
      `At most ${MAX_INSTALLED_INTERFACE_THEMES} custom themes can be installed.`
    );
  }
  if (
    installedCssBytes + nextCssBytes >
    MAX_INSTALLED_INTERFACE_THEME_CSS_BYTES
  ) {
    throw new Error(
      'The installed themes would exceed the total CSS size limit.'
    );
  }

  const staging = path.join(
    themeInstallRoot,
    `.${theme.manifest.id}-${randomUUID()}.staging`
  );
  const backup = path.join(
    themeInstallRoot,
    `.${theme.manifest.id}-${randomUUID()}.backup`
  );
  mkdirSync(staging, { mode: 0o700 });
  writeFileSync(
    path.join(staging, 'manifest.json'),
    `${JSON.stringify(theme.manifest, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o644 }
  );
  writeFileSync(path.join(staging, 'theme.css'), theme.css, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o644,
  });

  try {
    if (targetExists) renameSync(target, backup);
    renameSync(staging, target);
    if (targetExists) rmSync(backup, { recursive: true });
  } catch (error) {
    if (!existsSync(target) && existsSync(backup)) renameSync(backup, target);
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(`Installed ${theme.manifest.name} (${theme.manifest.id}).`);
  console.log('Restart SeerrNG to load the package into the theme catalog.');
};

const [command, ...arguments_] = process.argv.slice(2);
try {
  if (command === 'validate') {
    const [directory, ...rest] = arguments_;
    if (!directory || rest.length > 0) usage();
    const theme = readThemeDirectory(path.resolve(directory));
    console.log(
      `Valid: ${theme.manifest.name} (${theme.manifest.id}) v${theme.manifest.version}`
    );
  } else if (command === 'pack') {
    const [directory, output, ...rest] = arguments_;
    if (!directory || !output || rest.length > 0) usage();
    const theme = readThemeDirectory(path.resolve(directory));
    const target = path.resolve(output);
    if (existsSync(target)) {
      throw new Error('Output already exists; choose a new package filename.');
    }
    writeFileSync(
      target,
      `${JSON.stringify(
        { formatVersion: 1, manifest: theme.manifest, css: theme.css },
        null,
        2
      )}\n`,
      { encoding: 'utf8', flag: 'wx', mode: 0o644 }
    );
    console.log(`Created ${target}`);
  } else if (command === 'install') {
    const [filename, ...options] = arguments_;
    if (
      !filename ||
      options.some((option) => option !== '--replace') ||
      options.filter((option) => option === '--replace').length > 1
    ) {
      usage();
    }
    installTheme(path.resolve(filename), options.includes('--replace'));
  } else if (command === 'uninstall') {
    const [value, ...rest] = arguments_;
    const id = parseInterfaceTheme(value);
    if (!id || rest.length > 0 || builtInIds.has(id)) {
      throw new Error('A valid installed custom theme ID is required.');
    }
    if (existsSync(themeInstallRoot)) {
      const rootStat = lstatSync(themeInstallRoot);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error(
          'The configured theme install path is not a directory.'
        );
      }
    }
    const target = path.join(themeInstallRoot, id);
    if (!existsSync(target)) throw new Error(`Theme "${id}" is not installed.`);
    const targetStat = lstatSync(target);
    if (targetStat.isSymbolicLink() || !targetStat.isDirectory()) {
      throw new Error('The selected theme install target is not a directory.');
    }
    rmSync(target, { recursive: true });
    console.log(`Removed ${id}. Restart SeerrNG to update the theme catalog.`);
  } else {
    usage();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Theme command failed.'
  );
  process.exitCode = 1;
}
