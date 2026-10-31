import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  validateInterfaceThemeCss,
  validateInterfaceThemeManifest,
  validateInterfaceThemePackage,
} from './interfaceThemePackage';

const manifest = {
  formatVersion: 1,
  themeApiVersion: 1,
  id: 'studio-dark',
  name: 'Studio Dark',
  description: 'A compact community theme.',
  version: '1.0.0',
  author: 'Theme Author',
  license: 'MIT',
  navigation: 'grouped',
  activeNavigationIcon: 'filled',
} as const;

describe('interface theme package contract', () => {
  it('validates metadata and selectors scoped to the package theme root', () => {
    const css = `
      :root[data-interface-theme='studio-dark'] {
        --interface-card-radius: 0.25rem;
      }
      [data-interface-theme='studio-dark'] .sidebar {
        width: 17rem;
      }
      @media (max-width: 40rem) {
        :is(:root[data-interface-theme='studio-dark'], [data-interface-theme='studio-dark']) {
          --interface-page-gutter: 0.75rem;
        }
      }
    `;
    const theme = validateInterfaceThemePackage(manifest, css);
    assert.equal(theme.manifest.id, 'studio-dark');
    assert.equal(theme.css, css);
  });

  it('rejects an unscoped rule and selector groups with any global selector', () => {
    assert.throws(
      () => validateInterfaceThemeCss('body { color: red; }', manifest.id),
      /every selector must start/
    );
    assert.throws(
      () =>
        validateInterfaceThemeCss(
          `[data-interface-theme='${manifest.id}'] .sidebar, body { color: red; }`,
          manifest.id
        ),
      /every selector must start/
    );
  });

  it('rejects remote resources, CSS escapes, and executable or global at-rules', () => {
    for (const css of [
      `[data-interface-theme='${manifest.id}'] .page { background: url(https://example.invalid/a.png); }`,
      `[data-interface-theme='${manifest.id}'] .page { color: r\\65 d; }`,
      `@import url(https://example.invalid/theme.css);`,
      `@font-face { font-family: remote; src: url(https://example.invalid/font.woff2); }`,
      `@keyframes pulse { from { opacity: 0; } to { opacity: 1; } }`,
      `@property --global-color { syntax: "<color>"; inherits: true; initial-value: red; }`,
    ]) {
      assert.throws(() => validateInterfaceThemeCss(css, manifest.id));
    }
  });

  it('allows namespaced package keyframes and rejects unknown package fields', () => {
    assert.doesNotThrow(() =>
      validateInterfaceThemeCss(
        `@keyframes studio-dark-fade { from { opacity: 0; } to { opacity: 1; } }\n[data-interface-theme='${manifest.id}'] .page { animation: studio-dark-fade 1s; }`,
        manifest.id
      )
    );
    assert.throws(
      () =>
        validateInterfaceThemeManifest({ ...manifest, script: 'install.js' }),
      /unknown manifest field/
    );
    assert.throws(
      () => validateInterfaceThemeManifest({ ...manifest, id: '../escape' }),
      /lowercase kebab-case/
    );
  });

  it('rejects control characters in manifest text', () => {
    for (const character of ['\u0000', '\u001f', '\u007f']) {
      assert.throws(
        () =>
          validateInterfaceThemeManifest({
            ...manifest,
            name: `Studio${character}Dark`,
          }),
        /name must be a non-empty string/
      );
    }
  });
});
