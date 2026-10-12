'use strict';

const docusaurusUtilsVersions = new Set(['3.10.1', '3.10.2']);
const docusaurusCoreVersions = new Set(['3.10.1', '3.10.2']);

function readPackage(pkg) {
  if (
    pkg.name === '@docusaurus/core' &&
    docusaurusCoreVersions.has(pkg.version)
  ) {
    delete pkg.dependencies?.['update-notifier'];
  }

  if (
    pkg.name === '@docusaurus/utils' &&
    docusaurusUtilsVersions.has(pkg.version)
  ) {
    const dependencies = pkg.dependencies ?? {};
    delete dependencies.globby;
    delete dependencies.micromatch;
    dependencies.picomatch = '^4.0.4';
    dependencies.tinyglobby = '0.2.15';
    pkg.dependencies = dependencies;
  }

  if (pkg.name === 'http-proxy-middleware' && pkg.version === '2.0.10') {
    const dependencies = pkg.dependencies ?? {};
    delete dependencies.micromatch;
    dependencies.picomatch = '^4.0.4';
    pkg.dependencies = dependencies;
  }

  return pkg;
}

module.exports = { hooks: { readPackage } };
