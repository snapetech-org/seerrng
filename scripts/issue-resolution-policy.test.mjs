import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

const directory = new URL('../.github/workflows/', import.meta.url);
const workflows = readdirSync(directory)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({
    name,
    source: readFileSync(new URL(name, directory), 'utf8'),
  }));

test('inactivity automation cannot close issues or contributions', () => {
  let found = 0;
  for (const { name, source } of workflows) {
    const steps = source.split(/\n\s{6}- /);
    for (const step of steps.filter((text) =>
      /uses:\s*actions\/stale@/.test(text)
    )) {
      found++;
      const inputs = Object.fromEntries(
        [
          ...step.matchAll(
            /^\s+(days-before(?:-issue|-pr)?-close):\s*['"]?(-?\d+)/gm
          ),
        ].map((match) => [match[1], Number(match[2])])
      );
      for (const kind of ['issue', 'pr']) {
        const days =
          inputs[`days-before-${kind}-close`] ?? inputs['days-before-close'];
        assert.ok(
          Number.isInteger(days) && days < 0,
          `${name}: inactivity must never close ${kind} records`
        );
      }
    }
  }
  assert.ok(found > 0, 'the inactivity workflow must be checked');
});

test('workflow labels cannot close or lock unresolved reports', () => {
  for (const { name, source } of workflows) {
    assert.doesNotMatch(
      source,
      /\bgh\s+(?:issue|pr)\s+(?:close|lock)\b/,
      `${name}: labels are not resolutions`
    );
    assert.doesNotMatch(
      source,
      /(?:octokit|github)\.(?:rest\.)?issues\.update[\s\S]{0,500}state:\s*['"]closed['"]/,
      `${name}: issue closure requires a verified resolution`
    );
  }
});

test('inactivity workflow can be validated without mutating reports', () => {
  const source = workflows.find(({ name }) => name === 'stale.yml')?.source;
  assert.ok(source);
  assert.match(source, /dry_run:[\s\S]*?default:\s*true/);
  assert.match(source, /debug-only:\s*\$\{\{\s*inputs\.dry_run\s*\}\}/);
});
