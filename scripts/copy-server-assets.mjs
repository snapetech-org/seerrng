import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const copyTree = async (sourceRoot, destinationRoot, shouldCopy) => {
  const visit = async (sourceDirectory, relativeDirectory = '') => {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const sourcePath = path.join(sourceDirectory, entry.name);
      const relativePath = path.join(relativeDirectory, entry.name);

      if (entry.isDirectory()) {
        await visit(sourcePath, relativePath);
      } else if (entry.isFile() && shouldCopy(relativePath)) {
        const destinationPath = path.join(destinationRoot, relativePath);
        await mkdir(path.dirname(destinationPath), { recursive: true });
        await copyFile(sourcePath, destinationPath);
      }
    }
  };

  await visit(sourceRoot);
};

export const copyServerAssets = async (projectRoot = process.cwd()) => {
  const root = path.resolve(projectRoot);

  await copyTree(
    path.join(root, 'server/templates'),
    path.join(root, 'dist/templates'),
    (relativePath) =>
      relativePath.endsWith('.html') || relativePath.endsWith('.pug')
  );
  await copyTree(
    path.join(root, 'server/i18n/locale'),
    path.join(root, 'dist/i18n/locale'),
    (relativePath) =>
      path.basename(relativePath) === relativePath &&
      relativePath.endsWith('.json')
  );
  await copyTree(
    path.join(root, 'themes'),
    path.join(root, 'dist/interface-themes'),
    () => true
  );
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await copyServerAssets(process.argv[2] ?? process.cwd());
}
