import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const composeFiles = [
  'deploy/compose.main.yml',
  'deploy/compose.readonly-local.yml',
  'deploy/compose.readonly-swap.yml',
];
const expectedTemporaryFilesystems = [
  '/tmp:rw,noexec,nosuid,nodev,size=64m,uid=1000,gid=1000,mode=1777',
  '/app/.next/cache:rw,noexec,nosuid,nodev,size=256m,uid=1000,gid=1000,mode=0700',
];

for (const composeFile of composeFiles) {
  test(`${composeFile} confines the SeerrNG container`, () => {
    const document = yaml.load(
      fs.readFileSync(path.join(rootDirectory, composeFile), 'utf8')
    );
    const service = document.services.seerrng;

    assert.equal(service.init, true);
    if (composeFile === 'deploy/compose.readonly-local.yml') {
      assert.equal(service.image, 'seerrng:readonly-local');
    } else {
      assert.equal(
        service.image,
        'ghcr.io/snapetech-org/seerrng:${SEERRNG_TAG:-stable}',
        'deployments should follow the latest stable image by default'
      );
    }
    assert.equal(service.user, '1000:1000');
    assert.equal(service.read_only, true);
    assert.deepEqual(service.cap_drop, ['ALL']);
    assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.deepEqual(service.tmpfs, expectedTemporaryFilesystems);
    assert.ok(
      service.volumes.some((volume) => volume.endsWith(':/app/config')),
      'the writable configuration volume is missing'
    );
    assert.equal(service.healthcheck.test[0], 'CMD-SHELL');
    assert.match(
      service.healthcheck.test[1],
      /\/app\/scripts\/healthcheck\.mjs/u
    );
  });
}

test('the production image has an explicit unprivileged final user', () => {
  const dockerfile = fs.readFileSync(
    path.join(rootDirectory, 'Dockerfile'),
    'utf8'
  );
  const finalStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '));

  assert.match(finalStage, /\nUSER node:node\n/);
  assert.match(finalStage, /rm -rf \/usr\/local\/lib\/node_modules\/npm/);
});

test('the Docker build context excludes secrets and development-only contracts', () => {
  const ignoreRules = fs
    .readFileSync(path.join(rootDirectory, '.dockerignore'), 'utf8')
    .split(/\r?\n/u)
    .filter((line) => line && !line.startsWith('#'));
  const ignoredPaths = new Set(ignoreRules);

  for (const expectedPattern of [
    '.env*',
    '.git',
    '.npmrc',
    '**/*.key',
    '**/*.p12',
    '**/*.pfx',
    '**/*.pem',
    'config',
    '.github',
    'cypress',
    'docs/*',
  ]) {
    assert.ok(
      ignoredPaths.has(expectedPattern),
      `${expectedPattern} is exposed to the Docker build context`
    );
  }

  const rootNpmrcIgnored = ignoreRules.reduce((ignored, rule) => {
    if (rule === '.npmrc' || rule === '/.npmrc') return true;
    if (rule === '!.npmrc' || rule === '!/.npmrc') return false;
    return ignored;
  }, false);
  assert.equal(
    rootNpmrcIgnored,
    true,
    'the root .npmrc must remain excluded from the Docker build context'
  );
  const dockerfile = fs.readFileSync(
    path.join(rootDirectory, 'Dockerfile'),
    'utf8'
  );
  assert.doesNotMatch(
    dockerfile,
    /COPY[^\n]*\.npmrc/u,
    'the Dockerfile must not copy host package-manager configuration'
  );
  assert.match(
    dockerfile,
    /pnpm --config\.engine-strict=true install[^\n]*--frozen-lockfile/gu,
    'dependency installation must retain strict engine validation without copying .npmrc'
  );
  assert.equal(
    [
      ...dockerfile.matchAll(
        /pnpm --config\.engine-strict=true install[^\n]*--frozen-lockfile/gu
      ),
    ].length,
    2,
    'both production and build dependency installs must retain strict engine validation'
  );
});

test('the production build does not require development-only contracts', () => {
  const dockerfile = fs.readFileSync(
    path.join(rootDirectory, 'Dockerfile'),
    'utf8'
  );

  assert.match(
    dockerfile,
    /RUN pnpm i18n:check && pnpm build:next && pnpm build:server/u
  );
  assert.doesNotMatch(dockerfile, /RUN pnpm build(?:\s|$)/u);
});

test('the CI image publisher uses the private pool only for trusted main jobs', () => {
  const workflow = yaml.load(
    fs.readFileSync(
      path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
      'utf8'
    )
  );
  const publisher = workflow.jobs.publish;

  assert.equal(workflow.jobs['preflight-deploy'], undefined);
  assert.equal(workflow.jobs['deploy-main'], undefined);
  assert.match(publisher.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(publisher.if, /inputs\.action == 'publish-image'/u);
  assert.match(publisher.if, /inputs\.runner_pool == 'private'/u);
  assert.match(publisher['runs-on'], /"group":"ng-shared-main-jit"/u);
  assert.match(publisher['runs-on'], /"ng-shared-main-seerrng"/u);
  assert.match(publisher['runs-on'], /"ng-main-run-\{0\}"/u);
  assert.match(publisher['runs-on'], /github\.run_id/u);
  assert.doesNotMatch(publisher['runs-on'], /(?:ubuntu|macos|windows)-latest/u);
  assert.equal(publisher.permissions.packages, 'write');
});
