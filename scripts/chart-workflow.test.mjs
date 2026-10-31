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
const workflow = yaml.load(
  fs.readFileSync(
    path.join(rootDirectory, '.github', 'workflows', 'lint-helm-charts.yml'),
    'utf8'
  )
);
const ciWorkflow = yaml.load(
  fs.readFileSync(
    path.join(rootDirectory, '.github', 'workflows', 'ci.yml'),
    'utf8'
  )
);
const steps = workflow.jobs['lint-test'].steps;

test('chart and tooling validation use the current CI triggers and tools', () => {
  const docs = steps.find(
    (step) => step.name === 'Verify generated chart documentation'
  );
  const lint = steps.find((step) => step.name === 'Lint every Helm chart');

  assert.ok(docs);
  assert.match(docs.run, /find charts .*Chart\.yaml/u);
  assert.match(lint.run, /ct lint --all --validate-maintainers=false/iu);
  const chartRunner = workflow.jobs['lint-test']['runs-on'];
  assert.match(chartRunner, /"group":"ng-shared-main-jit"/u);
  assert.match(chartRunner, /"ng-shared-main-seerrng"/u);
  assert.match(chartRunner, /github\.run_id/u);
  assert.doesNotMatch(chartRunner, /(?:ubuntu|macos|windows)-latest/u);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_call'));
  assert.equal(ciWorkflow.on.push, undefined);
  assert.equal(Object.hasOwn(ciWorkflow.on, 'pull_request'), false);
  assert.ok(Object.hasOwn(ciWorkflow.on, 'workflow_dispatch'));
  assert.deepEqual(ciWorkflow.on.pull_request_target.branches, ['main']);
  assert.deepEqual(ciWorkflow.on.pull_request_target.types, [
    'opened',
    'synchronize',
    'reopened',
    'labeled',
  ]);
  assert.deepEqual(ciWorkflow.on.workflow_dispatch.inputs.runner_pool.options, [
    'private',
  ]);
  assert.deepEqual(ciWorkflow.on.workflow_dispatch.inputs.action.options, [
    'ci',
    'publish-image',
  ]);
  assert.equal(ciWorkflow.on.workflow_dispatch.inputs.action.required, true);
  assert.equal(
    ciWorkflow.on.workflow_dispatch.inputs.runner_pool.required,
    true
  );
  const toolingSteps = ciWorkflow.jobs['i18n-and-tooling'].steps;
  const checkout = toolingSteps.find((step) => step.name === 'Checkout');
  const helmSetup = toolingSteps.find(
    (step) => step.name === 'Set up Helm for chart security tests'
  );
  assert.equal(checkout.with['fetch-tags'], true);
  assert.equal(
    helmSetup.uses,
    'azure/setup-helm@9bc31f4ebc9c6b171d7bfbaa5d006ae7abdb4310'
  );
  assert.equal(
    ciWorkflow.jobs.helm.uses,
    './.github/workflows/lint-helm-charts.yml'
  );
  assert.equal(ciWorkflow.jobs.helm.with, undefined);
});
