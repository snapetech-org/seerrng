import * as yaml from 'js-yaml';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const workflow = yaml.load(
  fs.readFileSync(
    path.join(rootDirectory, '.github', 'workflows', 'android.yml'),
    'utf8'
  )
);

test('Android workflow builds, tests on an emulator, and creates a debug APK', () => {
  const job = workflow.jobs.android;
  const releaseJob = workflow.jobs['android-release'];
  const sdkInstall = job.steps.find(
    (step) => step.name === 'Install Android SDK and emulator'
  );
  const kvm = job.steps.find(
    (step) => step.name === 'Enable KVM for Android emulator'
  );
  const build = job.steps.find(
    (step) => step.name === 'Run unit and emulator tests, then build debug APK'
  );
  const stopEmulator = job.steps.find(
    (step) => step.name === 'Stop Android emulator'
  );
  const releaseCandidate = releaseJob.steps.find(
    (step) => step.name === 'Build, install, and launch the signed release APK'
  );
  const releaseUpload = releaseJob.steps.find(
    (step) => step.name === 'Upload signed Android release candidate'
  );

  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(job['runs-on'], 'ubuntu-latest');
  assert.equal(releaseJob['runs-on'], 'ubuntu-latest');
  assert.ok(workflow.on.pull_request.paths.includes('android/**'));
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.doesNotMatch(JSON.stringify(job), /secrets\.ANDROID_KEYSTORE_/u);
  assert.equal(releaseJob.needs, 'android');
  assert.match(releaseJob.if, /github\.event_name != 'pull_request'/u);
  assert.match(releaseJob.if, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(sdkInstall.run, /system-images;android-36;google_apis;x86_64/u);
  assert.ok(kvm, 'KVM permissions must be prepared before emulator startup');
  assert.match(kvm.run, /sudo chmod 0666 \/dev\/kvm/u);
  assert.match(kvm.run, /-r \/dev\/kvm/u);
  assert.match(kvm.run, /-w \/dev\/kvm/u);
  assert.match(kvm.run, /GitHub runner does not expose \/dev\/kvm/u);
  assert.match(
    kvm.run,
    /cannot read and write \/dev\/kvm after permissions were updated/u
  );
  assert.ok(job.steps.indexOf(kvm) < job.steps.indexOf(build));
  assert.match(build.run, /:app:testDebugUnitTest/u);
  assert.match(build.run, /-p android/u);
  assert.match(build.run, /:app:connectedDebugAndroidTest/u);
  assert.match(build.run, /-PfreeSessionLimit=2/u);
  assert.match(build.run, /:app:assembleDebug/u);
  assert.match(build.run, /ANDROID_EMULATOR_PID=\$emulator_pid/u);
  assert.deepEqual(
    Object.keys(releaseCandidate.env).filter((name) =>
      /admob|monetization/iu.test(name)
    ),
    []
  );
  for (const secretName of [
    'ANDROID_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.equal(
      releaseCandidate.env[secretName],
      `\u0024{{ github.event_name != 'pull_request' && secrets.${secretName} }}`
    );
  }
  assert.match(releaseCandidate.run, /scripts\/build-android-release\.sh/u);
  assert.match(releaseCandidate.run, /emulator -avd seerrng-api36/u);
  assert.match(releaseCandidate.run, /adb install -r/u);
  assert.match(
    releaseCandidate.run,
    /org\.snapetech\.seerrng\/\.MainActivity/u
  );
  assert.ok(releaseUpload);
  assert.equal(stopEmulator.if, 'always()');
  assert.match(stopEmulator.run, /adb emu kill/u);
});
