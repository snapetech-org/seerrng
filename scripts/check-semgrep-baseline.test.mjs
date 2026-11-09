import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkReport } from './check-semgrep-baseline.mjs';

test('only exact reviewed findings pass; new, changed, duplicate and expired findings fail', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seerr-security-gate-'));
  try {
    fs.writeFileSync(path.join(root, 'fixture.js'), 'reviewed();');
    const finding = {
      check_id: 'fixture.rule',
      path: 'fixture.js',
      start: { line: 1 },
    };
    const report = {
      results: [finding],
      paths: { scanned: ['fixture.js'] },
      errors: [],
    };
    const baseline = [
      {
        rule: finding.check_id,
        path: finding.path,
        sha256: createHash('sha256').update('reviewed();').digest('hex'),
        count: 1,
        owner: 'Security maintainers',
        reason: 'Test fixture',
        expires: '2026-12-01',
      },
    ];
    assert.equal(checkReport(report, [], root, '2026-11-09').length, 1);
    assert.deepEqual(checkReport(report, baseline, root, '2026-11-09'), []);
    assert.equal(
      checkReport(
        report,
        [{ ...baseline[0], expires: undefined }],
        root,
        '2026-11-09'
      ).length,
      1
    );
    assert.equal(checkReport(report, baseline, root, '2027-01-01').length, 1);
    assert.equal(
      checkReport(
        { ...report, results: [finding, finding] },
        baseline,
        root,
        '2026-11-09'
      ).length,
      1
    );
    fs.writeFileSync(path.join(root, 'fixture.js'), 'changed();');
    assert.equal(checkReport(report, baseline, root, '2026-11-09').length, 1);
    assert.throws(
      () => checkReport({ results: [] }, baseline, root),
      /incomplete/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
