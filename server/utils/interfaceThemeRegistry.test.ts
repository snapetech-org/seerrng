import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { appDataPath } from './appDataVolume';
import {
  getInstalledInterfaceTheme,
  listInstalledInterfaceThemes,
  resetInterfaceThemeRegistryForTests,
} from './interfaceThemeRegistry';

const customRoot = path.join(appDataPath(), 'interface-themes');

after(() => {
  resetInterfaceThemeRegistryForTests();
  rmSync(customRoot, { recursive: true, force: true });
});

describe('built-in interface theme packages', () => {
  it('loads two validated packages with independent layout metadata and CSS', () => {
    const themes = listInstalledInterfaceThemes();
    assert.deepEqual(
      themes.map(({ id }) => id),
      ['seerrOrig', 'seerrNGJ']
    );
    assert.equal(themes[0].navigation, 'flat');
    assert.equal(themes[1].navigation, 'grouped');
    assert.equal(themes[0].activeNavigationIcon, 'outline');
    assert.equal(themes[1].activeNavigationIcon, 'filled');
    assert.notEqual(
      getInstalledInterfaceTheme('seerrOrig')?.css,
      getInstalledInterfaceTheme('seerrNGJ')?.css
    );
    assert.equal(getInstalledInterfaceTheme('../seerrNGJ'), undefined);
    assert.equal(getInstalledInterfaceTheme('not-installed'), undefined);
  });

  it('discovers valid CSS-only packages and skips invalid community folders', () => {
    const packageDirectory = path.join(customRoot, 'studio-dark');
    const invalidDirectory = path.join(customRoot, 'unsafe-theme');
    mkdirSync(packageDirectory, { recursive: true });
    mkdirSync(invalidDirectory, { recursive: true });
    const writePackage = (directory: string, id: string, css: string) => {
      writeFileSync(
        path.join(directory, 'manifest.json'),
        JSON.stringify({
          formatVersion: 1,
          themeApiVersion: 1,
          id,
          name: id,
          description: 'Test package',
          version: '1.0.0',
          author: 'Test',
          license: 'MIT',
          navigation: 'grouped',
          activeNavigationIcon: 'filled',
        })
      );
      writeFileSync(path.join(directory, 'theme.css'), css);
    };
    writePackage(
      packageDirectory,
      'studio-dark',
      "[data-interface-theme='studio-dark'] .sidebar { width: 17rem; }"
    );
    writePackage(invalidDirectory, 'unsafe-theme', 'body { color: red; }');

    resetInterfaceThemeRegistryForTests();
    const themes = listInstalledInterfaceThemes();
    assert.ok(themes.some(({ id }) => id === 'studio-dark'));
    assert.ok(!themes.some(({ id }) => id === 'unsafe-theme'));
    assert.match(
      getInstalledInterfaceTheme('studio-dark')?.css ?? '',
      /width: 17rem/
    );
  });
});
