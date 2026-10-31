import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import * as yaml from 'js-yaml';
import { splitDiscordReleaseBody } from './discord-release-notes.mjs';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const require = createRequire(import.meta.url);
const workflowDirectory = path.join(rootDirectory, '.github', 'workflows');
const readWorkflow = (name) =>
  yaml.load(fs.readFileSync(path.join(workflowDirectory, name), 'utf8'));
const ghCliSetupRef = '${{ github.sha }}';
const ghCliSetupPath = './.github-actions/.github/actions/setup-gh-cli';

test('every release job that calls GitHub CLI installs the pinned CLI first', () => {
  const release = readWorkflow('release.yml');
  const ghJobs = Object.entries(release.jobs).filter(([, job]) =>
    (job.steps ?? []).some((step) =>
      /\bgh\s+(?:api|attestation|release|workflow)\b|latest-published-release-tag\.sh/u.test(
        step.run ?? ''
      )
    )
  );

  assert.ok(ghJobs.length > 0, 'release workflow should exercise GitHub CLI');
  for (const [jobName, job] of ghJobs) {
    const setupIndex = job.steps.findIndex(
      (step) => step.uses === ghCliSetupPath
    );
    const checkoutIndex = job.steps.findIndex(
      (step) =>
        step.uses ===
          'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1' &&
        step.with?.repository === 'snapetech-org/seerrng' &&
        step.with?.ref === ghCliSetupRef &&
        step.with?.path === '.github-actions' &&
        step.with?.['sparse-checkout'] === '.github/actions/setup-gh-cli' &&
        step.with?.['sparse-checkout-cone-mode'] === false
    );
    const commandIndex = job.steps.findIndex((step) =>
      /\bgh\s+(?:api|attestation|release|workflow)\b|latest-published-release-tag\.sh/u.test(
        step.run ?? ''
      )
    );

    assert.ok(
      checkoutIndex >= 0 &&
        checkoutIndex < setupIndex &&
        setupIndex < commandIndex,
      `${jobName} must check out and install the pinned GitHub CLI before using it`
    );
  }
});

test('release assets build while image verification runs, then package channels wait for both', () => {
  const release = readWorkflow('release.yml');
  const assetBuild = release.jobs['build-release-assets'];
  const packageDispatch = release.jobs['dispatch-package-channels'];
  const publishRelease = release.jobs['publish-release'];
  const dispatchScript = packageDispatch.steps.find(
    (step) => step.name === 'Dispatch package workflows'
  ).run;

  assert.equal(
    release.on.workflow_dispatch.inputs.reuse_package_workflow_runs.default,
    '{}'
  );
  assert.equal(
    release.on.workflow_dispatch.inputs.skip_launchpad_dispatch.default,
    false
  );
  assert.equal(
    packageDispatch.steps[0].uses,
    'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1'
  );
  assert.equal(assetBuild.uses, './.github/workflows/release-assets.yml');
  assert.deepEqual(assetBuild.needs, [
    'validate-main-tag',
    'create-draft-release',
  ]);
  assert.equal(assetBuild.needs.includes('verify'), false);
  assert.equal(assetBuild.with.tag, '${{ inputs.tag || github.ref_name }}');
  assert.equal(assetBuild.permissions.actions, 'read');
  assert.deepEqual(assetBuild.secrets, {
    ANDROID_KEYSTORE_BASE64: '${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
    ANDROID_KEYSTORE_PASSWORD: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
    ANDROID_KEY_ALIAS: '${{ secrets.ANDROID_KEY_ALIAS }}',
    ANDROID_KEY_PASSWORD: '${{ secrets.ANDROID_KEY_PASSWORD }}',
    IOS_DISTRIBUTION_CERTIFICATE_BASE64:
      '${{ secrets.IOS_DISTRIBUTION_CERTIFICATE_BASE64 }}',
    IOS_DISTRIBUTION_CERTIFICATE_PASSWORD:
      '${{ secrets.IOS_DISTRIBUTION_CERTIFICATE_PASSWORD }}',
    IOS_TEAM_ID: '${{ secrets.IOS_TEAM_ID }}',
    IOS_ADHOC_PROVISIONING_PROFILE_BASE64:
      '${{ secrets.IOS_ADHOC_PROVISIONING_PROFILE_BASE64 }}',
    IOS_APPSTORE_PROVISIONING_PROFILE_BASE64:
      '${{ secrets.IOS_APPSTORE_PROVISIONING_PROFILE_BASE64 }}',
  });
  assert.deepEqual(packageDispatch.needs, [
    'validate-main-tag',
    'verify',
    'build-release-assets',
  ]);
  assert.equal(packageDispatch['timeout-minutes'], 360);
  assert.match(dispatchScript, /--ref main/u);
  assert.match(dispatchScript, /release-chocolatey\.yml/u);
  assert.match(dispatchScript, /release-linux-packages\.yml/u);
  assert.match(
    dispatchScript,
    /required_workflows=\([\s\S]*release-copr\.yml/u
  );
  assert.match(
    dispatchScript,
    /optional_workflows=\([\s\S]*release-snap\.yml/u
  );
  assert.doesNotMatch(
    dispatchScript.match(/required_workflows=\(([\s\S]*?)\)/u)?.[1] ?? '',
    /release-ppa\.yml/u,
    'Launchpad publication must not gate the public release'
  );
  assert.doesNotMatch(
    dispatchScript,
    /release-ppa\.yml/u,
    'Launchpad must not start until after the announcement attempt'
  );
  assert.match(dispatchScript, /watch-github-run\.mjs/u);
  assert.match(dispatchScript, /REUSE_PACKAGE_WORKFLOW_RUNS/u);
  assert.match(
    dispatchScript,
    /repos\/\$REPO\/actions\/runs\/\$reused_run_id/u,
    'reused package runs must be fetched from this repository'
  );
  assert.match(
    dispatchScript,
    /\.status == "completed" and[\s\S]*\.conclusion == "success"/u,
    'only successful completed package runs may be reused'
  );
  assert.match(
    dispatchScript,
    /RELEASE_TAG: \$TAG/u,
    'reused package runs must prove they built the requested release tag'
  );
  assert.match(
    dispatchScript,
    /Skipping optional Snap workflow during release recovery/u
  );
  assert.match(
    dispatchScript,
    /\$REUSE_PACKAGE_WORKFLOW_RUNS" != '\{\}'/u,
    'package workflow reuse must not dispatch duplicate optional Snap builds'
  );
  assert.match(
    dispatchScript,
    /node scripts\/watch-github-run\.mjs[\s\S]*\) &/u,
    'required package channels must be monitored concurrently'
  );
  assert.match(
    dispatchScript,
    /Optional package workflow .*could not be dispatched; continuing/u
  );
  assert.match(
    dispatchScript,
    /Skipping stable package channels for pre-release/u
  );
  const inventoryScript = packageDispatch.steps.find(
    (step) => step.name === 'Verify release package assets'
  ).run;
  assert.match(
    inventoryScript,
    /gh release view .*--json assets/u,
    'package inventory must inspect draft releases through the GitHub CLI'
  );
  assert.deepEqual(publishRelease.needs, [
    'validate-main-tag',
    'create-draft-release',
    'verify',
    'build-release-assets',
    'dispatch-package-channels',
  ]);
  const launchpadDispatch = release.jobs['dispatch-launchpad-ppa'];
  assert.deepEqual(launchpadDispatch.needs, [
    'publish-release',
    'announce-discord',
  ]);
  assert.match(launchpadDispatch.if, /!cancelled\(\)/u);
  assert.match(
    launchpadDispatch.if,
    /needs\.publish-release\.result == 'success'/u
  );
  const launchpadStep = launchpadDispatch.steps.find(
    (step) => step.name === 'Dispatch Launchpad PPA'
  );
  assert.match(launchpadStep.run, /release-ppa\.yml/u);
  assert.match(launchpadStep.run, /SKIP_LAUNCHPAD_DISPATCH/u);
  assert.match(
    launchpadStep.run,
    /could not be dispatched for the already-published release/u
  );
  assert.equal(
    release.jobs['announce-discord'].needs.includes('publish-release'),
    true
  );
  const discordStep = release.jobs['announce-discord'].steps.find(
    (step) => step.name === 'Send Discord announcement'
  );
  assert.equal(discordStep.if, undefined);
  assert.match(
    discordStep.run,
    /DISCORD_RELEASE_WEBHOOK is required to complete a release/u
  );
  assert.match(
    discordStep.run,
    /curl --fail --silent --show-error/u,
    'Discord delivery must fail the release when the webhook returns HTTP error'
  );
});

test('manual release recovery cannot rebuild product outputs', () => {
  const release = readWorkflow('release.yml');
  const assets = readWorkflow('release-assets.yml');
  for (const jobName of [
    'changelog',
    'create-draft-release',
    'publish',
    'scan-release-image',
    'sign',
    'verify',
    'build-release-assets',
    'dispatch-chocolatey',
    'announce-discord',
  ]) {
    assert.match(
      release.jobs[jobName].if,
      /github\.event_name == 'push'/u,
      `${jobName} must only run for the pushed-tag release`
    );
  }
  assert.equal(assets.on.workflow_dispatch, undefined);
  assert.match(
    release.jobs['dispatch-package-channels'].if,
    /inputs\.reuse_from_run_id != ''/u
  );
  assert.match(
    release.jobs['publish-release'].if,
    /inputs\.reuse_from_run_id != ''/u
  );
});

test('container workflows use the canonical lowercase GitHub Container Registry path', () => {
  const expectedImage = 'ghcr.io/snapetech-org/seerrng';
  for (const name of [
    'ci.yml',
    'helm.yml',
    'preview.yml',
    'release.yml',
    'trivy-scan.yml',
  ]) {
    const source = fs.readFileSync(path.join(workflowDirectory, name), 'utf8');
    assert.equal(readWorkflow(name).env.GHCR_IMAGE, expectedImage, name);
    assert.doesNotMatch(
      source,
      /ghcr\.io\/\$\{GITHUB_REPOSITORY\}|ghcr\.io\/\$\{\{ github\.repository \}\}/u,
      `${name} must not interpolate the case-sensitive GitHub repository name into an OCI image reference`
    );
  }
  const release = readWorkflow('release.yml');
  const digestResolver = release.jobs.publish.steps.find(
    (step) => step.name === 'Resolve manifest digest'
  );
  assert.match(digestResolver.run, /image="\$\{GHCR_IMAGE\}:\$\{VERSION\}"/u);
});

test('release retries only transient GitHub OIDC token failures for SBOM attestations', () => {
  const sign = readWorkflow('release.yml').jobs.sign;
  const attestation = sign.steps.find(
    (step) => step.name === 'Generate and attest per-platform SBOMs'
  );

  assert.ok(attestation);
  assert.match(attestation.run, /attest_with_retry\(\)/u);
  assert.match(attestation.run, /for attempt in 1 2 3/u);
  assert.match(
    attestation.run,
    /retrieving ID token\|fetching ambient OIDC credentials/u
  );
  assert.match(attestation.run, /return "\$status"/u);
});

test('AppImage pins its builder, uses the current launcher, and loads its bundled WASM compiler', () => {
  const workflow = readWorkflow('release-linux-packages.yml');
  const job = workflow.jobs.appimage;
  const launcherCheckout = job.steps.find(
    (step) => step.name === 'Checkout AppImage launcher files from main'
  );
  const build = job.steps.find((step) => step.name === 'Build AppImage');
  const smoke = job.steps.find((step) => step.name === 'Smoke-test AppImage');
  const appRun = fs.readFileSync(
    path.join(rootDirectory, 'packaging', 'appimage', 'AppRun'),
    'utf8'
  );
  const nextSwc = fs.readFileSync(
    require.resolve('next/dist/build/swc'),
    'utf8'
  );
  const applicationPackage = JSON.parse(
    fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8')
  );
  const desktop = fs.readFileSync(
    path.join(rootDirectory, 'packaging', 'appimage', 'seerrng.desktop'),
    'utf8'
  );

  assert.equal(launcherCheckout.with.ref, 'main');
  assert.equal(launcherCheckout.with.path, 'appimage-packaging');
  assert.match(
    build.run,
    /appimagetool_url='https:\/\/github\.com\/AppImage\/appimagetool\/releases\/download\/1\.9\.1\/appimagetool-x86_64\.AppImage'/u,
    'AppImage must use a versioned appimagetool release instead of the mutable continuous asset'
  );
  assert.match(
    build.run,
    /ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0/u,
    'AppImage must verify the upstream appimagetool release digest'
  );
  assert.match(build.run, /@next\/swc-linux-x64-gnu/u);
  assert.ok(
    build.run.includes(`${applicationPackage.dependencies.next})`),
    'AppImage must pin its WASM compiler to the app’s Next.js version'
  );
  assert.match(build.run, /@next\/swc-wasm-nodejs/u);
  assert.match(
    build.run,
    /16\.4\.2\)[\s\S]*swc_wasm_integrity='sha512-GW89XFIz6Bmm064REK4DT6oCQH5RjJ4Erm\/MWEranFCsdIvqSoRIaT0xstiaFYk8g5z8YVdMOjpi4UcArYcF7g=='/u,
    'AppImage must verify the official Next.js 16.4.2 WASM compiler tarball'
  );
  assert.match(
    build.run,
    /require\(require\('node:path'\)\.resolve\(process\.argv\[1\]\)\)/u,
    'AppImage must resolve the extracted Next.js package.json as a filesystem path'
  );
  assert.match(
    build.run,
    /next_directory="\$app_dir\/node_modules\/next"[\s\S]*swc_wasm_directory="\$next_directory\/wasm\/@next\/swc-wasm-nodejs"/u
  );
  assert.match(
    build.run,
    /sha512-Qbh5QIWcyzZfp\+neSFDxSaS0PjyCv7NUVipXcOaEp0\+bCAynyGAoGnZirESQyPwpn\/VXBncpZCVa0cnD\+EWDmQ==/u
  );
  assert.match(
    build.run,
    /manylinux_2_28_x86_64@sha256:[a-f0-9]{64}/u,
    'AppImage native modules must be rebuilt in the pinned glibc 2.28 environment'
  );
  assert.match(
    build.run,
    /node-gyp rebuild --release --force_build=1 --nodedir=\/node-runtime/u,
    'AppImage must compile better-sqlite3 from source for its Node runtime'
  );
  assert.match(
    build.run,
    /npm install --global --prefix \/tmp\/node-tooling/u,
    'AppImage must keep node-gyp installation outside its read-only Node runtime mount'
  );
  assert.match(
    build.run,
    /install -m 0644 build\/Release\/better_sqlite3\.node prebuilds\/linux-x64\.node/u,
    'AppImage must replace the incompatible upstream x64 SQLite prebuild'
  );
  assert.ok(
    build.run.includes("sed -n 's/^[[:space:]]*Machine:[[:space:]]*//p'"),
    'AppImage compatibility checks must ignore ELF binaries for other architectures'
  );
  assert.match(build.run, /dpkg --compare-versions[\s\S]*gt 2\.29/u);
  assert.match(smoke.run, /--appimage-extract-and-run/u);
  assert.match(smoke.run, /api\/v1\/settings\/public/u);
  assert.match(appRun, /xdg-open[\s\S]*127\.0\.0\.1/mu);
  assert.match(appRun, /^export NEXT_TEST_WASM=1$/mu);
  assert.match(
    appRun,
    /^export NEXT_TEST_WASM_DIR="\$APP_DIR\/node_modules\/next\/wasm\/@next\/swc-wasm-nodejs"$/mu
  );
  assert.match(nextSwc, /NEXT_TEST_WASM_DIR/u);
  assert.match(nextSwc, /NEXT_TEST_WASM/u);
  assert.match(desktop, /^Exec=AppRun$/mu);
  assert.match(desktop, /^Terminal=false$/mu);
});

test('release asset publication can download artifacts from the same run', () => {
  const assets = readWorkflow('release-assets.yml');

  assert.equal(assets.jobs.publish.permissions.actions, 'read');
});

test('package workflows build the requested tag and reject tags outside main', () => {
  for (const workflowName of [
    'release-linux-packages.yml',
    'release-flatpak.yml',
    'release-ppa.yml',
    'release-copr.yml',
  ]) {
    const workflowText = fs.readFileSync(
      path.join(workflowDirectory, workflowName),
      'utf8'
    );
    assert.match(
      workflowText,
      /ref: \$\{\{ (?:github\.event\.inputs|steps\.version\.outputs)\.tag(?: \}\})?/u
    );
    assert.match(
      workflowText,
      /ensure-release-tag-on-main\.sh/u,
      `${workflowName} must verify tag ancestry before publishing`
    );
  }
});

test('Chocolatey packages only verified Windows release archives', () => {
  const workflow = readWorkflow('release-chocolatey.yml');
  const job = workflow.jobs['publish-chocolatey'];
  const steps = job.steps.map((step) => step.run ?? '').join('\n');
  const credentialStep = job.steps.find(
    (step) => step.name === 'Require Chocolatey publisher credential'
  );
  const submitStep = job.steps.find(
    (step) => step.name === 'Submit package to Chocolatey Community Repository'
  );

  assert.equal(workflow.on.workflow_dispatch.inputs.tag.required, true);
  assert.match(job['runs-on'], /"group":"packer-windows"/u);
  assert.match(job['runs-on'], /"Windows"/u);
  assert.match(job['runs-on'], /"ng-shared-main-seerrng"/u);
  assert.match(job['runs-on'], /github\.run_id/u);
  assert.doesNotMatch(job['runs-on'], /windows-latest/u);
  assert.ok(credentialStep);
  assert.match(credentialStep.run, /\[guid\]::TryParse/iu);
  assert.ok(submitStep);
  assert.match(submitStep.run, /ToString\('D'\)/u);
  assert.match(submitStep.run, /--api-key \$apiKey/u);
  assert.match(
    steps,
    /merge-base --is-ancestor HEAD refs\/remotes\/origin\/main/u
  );
  assert.match(steps, /Get-FileHash[\s\S]*SHA-256 mismatch/u);
  assert.match(steps, /CHOCOLATEY_API_KEY/u);
  assert.match(steps, /choco push/u);
});

test('Launchpad retries for the same release tag are serialized', () => {
  const ppa = readWorkflow('release-ppa.yml');

  assert.equal(
    ppa.concurrency.group,
    'release-ppa-${{ inputs.tag || github.ref_name }}'
  );
  assert.equal(ppa.concurrency['cancel-in-progress'], false);
  assert.equal(ppa.jobs['publish-ppa']['timeout-minutes'], 360);
});

test('release asset uploaders preserve the draft until the final publish gate', () => {
  for (const workflowName of [
    'release-assets.yml',
    'release-linux-packages.yml',
    'release-flatpak.yml',
  ]) {
    const workflowText = fs.readFileSync(
      path.join(workflowDirectory, workflowName),
      'utf8'
    );
    assert.match(
      workflowText,
      /softprops\/action-gh-release@[\s\S]*?draft: true/u
    );
  }
});

test('GitHub container vulnerability scans use an available pinned Trivy release', () => {
  for (const workflowName of ['ci.yml', 'trivy-scan.yml', 'release.yml']) {
    const workflowText = fs.readFileSync(
      path.join(workflowDirectory, workflowName),
      'utf8'
    );
    assert.match(workflowText, /aquasecurity\/setup-trivy@/u);
    assert.match(workflowText, /version: v0\.74\.0/u);
    assert.doesNotMatch(workflowText, /version: 0\.58\.2/u);
    assert.match(workflowText, /--exit-code 1/u);
    assert.match(workflowText, /--severity HIGH,CRITICAL/u);
    assert.match(workflowText, /--ignore-unfixed/u);
  }
});

test('Jellyfin CI tests incomplete startup responses before the live smoke test', () => {
  const ci = readWorkflow('ci.yml');
  const plugin = ci.jobs['jellyfin-plugin'];
  const dotnetSetup = plugin.steps.find(
    (step) => step.name === 'Set up .NET SDK'
  );
  const startupRetryTest = plugin.steps.find(
    (step) => step.name === 'Test Jellyfin smoke-test startup retries'
  );
  const liveSmokeTest = plugin.steps.find(
    (step) => step.name === 'Smoke test plugin in Jellyfin 10.11.11'
  );

  assert.equal(
    dotnetSetup?.env?.DOTNET_INSTALL_DIR,
    '${{ runner.temp }}/dotnet'
  );
  assert.ok(startupRetryTest);
  assert.ok(liveSmokeTest);
  assert.equal(startupRetryTest.if, undefined);
  assert.match(
    startupRetryTest.run,
    /python3 -m unittest discover -s integrations\/jellyfin-plugin\/tests/u
  );
  assert.ok(
    plugin.steps.indexOf(startupRetryTest) <
      plugin.steps.indexOf(liveSmokeTest),
    'the startup-response regression test must run before the Jellyfin container smoke test'
  );
});

test('all .NET setup steps install to a runner-writable directory', () => {
  const setupSteps = ['ci.yml', 'release-assets.yml'].flatMap((workflowName) =>
    Object.values(readWorkflow(workflowName).jobs).flatMap((job) =>
      (job.steps ?? []).filter((step) =>
        step.uses?.startsWith('actions/setup-dotnet@')
      )
    )
  );

  assert.equal(setupSteps.length, 2);
  for (const step of setupSteps) {
    assert.equal(step.env?.DOTNET_INSTALL_DIR, '${{ runner.temp }}/dotnet');
  }
});

test('multi-architecture publishers perform the real build once and verify the index', () => {
  const ci = readWorkflow('ci.yml');
  const preview = readWorkflow('preview.yml');
  const release = readWorkflow('release.yml');
  const aliasPromotion = readWorkflow('promote-container-aliases.yml');

  assert.equal(ci.jobs.build, undefined);
  assert.match(ci.jobs.publish.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(ci.jobs.publish.if, /inputs\.action == 'publish-image'/u);
  assert.match(ci.jobs.publish.if, /inputs\.runner_pool == 'private'/u);
  assert.match(ci.jobs.publish['runs-on'], /"group":"ng-shared-main-jit"/u);
  assert.match(ci.jobs.publish['runs-on'], /github\.run_id/u);
  assert.doesNotMatch(ci.jobs.publish['runs-on'], /ubuntu-latest/u);
  assert.deepEqual(ci.jobs.publish.needs, [
    'release-notes',
    'i18n-and-tooling',
    'test',
    'unit-test',
    'node-test',
    'jellyfin-plugin',
    'playwright',
    'cypress',
    'test-docs',
    'docs-links',
    'helm',
  ]);
  assert.equal(ci.on.push, undefined);
  assert.equal(Object.hasOwn(ci.on, 'workflow_dispatch'), true);
  assert.equal(Object.hasOwn(ci.on, 'pull_request'), false);
  assert.equal(Object.hasOwn(ci.on, 'pull_request_target'), false);
  assert.match(ci['run-name'], /inputs\.action, inputs\.runner_pool/u);
  for (const jobName of [
    'release-notes',
    'i18n-and-tooling',
    'test',
    'unit-test',
    'node-test',
    'jellyfin-plugin',
    'playwright',
    'cypress',
    'test-docs',
    'docs-links',
    'helm',
  ]) {
    assert.match(
      ci.jobs[jobName].if,
      /github\.ref == 'refs\/heads\/main'/u,
      `${jobName} should only run from main`
    );
    assert.match(
      ci.jobs[jobName].if,
      /inputs\.action == 'ci'/u,
      `${jobName} should run for the explicit CI action`
    );
    assert.doesNotMatch(
      ci.jobs[jobName].if,
      /github\.event_name == 'push'/u,
      `${jobName} must not run automatically on pushes`
    );
  }
  assert.doesNotMatch(ci.jobs.publish.if, /github\.event_name == 'push'/u);
  assert.doesNotMatch(
    ci.jobs['scan-main-image'].if,
    /github\.event_name == 'push'/u
  );
  const releaseNoteValidation = ci.jobs['release-notes'].steps.find(
    (step) => step.name === 'Validate release-note fragment or explicit opt-out'
  );
  assert.match(
    releaseNoteValidation.run,
    /git rev-parse --verify "\$\{HEAD_SHA\}\^1"/u
  );
  assert.match(
    releaseNoteValidation.run,
    /git diff --quiet "\$base_sha" "\$HEAD_SHA" -- release-notes/u
  );
  assert.doesNotMatch(releaseNoteValidation.run, /GITHUB_EVENT_NAME|push/u);
  assert.equal(ci.jobs['preflight-deploy'], undefined);
  assert.equal(ci.jobs['deploy-main'], undefined);
  assert.match(
    ci.jobs.publish.steps.find(
      (step) => step.name === 'Build & Push (multi-arch, single tag)'
    ).run,
    /--platform linux\/amd64,linux\/arm64[\s\S]*--provenance mode=max/u
  );
  assert.match(
    ci.jobs.publish.steps.find(
      (step) => step.name === 'Verify published architectures'
    ).run,
    /verify-container-manifest\.sh --require-provenance/u
  );
  assert.equal(
    ci.jobs['scan-main-image'].if.includes(
      "github.ref == 'refs/heads/main' && inputs.action == 'publish-image' && inputs.runner_pool == 'private' && needs.publish.result == 'success'"
    ),
    true
  );
  assert.deepEqual(ci.jobs['scan-main-image'].needs, ['publish']);
  assert.deepEqual(ci.jobs['scan-main-image'].strategy.matrix.include, [
    { platform: 'linux/amd64', suffix: 'amd64' },
    { platform: 'linux/arm64', suffix: 'arm64' },
  ]);
  assert.match(
    ci.jobs['scan-main-image'].steps.find(
      (step) => step.name === 'Run Trivy image scan'
    ).run,
    /\$\{GHCR_IMAGE\}@\$\{IMAGE_DIGEST\}/u
  );

  assert.equal(preview.jobs.build, undefined);
  assert.equal(preview.jobs.publish.needs, 'validate-main-tag');
  assert.match(
    preview.jobs.publish.steps.find(
      (step) => step.name === 'Verify published architectures'
    ).run,
    /verify-container-manifest\.sh --require-provenance[\s\S]*linux\/amd64 linux\/arm64/u
  );

  assert.equal(release.jobs.build, undefined);
  assert.deepEqual(release.jobs.publish.needs, [
    'validate-main-tag',
    'create-draft-release',
  ]);
  const releaseCommit = release.jobs.publish.steps.find(
    (step) => step.name === 'Resolve release commit'
  );
  assert.equal(releaseCommit.id, 'release');
  assert.match(releaseCommit.run, /git rev-parse.*RELEASE_TAG/iu);
  const metadata = release.jobs.publish.steps.find(
    (step) => step.name === 'Extract metadata'
  );
  assert.match(
    metadata.with.labels,
    /org\.opencontainers\.image\.revision=\$\{\{ steps\.release\.outputs\.SHA \}\}/u,
    'release image metadata must identify the tagged source commit'
  );
  assert.equal(
    metadata.with.annotations,
    undefined,
    'release images use config labels because Docker v2 manifests do not carry OCI annotations'
  );
  const buildStep = release.jobs.publish.steps.find(
    (step) => step.name === 'Build & Push (multi-arch)'
  );
  assert.match(
    buildStep.run,
    /release_sha="\$\{\{ steps\.release\.outputs\.SHA \}\}"/u,
    'release image contents and metadata must use the same tagged source commit'
  );
  assert.match(
    buildStep.run,
    /--output type=registry,oci-mediatypes=false[\s\S]*--provenance=false/u,
    'stable release images must use Docker v2 manifest lists for older Unraid update checks'
  );
  assert.doesNotMatch(
    buildStep.run,
    /--push/u,
    'the registry exporter handles pushing the compatible multi-arch manifest'
  );
  assert.match(
    release.jobs.publish.steps.find(
      (step) =>
        step.name ===
        'Verify published architectures and Unraid-compatible manifests'
    ).run,
    /--require-docker-list/u
  );
  assert.match(
    release.jobs.publish.steps.find(
      (step) =>
        step.name ===
        'Verify published architectures and Unraid-compatible manifests'
    ).run,
    /--require-compatible-manifest/u,
    'existing published images can be reused while preserving their existing manifest format'
  );
  assert.equal(release.jobs.sign.permissions.attestations, 'write');
  assert.ok(
    release.jobs.sign.steps.some(
      (step) =>
        step.uses === 'actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6'
    ),
    'release provenance must be signed separately from the Docker v2 manifest list'
  );
  for (const stepName of [
    'Attest GHCR release image provenance',
    'Attest Docker Hub release image provenance',
  ]) {
    const attestation = release.jobs.sign.steps.find(
      (step) => step.name === stepName
    );
    assert.equal(attestation.with['push-to-registry'], true);
    assert.equal(
      attestation.with['create-storage-record'],
      false,
      'publishing provenance must not create a separate organization artifact record'
    );
  }
  assert.equal(release.jobs.verify.permissions.attestations, 'read');
  assert.match(
    release.jobs.verify.steps.find(
      (step) => step.name === 'Verify GitHub build provenance attestations'
    ).run,
    /gh attestation verify[\s\S]*--signer-workflow/u
  );
  assert.match(
    aliasPromotion.jobs.promote.steps.find(
      (step) =>
        step.name === 'Verify release manifest compatibility and version'
    ).run,
    /--require-compatible-manifest/u,
    'stable alias promotion must continue accepting prior OCI releases and new Docker v2 releases'
  );
  const digestResolver = release.jobs.publish.steps.find(
    (step) => step.name === 'Resolve manifest digest'
  );
  assert.match(
    digestResolver.run,
    /image="\$\{GHCR_IMAGE\}:\$\{VERSION\}"/u,
    'release digest resolution must use GHCR rather than the unreachable Docker Hub blob mirror'
  );
  assert.match(
    digestResolver.run,
    /docker buildx imagetools inspect "\$image"/u
  );
  assert.doesNotMatch(
    digestResolver.run,
    /DOCKER_HUB/u,
    'the digest resolver must not fetch the Docker Hub CloudFront-backed manifests'
  );
  assert.deepEqual(release.jobs['scan-release-image'].needs, 'publish');
  assert.deepEqual(release.jobs['scan-release-image'].strategy.matrix.include, [
    { platform: 'linux/amd64', suffix: 'amd64' },
    { platform: 'linux/arm64', suffix: 'arm64' },
  ]);
  assert.deepEqual(release.jobs.sign.needs, ['publish', 'scan-release-image']);
  assert.match(
    release.jobs['scan-release-image'].steps.find(
      (step) => step.name === 'Run Trivy image scan'
    ).run,
    /needs\.publish\.outputs\.image_digest/u
  );
});

test('release validation installs Node before running its alias-policy check', () => {
  const validation = readWorkflow('release.yml').jobs['validate-main-tag'];
  const nodeSetupIndex = validation.steps.findIndex((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  const aliasPolicyIndex = validation.steps.findIndex(
    (step) => step.name === 'Verify stable container alias policy'
  );

  assert.ok(nodeSetupIndex >= 0);
  assert.equal(
    validation.steps[nodeSetupIndex].uses,
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'
  );
  assert.equal(
    validation.steps[nodeSetupIndex].with['node-version-file'],
    'package.json'
  );
  assert.equal(
    validation.steps[nodeSetupIndex].with['package-manager-cache'],
    false
  );
  assert.ok(nodeSetupIndex < aliasPolicyIndex);
});

test('main CI installs Node before running its alias-policy check', () => {
  const validation = readWorkflow('ci.yml').jobs['release-notes'];
  const nodeSetupIndex = validation.steps.findIndex((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  const aliasPolicyIndex = validation.steps.findIndex(
    (step) => step.name === 'Verify stable container alias policy'
  );

  assert.ok(nodeSetupIndex >= 0);
  assert.equal(
    validation.steps[nodeSetupIndex].uses,
    'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1'
  );
  assert.equal(
    validation.steps[nodeSetupIndex].with['node-version-file'],
    'package.json'
  );
  assert.equal(
    validation.steps[nodeSetupIndex].with['package-manager-cache'],
    false
  );
  assert.ok(nodeSetupIndex < aliasPolicyIndex);
});

test('manual container recovery promotes only the latest published release from main', () => {
  const workflow = readWorkflow('promote-container-aliases.yml');
  const promotion = workflow.jobs.promote;
  const resolveRelease = promotion.steps.find(
    (step) => step.name === 'Resolve latest published stable release'
  );

  assert.deepEqual(workflow.on.workflow_dispatch.inputs.action_tag.options, [
    'promote',
  ]);
  assert.equal(promotion.if, "github.ref == 'refs/heads/main'");
  assert.equal(workflow.concurrency.group, 'seerrng-stable-container-aliases');
  assert.match(resolveRelease.run, /latest-published-release-tag\.sh/u);
  assert.match(
    promotion.steps.find(
      (step) => step.name === 'Promote and verify stable aliases'
    ).run,
    /promote-container-aliases\.sh/u
  );
});

test('release publishing runs only from main dispatches so private runners serve it', () => {
  const release = readWorkflow('release.yml');
  const validation = release.jobs['validate-main-tag'];
  const validationScript = validation.steps.find(
    (step) => step.name === 'Ensure tag is on main'
  ).run;

  assert.match(validation.if, /github\.event_name != 'workflow_dispatch'/u);
  assert.match(validation.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.equal(
    release.concurrency.group,
    '${{ github.workflow }}-${{ github.event_name }}-${{ inputs.tag || github.ref_name }}-${{ github.run_id }}'
  );
  assert.equal(release.concurrency['cancel-in-progress'], false);
  assert.equal(release.on.push, undefined);
  assert.match(validationScript, /gh release view "\$RELEASE_TAG"/u);
  assert.match(validationScript, /already published/u);
  assert.match(validationScript, /git merge-base --is-ancestor/u);
});

test('release assets support trusted reuse and main-only manual dispatch', () => {
  const assets = readWorkflow('release-assets.yml');
  const workflowCall = assets.on.workflow_call;
  const resolve = assets.jobs.resolve;

  assert.equal(workflowCall.inputs.tag.required, true);
  assert.equal(workflowCall.inputs.tag.type, 'string');
  assert.equal(workflowCall.inputs.reuse_from_run_id.required, false);
  assert.equal(workflowCall.inputs.reuse_from_run_id.type, 'string');
  assert.equal(workflowCall.inputs.reuse_from_run_id.default, '');
  assert.equal(assets.jobs.build['timeout-minutes'], 45);
  assert.match(resolve.if, /github\.event_name != 'workflow_dispatch'/u);
  assert.match(resolve.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.equal(workflowCall.inputs.reuse_windows_x64_artifact.type, 'boolean');
  assert.equal(
    workflowCall.inputs.reuse_windows_arm64_artifact.type,
    'boolean'
  );
  assert.equal(workflowCall.inputs.reuse_windows_arm64_artifact.default, false);
  for (const name of [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.equal(workflowCall.secrets[name].required, false);
  }
  assert.match(
    resolve.steps.find((step) => step.name === 'Resolve version').env
      .RELEASE_TAG,
    /inputs\.tag/u
  );
});

test('release recovery validates reusable artifacts and repairs the failed release stage', () => {
  const release = readWorkflow('release.yml');
  const assets = readWorkflow('release-assets.yml');
  const inputs = release.on.workflow_dispatch.inputs;
  const recoveryValidation = release.jobs['validate-main-tag'].steps.find(
    (step) => step.name === 'Validate previous run artifacts for recovery'
  );
  const imageBuild = release.jobs.publish.steps.find(
    (step) => step.name === 'Build & Push (multi-arch)'
  );
  const imageReuse = release.jobs.publish.steps.find(
    (step) =>
      step.name ===
      'Verify and reuse published image for this exact release commit'
  );
  const assetBuild = release.jobs['build-release-assets'];
  const reusedArtifactDownload = assets.jobs.build.steps.find(
    (step) => step.name === 'Download validated artifacts from previous run'
  );

  assert.equal(inputs.reuse_from_run_id.type, 'string');
  assert.equal(inputs.reuse_published_image.type, 'boolean');
  assert.equal(inputs.reuse_published_image.default, false);
  assert.equal(recoveryValidation.if, "inputs.reuse_from_run_id != ''");
  assert.equal(release.jobs['validate-main-tag'].permissions.actions, 'read');
  assert.match(
    release.jobs['validate-main-tag'].outputs.reuse_windows_x64_artifact,
    /steps\.recovery\.outputs/u
  );
  assert.match(
    release.jobs['validate-main-tag'].outputs.reuse_windows_arm64_artifact,
    /steps\.recovery\.outputs/u
  );
  assert.match(recoveryValidation.run, /\.head_sha == \$sha/u);
  assert.match(
    recoveryValidation.run,
    /Build release assets \/ Build windows x64/u
  );
  assert.match(
    recoveryValidation.run,
    /\["Build release assets \/ Build iOS Simulator release package"\]/u,
    'an iOS-only failure must allow successful platform artifacts to be reused'
  );
  assert.match(
    recoveryValidation.run,
    /reuse_windows_x64_artifact=true[\s\S]*reuse_windows_arm64_artifact=true/u,
    'iOS-only recovery must reuse both successful Windows artifacts'
  );
  const windowsX64RecoveryArtifacts = recoveryValidation.run.match(
    /else\s+expected_artifacts='([\s\S]*?)'/u
  )?.[1];
  assert.ok(windowsX64RecoveryArtifacts);
  assert.match(windowsX64RecoveryArtifacts, /"seerrng-windows-arm64"/u);
  assert.doesNotMatch(windowsX64RecoveryArtifacts, /"seerrng-windows-x64"/u);
  assert.match(
    recoveryValidation.run,
    /Build release assets \/ Build Android APK/u,
    'recovery must validate that the signed Android artifact was built'
  );
  assert.match(
    recoveryValidation.run,
    /"seerrng-android"/u,
    'recovery must require the Android artifact before reusing release assets'
  );
  assert.match(
    recoveryValidation.run,
    /Build release assets \/ Upload release assets/u
  );
  assert.match(
    recoveryValidation.run,
    /\["Dispatch package channels"\]/u,
    'a package-channel-only failure must be recoverable from verified assets'
  );
  assert.match(
    recoveryValidation.run,
    /reuse_windows_arm64_artifact=true/u,
    'package-only recovery must preserve the successful Windows ARM64 artifact'
  );
  assert.match(recoveryValidation.run, /event == "workflow_dispatch"/u);
  assert.match(recoveryValidation.run, /\.expired == false/u);
  assert.match(imageBuild.if, /inputs\.reuse_published_image != true/u);
  assert.match(imageReuse.if, /inputs\.reuse_published_image == true/u);
  assert.match(imageReuse.run, /org\.opencontainers\.image\.revision/u);
  assert.match(imageReuse.run, /EXPECTED_SHA/u);
  assert.deepEqual(assetBuild.needs, [
    'validate-main-tag',
    'create-draft-release',
  ]);
  assert.deepEqual(assetBuild.secrets, {
    ANDROID_KEYSTORE_BASE64: '${{ secrets.ANDROID_KEYSTORE_BASE64 }}',
    ANDROID_KEYSTORE_PASSWORD: '${{ secrets.ANDROID_KEYSTORE_PASSWORD }}',
    ANDROID_KEY_ALIAS: '${{ secrets.ANDROID_KEY_ALIAS }}',
    ANDROID_KEY_PASSWORD: '${{ secrets.ANDROID_KEY_PASSWORD }}',
    IOS_DISTRIBUTION_CERTIFICATE_BASE64:
      '${{ secrets.IOS_DISTRIBUTION_CERTIFICATE_BASE64 }}',
    IOS_DISTRIBUTION_CERTIFICATE_PASSWORD:
      '${{ secrets.IOS_DISTRIBUTION_CERTIFICATE_PASSWORD }}',
    IOS_TEAM_ID: '${{ secrets.IOS_TEAM_ID }}',
    IOS_ADHOC_PROVISIONING_PROFILE_BASE64:
      '${{ secrets.IOS_ADHOC_PROVISIONING_PROFILE_BASE64 }}',
    IOS_APPSTORE_PROVISIONING_PROFILE_BASE64:
      '${{ secrets.IOS_APPSTORE_PROVISIONING_PROFILE_BASE64 }}',
  });
  assert.match(
    assetBuild.with.reuse_windows_x64_artifact,
    /needs\.validate-main-tag\.outputs\.reuse_windows_x64_artifact/u
  );
  assert.match(
    assetBuild.with.reuse_windows_arm64_artifact,
    /needs\.validate-main-tag\.outputs\.reuse_windows_arm64_artifact/u
  );
  assert.equal(
    assetBuild.with.reuse_from_run_id,
    "${{ inputs.reuse_from_run_id || '' }}"
  );
  assert.equal(
    reusedArtifactDownload.with['run-id'],
    '${{ inputs.reuse_from_run_id }}'
  );
  assert.match(
    reusedArtifactDownload.if,
    /inputs\.reuse_windows_x64_artifact == true/u
  );
  assert.match(
    reusedArtifactDownload.if,
    /inputs\.reuse_windows_arm64_artifact == true/u
  );
  assert.match(
    assets.jobs.build.steps.find((step) => step.name === 'Build archive').if,
    /matrix\.arch == 'arm64'/u
  );
  assert.match(
    assets.jobs.build.steps.find((step) => step.name === 'Build archive').if,
    /inputs\.reuse_windows_arm64_artifact != true/u,
    'recovery must skip a successful Windows ARM64 rebuild'
  );
  assert.match(
    assets.jobs.build.steps.find(
      (step) => step.name === 'Install node-gyp for Visual Studio 2026'
    ).if,
    /inputs\.reuse_windows_arm64_artifact != true/u,
    'recovery must skip ARM64 build-tool setup when reusing its artifact'
  );
  assert.match(
    assets.jobs.build.steps.find((step) => step.name === 'Build archive').env
      .SEERRNG_RELEASE_ARCH,
    /matrix\.arch/u
  );
});

test('release assets build supported native archive platforms', () => {
  const assets = readWorkflow('release-assets.yml');
  const build = assets.jobs.build;
  const publish = assets.jobs.publish;
  const downloadAssets = publish.steps.find(
    (step) => step.name === 'Download built assets'
  );
  const flattenAssets = publish.steps.find(
    (step) => step.name === 'Flatten downloaded release assets'
  );
  const verifyInventory = publish.steps.find(
    (step) => step.name === 'Verify archive inventory and checksums'
  );
  assert.match(
    verifyInventory.env.IOS_ADHOC_SIGNING_ENABLED,
    /vars\.IOS_ADHOC_SIGNING_ENABLED/u
  );
  assert.match(
    verifyInventory.env.IOS_APPSTORE_SIGNING_ENABLED,
    /vars\.IOS_APPSTORE_SIGNING_ENABLED/u
  );
  assert.match(verifyInventory.run, /\$\{IOS_ADHOC_SIGNING_ENABLED:-\}/u);
  assert.match(verifyInventory.run, /\$\{IOS_APPSTORE_SIGNING_ENABLED:-\}/u);
  const archiveBuild = build.steps.find(
    (step) => step.name === 'Build archive'
  );
  const releaseTooling = build.steps.find(
    (step) => step.name === 'Checkout release tooling'
  );
  const buildScript = fs.readFileSync(
    path.join(rootDirectory, 'scripts', 'build-release-assets.sh'),
    'utf8'
  );

  assert.deepEqual(build.strategy.matrix.include, [
    {
      runner_key: 'linux-x64',
      os: 'linux',
      arch: 'x64',
      pnpm_version: '10.24.0',
    },
    {
      runner_key: 'linux-arm64',
      os: 'linux',
      arch: 'arm64',
      pnpm_version: '10.24.0',
    },
    {
      runner_key: 'macos-arm64',
      os: 'macos',
      arch: 'arm64',
      pnpm_version: '10.24.0',
    },
    {
      runner_key: 'macos-x64',
      os: 'macos',
      arch: 'x64',
      pnpm_version: '10.24.0',
    },
    {
      runner_key: 'windows-x64',
      os: 'windows',
      arch: 'x64',
      pnpm_version: '10.24.0',
      msvs_version: 'auto',
    },
    {
      runner_key: 'windows-arm64',
      os: 'windows',
      arch: 'arm64',
      pnpm_version: '10.24.0',
      msvs_version: '2026',
    },
  ]);
  assert.equal(
    archiveBuild.env.GYP_MSVS_VERSION,
    "${{ matrix.msvs_version || 'auto' }}"
  );
  assert.equal(archiveBuild.env.npm_config_msvs_version, undefined);
  assert.match(
    build.steps.find(
      (step) => step.name === 'Install node-gyp for Visual Studio 2026'
    ).run,
    /npm_config_msvs_version=2026/u
  );

  assert.equal(assets.jobs['build-linux-arm'], undefined);
  assert.deepEqual(publish.needs, [
    'resolve',
    'build',
    'build-android',
    'build-ios',
    'build-jellyfin-plugin',
  ]);
  const androidBuild = assets.jobs['build-android'];
  assert.equal(androidBuild.needs, 'resolve');
  assert.equal(
    androidBuild.steps.find(
      (step) =>
        step.name === 'Build, sign, and checksum the Android APK and AAB'
    ).run,
    "bash scripts/build-android-release.sh '${{ needs.resolve.outputs.tag }}' dist-release"
  );
  const androidPackageBuild = androidBuild.steps.find(
    (step) => step.name === 'Build, sign, and checksum the Android APK and AAB'
  );
  assert.deepEqual(
    Object.keys(androidPackageBuild.env).filter((name) =>
      /admob|monetization/iu.test(name)
    ),
    []
  );
  assert.equal(
    androidBuild.steps.find((step) =>
      step.uses?.startsWith('actions/upload-artifact@')
    ).with.name,
    'seerrng-android'
  );
  const iosBuild = assets.jobs['build-ios'];
  assert.equal(iosBuild.needs, 'resolve');
  assert.match(iosBuild['runs-on'], /"group":"private-apple-builds"/u);
  assert.match(iosBuild['runs-on'], /"private-apple"/u);
  const iosToolchainCheck = iosBuild.steps.find(
    (step) => step.name === 'Verify Xcode release toolchain'
  ).run;
  assert.match(iosToolchainCheck, /xcode_version_output=/u);
  assert.doesNotMatch(iosToolchainCheck, /xcodebuild -version \|/u);
  assert.equal(
    iosBuild.steps.find(
      (step) => step.name === 'Test and package iOS Simulator app'
    ).run,
    'bash scripts/build-ios-release.sh "$TAG" dist-release'
  );
  const iosClientWorkflow = readWorkflow('ios.yml');
  assert.deepEqual(Object.keys(iosClientWorkflow.on), ['workflow_dispatch']);
  assert.deepEqual(
    iosClientWorkflow.on.workflow_dispatch.inputs.runner_pool_tag.options,
    ['private']
  );
  assert.match(
    iosClientWorkflow.jobs.ios['runs-on'],
    /"group":"private-apple-builds"[\s\S]*"private-apple"/u
  );
  const iosSetupNode = iosClientWorkflow.jobs.ios.steps.findIndex((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  const iosBuildStep = iosClientWorkflow.jobs.ios.steps.findIndex(
    (step) =>
      step.name === 'Run iOS unit and UI tests, then package Simulator app'
  );
  assert.ok(iosSetupNode >= 0 && iosSetupNode < iosBuildStep);
  assert.equal(
    iosClientWorkflow.jobs.ios.steps[iosSetupNode].with['node-version-file'],
    'package.json'
  );
  const iosClientToolchainCheck = iosClientWorkflow.jobs.ios.steps.find(
    (step) => step.name === 'Verify Xcode release toolchain'
  ).run;
  assert.match(iosClientToolchainCheck, /xcode_version_output=/u);
  assert.doesNotMatch(iosClientToolchainCheck, /xcodebuild -version \|/u);
  assert.match(
    iosClientWorkflow.jobs.ios.steps.find(
      (step) => step.name === 'Inspect iOS Xcode project and scheme'
    ).run,
    /xcodebuild -list -project ios\/SeerrNG\.xcodeproj -scheme SeerrNG/u
  );
  assert.match(
    iosClientWorkflow.jobs.ios.steps.find(
      (step) =>
        step.name === 'Run iOS unit and UI tests, then package Simulator app'
    ).run,
    /scripts\/build-ios-release\.sh/u
  );
  const iosScheme = fs.readFileSync(
    path.join(
      rootDirectory,
      'ios/SeerrNG.xcodeproj/xcshareddata/xcschemes/SeerrNG.xcscheme'
    ),
    'utf8'
  );
  const iosProject = fs.readFileSync(
    path.join(rootDirectory, 'ios/SeerrNG.xcodeproj/project.pbxproj'),
    'utf8'
  );
  const iosInfoPlist = fs.readFileSync(
    path.join(rootDirectory, 'ios/SeerrNG/Info.plist'),
    'utf8'
  );
  assert.match(
    iosProject,
    /AA0000000000000000000003 \/\* Debug \*\/ = \{isa = XCBuildConfiguration; buildSettings = \{[^}]*ENABLE_TESTABILITY = YES;/u
  );
  assert.match(
    iosInfoPlist,
    /<key>CFBundleExecutable<\/key>\s*<string>\$\(EXECUTABLE_NAME\)<\/string>/u
  );
  const iosSigningScript = fs.readFileSync(
    path.join(rootDirectory, 'scripts/build-ios-signed-ipa.sh'),
    'utf8'
  );
  assert.match(iosSigningScript, /export_method='ad-hoc'/u);
  assert.match(iosSigningScript, /export_method='app-store-connect'/u);
  assert.match(iosSigningScript, /"method": export_method/u);
  assert.match(
    iosScheme,
    /BlueprintIdentifier\s*=\s*"A10000000000000000000002"[\s\S]*?BuildableName\s*=\s*"SeerrNG\.app"/u
  );
  assert.match(
    iosScheme,
    /BlueprintIdentifier\s*=\s*"A10000000000000000000003"[\s\S]*?BuildableName\s*=\s*"SeerrNGTests\.xctest"/u
  );
  assert.match(
    iosScheme,
    /BlueprintIdentifier\s*=\s*"A10000000000000000000004"[\s\S]*?BuildableName\s*=\s*"SeerrNGUITests\.xctest"/u
  );
  assert.match(iosScheme, /<MacroExpansion>[\s\S]*?<\/MacroExpansion>/u);
  assert.equal(downloadAssets.with.path, 'dist-release/downloaded');
  assert.equal(downloadAssets.with['merge-multiple'], undefined);
  assert.match(flattenAssets.run, /Unexpected file in release artifact/u);
  assert.match(
    flattenAssets.run,
    /Duplicate release asset filename.*collides with/u
  );
  assert.match(flattenAssets.run, /windows-arm64.*expected_archive/u);
  assert.match(flattenAssets.run, /find "\$downloads" -type f/u);
  assert.match(releaseTooling.with.ref, /github\.sha/u);
  assert.equal(releaseTooling.with.path, '.release-tooling');
  assert.equal(releaseTooling.with['sparse-checkout'], 'scripts');
  assert.match(
    archiveBuild.run,
    /\.release-tooling\/scripts\/build-release-assets\.sh/u
  );
  assert.match(buildScript, /node -p 'process\.arch'/u);
  assert.doesNotMatch(buildScript, /uname -m/u);
  assert.match(verifyInventory.run, /sha256sum -c/u);
  for (const archive of [
    'seerrng-${TAG}-macos-x64.tar.gz',
    'seerrng-${TAG}-windows-arm64.zip',
    'seerrng-${TAG}-android.apk',
    'seerrng-${TAG}-android.aab',
    'seerrng-${TAG}-ios-simulator.zip',
  ]) {
    assert.ok(
      verifyInventory.run.includes(`"${archive}"`),
      `expected the release-asset inventory check to require ${archive}`
    );
  }

  const release = readWorkflow('release.yml');
  const requiredAssets = release.jobs['dispatch-package-channels'].steps.find(
    (step) => step.name === 'Verify release package assets'
  ).run;
  for (const archive of [
    'seerrng-${TAG}-macos-x64.tar.gz',
    'seerrng-${TAG}-windows-arm64.zip',
    'seerrng-${TAG}-ios-simulator.zip',
    'seerrng-${TAG}-ios-simulator.sha256',
  ]) {
    assert.ok(
      requiredAssets.includes(`"${archive}"`),
      `expected the release gate to require ${archive}`
    );
  }
  assert.match(requiredAssets, /seerrng-\$\{TAG\}-android-aab\.sha256/u);
});

test('trusted main release retries use the private runner pools', () => {
  const release = readWorkflow('release.yml');
  const assets = readWorkflow('release-assets.yml');
  const assertPrivateLinuxRunner = (runsOn, label) => {
    assert.match(runsOn, /"group":"ng-shared-main-jit"/u, label);
    assert.match(runsOn, /"ng-shared-main-seerrng"/u, label);
    assert.match(runsOn, /github\.run_id/u, label);
    assert.match(runsOn, /gha-\{0\}-(?:\{1\}-)?[a-z0-9-]+/u, label);
    assert.doesNotMatch(
      runsOn,
      /(?:ubuntu|windows|macos)-\d|\|\|\s*matrix\.runner(?:\W|$)/u,
      `${label} must not fall back to a hosted runner`
    );
  };
  const releaseJobs = Object.values(release.jobs).filter(
    (job) => typeof job['runs-on'] === 'string'
  );
  assert.equal(releaseJobs.length, 14);
  for (const job of releaseJobs) {
    assertPrivateLinuxRunner(job['runs-on'], 'release.yml job');
  }

  for (const jobName of [
    'resolve',
    'build-android',
    'build-jellyfin-plugin',
    'publish',
  ]) {
    assertPrivateLinuxRunner(assets.jobs[jobName]['runs-on'], jobName);
  }
  assert.match(
    assets.jobs['build-ios']['runs-on'],
    /"group":"private-apple-builds"[\s\S]*"private-apple"/u
  );
  assert.doesNotMatch(assets.jobs['build-ios']['runs-on'], /macos-\d/u);
  assert.equal(
    assets.jobs.build.steps.find((step) =>
      step.uses?.startsWith('actions/setup-node@')
    ).with.architecture,
    '${{ matrix.arch }}'
  );
  assert.ok(
    assets.jobs.build.strategy.matrix.include.some(
      ({ os, arch, runner_key }) =>
        os === 'linux' && arch === 'arm64' && runner_key === 'linux-arm64'
    )
  );
});

test('main CI image publishing uses private runners without cancelling queued scans', () => {
  const ci = readWorkflow('ci.yml');
  const imagePublish = ci.jobs.publish;

  assert.match(imagePublish['runs-on'], /ng-shared-main-seerrng/u);
  assert.equal(imagePublish.concurrency['cancel-in-progress'], false);

  for (const name of ['semgrep-community.yml', 'trivy-filesystem.yml']) {
    const workflow = readWorkflow(name);

    assert.equal(
      workflow.concurrency['cancel-in-progress'],
      false,
      `${name} must leave existing scans running`
    );
    assert.match(
      workflow.concurrency.group,
      /github\.run_id/u,
      `${name} must not replace a queued scan with a newer run`
    );
    assert.match(
      Object.values(workflow.jobs)
        .map((job) => job['runs-on'])
        .join('\n'),
      /ng-shared-main-seerrng/u,
      `${name} main scan must use the private runner pool`
    );
  }
});

test('release archive platforms route only to private native runners', () => {
  const expression = readWorkflow('release-assets.yml').jobs.build['runs-on'];
  const route = (runnerKey) =>
    runInNewContext(
      expression.slice(3, -2),
      {
        github: { run_id: 123 },
        matrix: { runner_key: runnerKey },
        strategy: { job: 2 },
        index: 0,
        fromJSON: JSON.parse,
        format: (template, runId, jobIndex) =>
          template
            .replaceAll('{{', '{')
            .replaceAll('}}', '}')
            .replaceAll('{0}', String(runId))
            .replaceAll('{1}', String(jobIndex)),
      },
      { timeout: 100 }
    );

  const assertRoute = (key, group, labels) => {
    const target = route(key);
    assert.equal(target.group, group, key);
    assert.deepEqual(target.labels, labels, key);
  };

  assertRoute('linux-x64', 'ng-shared-main-jit', [
    'self-hosted',
    'linux',
    'x64',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assertRoute('linux-arm64', 'ng-shared-main-jit', [
    'self-hosted',
    'linux',
    'arm64',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assertRoute('macos-arm64', 'ng-shared-main-jit', [
    'self-hosted',
    'macOS',
    'ARM64',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assertRoute('macos-x64', 'ng-shared-main-jit', [
    'self-hosted',
    'macOS',
    'X64',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assertRoute('windows-x64', 'packer-windows', [
    'self-hosted',
    'Windows',
    'X64',
    'packer-windows',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assertRoute('windows-arm64', 'packer-windows', [
    'self-hosted',
    'Windows',
    'ARM64',
    'packer-windows',
    'ng-shared-main-seerrng',
    'ng-main-run-123',
    'gha-123-2-build',
  ]);
  assert.equal(route('unknown'), false);
  assert.doesNotMatch(expression, /matrix\.runner(?:\W|$)/u);
  assert.doesNotMatch(expression, /ubuntu-latest|windows-latest|macos-\d/u);
});

test('trusted main iOS validation uses the private Apple runner', () => {
  const ios = readWorkflow('ios.yml');
  assert.deepEqual(Object.keys(ios.on), ['workflow_dispatch']);
  assert.deepEqual(ios.on.workflow_dispatch.inputs.runner_pool_tag.options, [
    'private',
  ]);
  assert.match(
    ios.jobs.ios['runs-on'],
    /"group":"private-apple-builds"[\s\S]*"private-apple"/u
  );
  assert.doesNotMatch(ios.jobs.ios['runs-on'], /macos-\d/u);
});

test('release notes flow into the draft release and Discord announcement', () => {
  const release = readWorkflow('release.yml');
  const changelog = release.jobs.changelog;
  const draft = release.jobs['create-draft-release'];
  const discord = release.jobs['announce-discord'];

  assert.equal(
    changelog.outputs.release_body,
    '${{ steps.release-body.outputs.release_body }}'
  );
  assert.match(
    changelog.steps.find((step) => step.name === 'Add curated release notes')
      .run,
    /assemble-release-notes\.mjs/u
  );
  assert.equal(draft.needs, 'changelog');
  assert.equal(
    draft.steps.find((step) => step.name === 'Draft Release').env.RELEASE_BODY,
    '${{ needs.changelog.outputs.release_body }}'
  );
  assert.deepEqual(discord.needs, ['changelog', 'publish', 'publish-release']);
  assert.equal(
    discord.env.RELEASE_BODY,
    '${{ needs.changelog.outputs.release_body }}'
  );
  const discordScript = discord.steps.find(
    (step) => step.name === 'Send Discord announcement'
  ).run;
  assert.ok(
    discord.steps.some((step) => step.name === 'Checkout release tooling')
  );
  assert.match(discordScript, /discord-release-notes\.mjs --split/u);
  assert.match(discordScript, /wait=true/u);
  assert.doesNotMatch(
    discordScript,
    /3797|3800/u,
    'Discord announcements must not silently truncate later release-note sections'
  );
});

test('Discord release-note chunks preserve all text and stay within the limit', () => {
  const body = '#### Security\n- Secure every copy 🛡️.\n\n'.repeat(240);
  const chunks = splitDiscordReleaseBody(body, 3600);

  assert.ok(chunks.length > 1);
  assert.equal(chunks.join(''), body);
  assert.ok(chunks.every((chunk) => chunk.length <= 3600));
  assert.ok(chunks.every((chunk) => !/[\uD800-\uDBFF]$/u.test(chunk)));
  assert.throws(
    () => splitDiscordReleaseBody('🛡️', 1),
    /cannot fit this Unicode character/u
  );
});

test('a workflow dispatch can correct omitted notes for a published release', () => {
  const release = readWorkflow('release.yml');
  const correction = release.jobs['announce-security-correction'];

  assert.equal(
    release.on.workflow_dispatch.inputs.announce_security_correction.type,
    'boolean'
  );
  assert.equal(
    correction.if,
    "github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.announce_security_correction == true"
  );
  assert.match(
    correction.steps.find((step) => step.name === 'Post omitted security notes')
      .run,
    /releases\/tags\/\$\{TAG\}/u
  );
});

test('release platform digest validation is portable across grep implementations', () => {
  const releaseText = fs.readFileSync(
    path.join(workflowDirectory, 'release.yml'),
    'utf8'
  );

  assert.doesNotMatch(releaseText, /grep -Eq '\^(?:amd64|arm64)\\tsha256:/u);
  assert.equal((releaseText.match(/\[\[:blank:\]\]/gu) ?? []).length, 4);
});

test('release asset checksums match the builder sidecar names', () => {
  const releaseText = fs.readFileSync(
    path.join(workflowDirectory, 'release.yml'),
    'utf8'
  );
  const assetsText = fs.readFileSync(
    path.join(workflowDirectory, 'release-assets.yml'),
    'utf8'
  );

  assert.doesNotMatch(releaseText, /(?:\\.tar\\.gz|\\.zip)\\.sha256/u);
  assert.doesNotMatch(
    assetsText,
    /checksum="dist-release\/\$archive\.sha256"/u
  );
  assert.match(assetsText, /archive_base="\$\{archive%\.tar\.gz\}"/u);
  assert.match(assetsText, /archive_base="\$\{archive_base%\.zip\}"/u);
  assert.match(assetsText, /archive_base="\$\{archive_base%\.apk\}"/u);
  assert.match(assetsText, /archive_base="\$\{archive_base%\.aab\}-aab"/u);
  assert.match(assetsText, /checksum_base="\$\{checksum_base%\.aab\}-aab"/u);
});

test('manual main CI validates release notes against the selected commit parent', () => {
  const ci = readWorkflow('ci.yml');
  const validation = ci.jobs['release-notes'].steps.find(
    (step) => step.name === 'Validate release-note fragment or explicit opt-out'
  );

  assert.ok(validation);
  assert.deepEqual(validation.env, { HEAD_SHA: '${{ github.sha }}' });
  assert.match(validation.run, /git rev-parse --verify "\$\{HEAD_SHA\}\^1"/u);
  assert.match(
    validation.run,
    /git diff --quiet "\$base_sha" "\$HEAD_SHA" -- release-notes/u
  );
  assert.match(validation.run, /printf '%s' 'release-note: none'/u);
  assert.doesNotMatch(validation.run, /GITHUB_EVENT_NAME|pull_request|push/u);
  assert.doesNotMatch(validation.run, /\$\{\{/u);
  assert.match(validation.run, /--summary-file "\$GITHUB_STEP_SUMMARY"/u);
});

test('main CI release-note checks fetch tags with shallow history', () => {
  const ci = readWorkflow('ci.yml');
  const checkout = ci.jobs['release-notes'].steps.find(
    (step) => step.name === 'Checkout'
  );
  const changelogCheck = ci.jobs['release-notes'].steps.find((step) =>
    step.run?.includes('scripts/check-changelog-tags.mjs')
  );

  assert.equal(checkout?.with?.['fetch-depth'], 2);
  assert.equal(checkout?.with?.['fetch-tags'], true);
  assert.ok(changelogCheck);
});

test('containerized CI test jobs use pinned Debian images with Git available', () => {
  const ci = readWorkflow('ci.yml');
  const imagePattern = /^node:24\.22\.1-bookworm@sha256:[0-9a-f]{64}$/u;

  assert.match(ci.jobs['unit-test'].container.image, imagePattern);
  assert.match(ci.jobs['node-test'].container.image, imagePattern);
});

test('Cypress uses Cloud-only grouping metadata only when recording', () => {
  const workflow = readWorkflow('cypress.yml');
  const steps = workflow.jobs['cypress-run'].steps;
  const cache = steps.find((step) => step.name === 'Cache Cypress binary');
  const install = steps.find((step) => step.name === 'Install Cypress binary');
  const recordedRun = steps.find(
    (step) => step.name === 'Run Cypress suite with Cypress Cloud'
  );
  const localRun = steps.find(
    (step) => step.name === 'Run Cypress suite without Cypress Cloud'
  );
  const cacheDirectory = '${{ runner.temp }}/seerrng-cypress-cache';

  assert.equal(cache?.with?.path, cacheDirectory);
  assert.equal(install?.env?.CYPRESS_CACHE_FOLDER, cacheDirectory);
  assert.match(
    install?.run ?? '',
    /pnpm exec cypress install[\s\S]*pnpm exec cypress verify/u
  );
  assert.equal(recordedRun?.env?.CYPRESS_CACHE_FOLDER, cacheDirectory);
  assert.equal(localRun?.env?.CYPRESS_CACHE_FOLDER, cacheDirectory);
  assert.equal(recordedRun?.with?.record, true);
  assert.ok(recordedRun?.with?.group);
  assert.ok(recordedRun?.with?.['ci-build-id']);
  assert.equal(localRun?.with?.record, false);
  assert.equal(Object.hasOwn(localRun?.with ?? {}, 'group'), false);
  assert.equal(Object.hasOwn(localRun?.with ?? {}, 'ci-build-id'), false);
});

test('git-cliff skips all release-preparation commits', () => {
  const cliff = fs.readFileSync(
    path.join(rootDirectory, '.github', 'cliff.toml'),
    'utf8'
  );

  assert.match(cliff, /message = '\^chore\\\(release\\\):'/u);
});

test('git-cliff omits the removed automatic tag kickoff by commit SHA', () => {
  const cliff = fs.readFileSync(
    path.join(rootDirectory, '.github', 'cliff.toml'),
    'utf8'
  );

  assert.ok(
    cliff.includes(
      '{ sha = "3872d8dd53e76ad373d8ac9b871118765e03e241", skip = true }'
    )
  );
});

test('git-cliff includes build commits in the miscellaneous release history', () => {
  const cliff = fs.readFileSync(
    path.join(rootDirectory, '.github', 'cliff.toml'),
    'utf8'
  );

  assert.match(
    cliff,
    /message = "\^build\|\^chore\|\^ci", group = "<!-- 8 -->⚙️ Miscellaneous Tasks"/u
  );
});

test('git-cliff uses stable semantic-version tags as release boundaries', () => {
  const cliff = fs.readFileSync(
    path.join(rootDirectory, '.github', 'cliff.toml'),
    'utf8'
  );
  const tagPatternLine = cliff.match(/^tag_pattern = (.+)$/mu)?.[1];

  assert.ok(tagPatternLine);

  const tagPattern = JSON.parse(tagPatternLine);
  const matchesTag = new RegExp(tagPattern);

  assert.equal(matchesTag.test('v3.63.0'), true);
  assert.equal(matchesTag.test('3.63.0'), true);
  assert.equal(matchesTag.test('mobile-v3.63.0-ci.36'), false);
  assert.equal(matchesTag.test('v3.63.0-rc.1'), false);
});
