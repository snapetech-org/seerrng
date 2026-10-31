import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
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
import { parseArgs } from 'node:util';
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
import {
  getInstalledInterfaceTheme,
  listInstalledInterfaceThemes,
} from '../utils/interfaceThemeRegistry';

const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;
const themeInstallRoot = path.join(appDataPath(), 'interface-themes');
const builtInIds = new Set<string>(INTERFACE_THEME_IDS);

const usage = (): never => {
  throw new Error(
    [
      'Usage:',
      '  pnpm interface-theme:create <theme-id> [directory] [--from persiusNG] [--name Name] [--author Author]',
      '  pnpm interface-theme:list',
      '  pnpm interface-theme:inspect <directory|package.seerrtheme|installed-id>',
      '  pnpm interface-theme:validate <directory|package.seerrtheme>',
      '  pnpm interface-theme:pack <theme-directory> [output.seerrtheme]',
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
    // Stylesheets are public data and must remain readable by the app worker.
    chmodSync(staging, 0o755);
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

const serializeBundle = (
  theme: ReturnType<typeof validateInterfaceThemePackage>
): string =>
  `${JSON.stringify({ formatVersion: 1, manifest: theme.manifest, css: theme.css }, null, 2)}\n`;

const [command, ...arguments_] = process.argv.slice(2);
try {
  if (command === 'create') {
    const { values, positionals } = parseArgs({
      args: arguments_,
      allowPositionals: true,
      options: {
        from: { type: 'string', default: 'persiusNG' },
        name: { type: 'string' },
        author: { type: 'string' },
      },
    });
    const [id, directory = id, ...rest] = positionals;
    if (!id || rest.length || !parseInterfaceTheme(id) || builtInIds.has(id)) {
      throw new Error('Choose a new lowercase kebab-case custom theme ID.');
    }
    const base = getInstalledInterfaceTheme(values.from);
    if (!base) throw new Error(`Base theme "${values.from}" is not installed.`);
    const css = base.css.split(base.manifest.id).join(id);
    const manifest = {
      ...base.manifest,
      id,
      name:
        values.name ??
        id
          .split('-')
          .map((word) => word[0].toUpperCase() + word.slice(1))
          .join(' '),
      description: `An independent stylesheet based on ${base.manifest.name}.`,
      version: '0.1.0',
      author: values.author ?? 'Your name',
    };
    const theme = validateInterfaceThemePackage(manifest, css, id);
    const target = path.resolve(directory);
    // mkdir is exclusive; even an empty existing source directory is preserved.
    mkdirSync(target, { mode: 0o755 });
    try {
      writeFileSync(
        path.join(target, 'manifest.json'),
        `${JSON.stringify(theme.manifest, null, 2)}\n`,
        { flag: 'wx' }
      );
      writeFileSync(path.join(target, 'theme.css'), theme.css, { flag: 'wx' });
      writeFileSync(
        path.join(target, 'README.md'),
        [
          `# ${theme.manifest.name}`,
          '',
          `Independent CSS theme derived from ${base.manifest.name} (${base.manifest.version}).`,
          `Keep the original license and attribution when redistributing derived styles.`,
          '',
          `Edit manifest.json and theme.css. Every selector is already scoped to ${id}.`,
          `The layout field selects native application markup; omit it for classic markup.`,
          `Run the following from a SeerrNG checkout, substituting this directory's path:`,
          '',
          '```sh',
          `pnpm interface-theme:validate ./path-to-theme`,
          `pnpm interface-theme:pack ./path-to-theme`,
          '```',
          '',
          `Publish source, the .seerrtheme bundle, its .sha256 file, license, screenshots and supported SeerrNG versions.`,
          `See https://github.com/snapetech-org/seerrng/blob/main/docs/interface-themes/authoring.md`,
          '',
        ].join('\n'),
        { flag: 'wx' }
      );
    } catch (error) {
      rmSync(target, { recursive: true, force: true });
      throw error;
    }
    console.log(
      `Created ${target} from ${base.manifest.id}. Edit its manifest.json and theme.css, then validate and pack it.`
    );
  } else if (command === 'list') {
    if (arguments_.length) usage();
    console.log(
      JSON.stringify(
        listInstalledInterfaceThemes().map((manifest) => ({
          ...manifest,
          builtIn: builtInIds.has(manifest.id),
        })),
        null,
        2
      )
    );
  } else if (command === 'inspect' || command === 'validate') {
    const [input, ...rest] = arguments_;
    if (!input || rest.length) usage();
    const target = path.resolve(input);
    const installed =
      command === 'inspect' && !existsSync(target)
        ? getInstalledInterfaceTheme(input)
        : undefined;
    const directory = !installed && lstatSync(target).isDirectory();
    const theme =
      installed ??
      (directory ? readThemeDirectory(target) : readThemeBundle(target));
    if (command === 'validate') {
      console.log(
        `Valid: ${theme.manifest.name} (${theme.manifest.id}) v${theme.manifest.version}`
      );
    } else {
      const bundleText =
        !installed && !directory
          ? readRegularFile(target, MAX_BUNDLE_BYTES)
          : serializeBundle(theme);
      console.log(
        JSON.stringify(
          {
            ...theme.manifest,
            layout: theme.manifest.layout ?? 'classic',
            cssBytes: Buffer.byteLength(theme.css, 'utf8'),
            sha256: createHash('sha256').update(bundleText).digest('hex'),
          },
          null,
          2
        )
      );
    }
  } else if (command === 'pack') {
    const [directory, output, ...rest] = arguments_;
    if (!directory || rest.length > 0) usage();
    const theme = readThemeDirectory(path.resolve(directory));
    const target = path.resolve(
      output ?? `${theme.manifest.id}-${theme.manifest.version}.seerrtheme`
    );
    const checksumTarget = `${target}.sha256`;
    if (
      existsSync(target) ||
      existsSync(checksumTarget) ||
      /[\r\n]/.test(path.basename(target))
    ) {
      throw new Error(
        'Output or checksum already exists, or the filename contains a line break; choose a new package filename.'
      );
    }
    const contents = serializeBundle(theme);
    const checksum = createHash('sha256').update(contents).digest('hex');
    writeFileSync(target, contents, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o644,
    });
    try {
      writeFileSync(checksumTarget, `${checksum}  ${path.basename(target)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o644,
      });
    } catch (error) {
      rmSync(target);
      throw error;
    }
    console.log(`Created ${target}`);
    console.log(`SHA-256 ${checksum} (${checksumTarget})`);
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
