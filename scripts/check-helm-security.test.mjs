import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import * as yaml from 'js-yaml';

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const chartDirectory = path.join(rootDirectory, 'charts', 'seerr-chart');
const testImage =
  'busybox:1.37.0@sha256:9532d8c39891ca2ecde4d30d7710e01fb739c87a8b9299685c63704296b16028';
const chart = yaml.load(
  fs.readFileSync(path.join(chartDirectory, 'Chart.yaml'), 'utf8')
);
const packageManifest = JSON.parse(
  fs.readFileSync(path.join(rootDirectory, 'package.json'), 'utf8')
);

const renderChart = (...args) => {
  const result = spawnSync(
    'helm',
    ['template', 'security-test', chartDirectory, ...args],
    {
      cwd: rootDirectory,
      encoding: 'utf8',
    }
  );

  assert.equal(
    result.status,
    0,
    `helm template failed\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
  );

  const documents = [];
  yaml.loadAll(result.stdout, (document) => {
    if (document) documents.push(document);
  });
  return documents;
};

const renderChartFailure = (...args) => {
  const result = spawnSync(
    'helm',
    ['template', 'security-test', chartDirectory, ...args],
    {
      cwd: rootDirectory,
      encoding: 'utf8',
    }
  );

  assert.notEqual(
    result.status,
    0,
    `helm template unexpectedly accepted invalid values\nstdout: ${result.stdout}`
  );
  return `${result.stdout}\n${result.stderr}`;
};

const findDocument = (documents, kind, predicate = () => true) => {
  const document = documents.find(
    (candidate) => candidate.kind === kind && predicate(candidate)
  );
  assert.ok(document, `${kind} was not rendered`);
  return document;
};

const assertNoAmbientContainerPrivileges = (securityContext) => {
  assert.equal(securityContext.allowPrivilegeEscalation, false);
  assert.equal(securityContext.runAsNonRoot, true);
  assert.deepEqual(securityContext.capabilities?.drop, ['ALL']);
};

test('chart defaults to the current application release', () => {
  assert.equal(chart.appVersion, `v${packageManifest.version}`);
  assert.match(chart.version, /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u);

  const documents = renderChart();
  const statefulSet = findDocument(documents, 'StatefulSet');
  assert.equal(
    statefulSet.spec.template.spec.containers[0].image,
    `ghcr.io/snapetech-org/seerrng:${chart.appVersion}`
  );
});

test('default workload denies ambient Kubernetes credentials and privileges', () => {
  const documents = renderChart();
  const statefulSet = findDocument(documents, 'StatefulSet');
  const podSpec = statefulSet.spec.template.spec;
  const container = podSpec.containers[0];

  assert.equal(podSpec.automountServiceAccountToken, false);
  assert.equal(podSpec.enableServiceLinks, false);
  assert.equal(podSpec.securityContext.fsGroup, 1000);
  assertNoAmbientContainerPrivileges(container.securityContext);
  assert.equal(container.securityContext.privileged, false);
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.equal(container.securityContext.seccompProfile.type, 'RuntimeDefault');
  assert.equal('subPath' in container.volumeMounts[0], false);
  assert.deepEqual(
    container.volumeMounts.slice(1).map(({ name, mountPath }) => ({
      name,
      mountPath,
    })),
    [
      { name: 'runtime-tmp', mountPath: '/tmp' },
      { name: 'next-cache', mountPath: '/app/.next/cache' },
    ]
  );
  assert.equal(podSpec.volumes[1].emptyDir.sizeLimit, '64Mi');
  assert.equal(podSpec.volumes[2].emptyDir.sizeLimit, '256Mi');
  assert.equal(container.livenessProbe.httpGet.path, '/api/v1/settings/public');
  assert.equal(container.readinessProbe.httpGet.path, '/api/v1/status/ready');
  assert.equal(container.startupProbe.httpGet.path, '/api/v1/settings/public');
  assert.equal(container.startupProbe.httpGet.port, 'http');
  assert.equal(container.startupProbe.periodSeconds, 5);
  assert.equal(container.startupProbe.failureThreshold, 120);
});

test('configured persistence subPath is rendered as a string', () => {
  const documents = renderChart('--set-string', 'config.persistence.subPath=0');
  const statefulSet = findDocument(documents, 'StatefulSet');

  assert.equal(
    statefulSet.spec.template.spec.containers[0].volumeMounts[0].subPath,
    '0'
  );
});

test('reusing an existing ServiceAccount does not re-enable token mounting', () => {
  const documents = renderChart('--set', 'serviceAccount.create=false');
  const statefulSet = findDocument(documents, 'StatefulSet');

  assert.equal(
    statefulSet.spec.template.spec.automountServiceAccountToken,
    false
  );
});

test('ServiceAccount token mounting requires an explicit opt-in', () => {
  const documents = renderChart('--set', 'serviceAccount.automount=true');
  const statefulSet = findDocument(documents, 'StatefulSet');

  assert.equal(
    statefulSet.spec.template.spec.automountServiceAccountToken,
    true
  );
});

test('chart schema rejects malformed security-critical values', () => {
  assert.match(
    renderChartFailure('--set-string', 'serviceAccount.automount=false'),
    /serviceAccount[/.]automount/u
  );
  assert.match(
    renderChartFailure('--set', 'service.port=65536'),
    /service[/.]port/u
  );
  assert.match(
    renderChartFailure('--set-string', 'image.sha=sha256:not-a-digest'),
    /image[/.]sha/u
  );
  assert.match(
    renderChartFailure('--set', 'securityContext.runAsNonRoot=false'),
    /securityContext[/.]runAsNonRoot/u
  );
});

test('Helm connection test is immutable and runs without ambient privileges', () => {
  const documents = renderChart();
  const hookPod = findDocument(
    documents,
    'Pod',
    (document) => document.metadata.annotations?.['helm.sh/hook'] === 'test'
  );
  const container = hookPod.spec.containers[0];

  assert.equal(hookPod.spec.automountServiceAccountToken, false);
  assert.equal(hookPod.spec.securityContext.runAsNonRoot, true);
  assert.equal(
    hookPod.spec.securityContext.seccompProfile.type,
    'RuntimeDefault'
  );
  assert.equal(container.image, testImage);
  assertNoAmbientContainerPrivileges(container.securityContext);
  assert.equal(container.securityContext.readOnlyRootFilesystem, true);
  assert.deepEqual(container.command, ['wget']);
  assert.equal(container.args[0], '--spider');
});
