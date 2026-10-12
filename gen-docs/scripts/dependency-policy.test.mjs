import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { hooks } = require('../.pnpmfile.cjs');

test('Docusaurus update checks are removed from both installed core graphs', () => {
  for (const version of ['3.10.1', '3.10.2']) {
    const manifest = {
      name: '@docusaurus/core',
      version,
      dependencies: { 'update-notifier': '^6.0.2', webpack: '^5.0.0' },
    };

    assert.equal(
      hooks.readPackage(manifest).dependencies['update-notifier'],
      undefined
    );
    assert.equal(manifest.dependencies.webpack, '^5.0.0');
  }
});

test('Docusaurus utils resolves only the replacement glob tools', () => {
  const manifest = {
    name: '@docusaurus/utils',
    version: '3.10.2',
    dependencies: { globby: '^11.1.0', micromatch: '^4.0.5' },
  };

  assert.deepEqual(hooks.readPackage(manifest).dependencies, {
    picomatch: '^4.0.4',
    tinyglobby: '0.2.15',
  });
});

test('the docs proxy middleware keeps glob matching with picomatch', () => {
  const manifest = {
    name: 'http-proxy-middleware',
    version: '2.0.10',
    dependencies: { micromatch: '^4.0.2', 'http-proxy': '^1.18.1' },
  };

  assert.deepEqual(hooks.readPackage(manifest).dependencies, {
    'http-proxy': '^1.18.1',
    picomatch: '^4.0.4',
  });
});

test('the package hook leaves unrelated package manifests unchanged', () => {
  const manifest = {
    name: 'unrelated-tool',
    version: '1.0.0',
    dependencies: { globby: '^11.1.0', 'update-notifier': '^6.0.2' },
  };
  const before = structuredClone(manifest);

  assert.equal(hooks.readPackage(manifest), manifest);
  assert.deepEqual(manifest, before);
});
