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

test('chart validation runs generated documentation and all charts directly', () => {
  const docs = steps.find(
    (step) => step.name === 'Verify generated chart documentation'
  );
  const lint = steps.find((step) => step.name === 'Lint every Helm chart');

  assert.ok(docs);
  assert.match(docs.run, /find charts .*Chart\.yaml/u);
  assert.match(lint.run, /ct lint --all --validate-maintainers=false/iu);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_call'));
  assert.deepEqual(ciWorkflow.on.push.branches, ['main']);
  assert.deepEqual(ciWorkflow.on.pull_request.branches, ['main']);
  assert.equal(Object.hasOwn(ciWorkflow.on, 'pull_request_target'), false);
  assert.equal(
    ciWorkflow.jobs.helm.uses,
    './.github/workflows/lint-helm-charts.yml'
  );
  assert.equal(ciWorkflow.jobs.helm.with, undefined);
});
