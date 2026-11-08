import { load as parse } from 'js-yaml';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) =>
  readFileSync(new URL(path, new URL('../', import.meta.url)), 'utf8');

test(
  'verified downloader rejects checksum, redirect, path and archive attacks',
  { skip: process.platform !== 'linux' },
  () => {
    execFileSync(
      'python3',
      [
        '-m',
        'unittest',
        'discover',
        '-s',
        '.github/actions/setup-gh-cli',
        '-p',
        'test_download_release_asset.py',
      ],
      {
        cwd: root,
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        timeout: 30000,
        stdio: 'pipe',
      }
    );
  }
);

test('chart tool bootstrap retains pinned native binaries and mandatory signature identity', () => {
  const action = parse(read('.github/actions/setup-chart-testing/action.yml'));
  const script = action.runs.steps[0].run;
  assert.match(script, /RUNNER_OS.*Linux.*RUNNER_ARCH.*X64/);
  assert.match(script, /--tag v3\.0\.6/);
  assert.match(
    script,
    /c956e5dfcac53d52bcf058360d579472f0c1d2d9b69f55209e256fe7783f4c74/
  );
  assert.match(script, /--tag v3\.15\.0/);
  assert.match(
    script,
    /467561730f25fe09d5e6cd09a3e1f6aa759871c657a57602947c716d9be2c583/
  );
  assert.match(script, /cosign" verify-blob/);
  assert.match(
    script,
    /--certificate-identity 'https:\/\/github\.com\/helm\/chart-testing\/\.github\/workflows\/release\.yaml@refs\/heads\/main'/
  );
  assert.match(
    script,
    /--certificate-oidc-issuer 'https:\/\/token\.actions\.githubusercontent\.com'/
  );
  assert.doesNotMatch(
    script,
    /insecure|ignore-sct|verify_blob.*false|Skipping blob/
  );
  assert.match(script, /yamllint==1\.33\.0/);
  assert.match(script, /yamale==6\.0\.0/);
});

test('Lychee and release CLI use the same verified downloader without shell evaluation', () => {
  const lychee = parse(read('.github/actions/setup-lychee/action.yml'));
  assert.match(
    lychee.runs.steps[0].run,
    /1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a/
  );
  for (const path of [
    '.github/actions/setup-gh-cli/action.yml',
    '.github/actions/setup-lychee/action.yml',
  ]) {
    assert.match(read(path), /download-release-asset\.py/);
  }
  const workflow = parse(read('.github/workflows/docs-link-check.yml'));
  const step = workflow.jobs['link-check'].steps.find(
    (x) => x.name === 'Run Lychee link checker'
  );
  assert.match(step.run, /--accept 200\.\.204,300\.\.304,307,308,404,429,999/);
  assert.match(step.run, /test -s lychee\/out\.md/);
  assert.doesNotMatch(step.run, /\beval\b/);
});

test('focused contracts exercise all repaired bootstrappers on their existing runner class', () => {
  const ci = parse(read('.github/workflows/ci.yml'));
  const job = ci.jobs['tool-bootstrap-contract'];
  assert.equal(job['runs-on'], 'ubuntu-24.04');
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.match(job.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(job.if, /inputs.action == 'contracts'/);
  assert.match(ci.jobs['docs-links'].if, /inputs.action == 'contracts'/);
  assert.ok(
    job.steps.some((step) => step.uses === './.github/actions/setup-gh-cli')
  );
  assert.ok(
    job.steps.some((step) =>
      step.run?.includes('test_download_release_asset.py')
    )
  );
});
