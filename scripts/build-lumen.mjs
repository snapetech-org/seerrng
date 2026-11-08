import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../lumen/', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// pnpm's lifecycle environment includes its own allow-scripts switch. npm 11
// rejects that switch for project installs, even with --ignore-scripts.
const environment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !/^npm_config_allow[-_]?scripts$/i.test(key)
  )
);
for (const args of [
  ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
  [
    'run',
    'build',
    '--',
    '--base=/lumen/',
    '--outDir=../public/lumen',
    '--emptyOutDir',
  ],
]) {
  const result = spawnSync(npm, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...environment,
      VITE_LUMEN_EMBEDDED: 'true',
      VITE_SEERR_PUBLIC_URL: '/seerrng',
    },
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// Vite rewrites HTML asset URLs, but public manifests are copied verbatim.
// Keep installed Lumen apps and every icon inside the bundled deployment.
const manifestUrl = new URL(
  '../public/lumen/manifest.webmanifest',
  import.meta.url
);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8'));
manifest.start_url = '/lumen/';
manifest.scope = '/lumen/';
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: icon.src.startsWith('/') ? `/lumen${icon.src}` : icon.src,
}));
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
