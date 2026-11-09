import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** An exception is bound to one rule and the entire reviewed file, never a glob. */
export function checkReport(
  report,
  baseline,
  root = process.cwd(),
  today = new Date().toISOString().slice(0, 10)
) {
  if (!Array.isArray(report.results) || !report.paths?.scanned?.length)
    throw new Error('Missing or incomplete Semgrep report.');
  const failures = [];
  const counts = new Map();
  for (const finding of report.results) {
    const relative = finding.path.replace(/^\.\//, '');
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(path.resolve(root) + path.sep))
      throw new Error('Scanner path escapes repository.');
    const sha256 = createHash('sha256')
      .update(fs.readFileSync(absolute))
      .digest('hex');
    const key = `${finding.check_id}:${relative}:${sha256}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const accepted = baseline.find(
      (entry) =>
        entry.rule === finding.check_id &&
        entry.path === relative &&
        entry.sha256 === sha256
    );
    if (
      !accepted ||
      !accepted.owner ||
      !accepted.reason ||
      typeof accepted.expires !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(accepted.expires) ||
      !Number.isFinite(Date.parse(accepted.expires)) ||
      !Number.isSafeInteger(accepted.count) ||
      accepted.count < 1 ||
      accepted.expires < today ||
      count > accepted.count
    )
      failures.push(
        `${relative}:${finding.start?.line ?? '?'} ${finding.check_id}`
      );
  }
  for (const error of report.errors ?? []) {
    if (error.level === 'error') failures.push(`Scanner error: ${error.type}`);
  }
  return failures;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const baseline = JSON.parse(
    fs.readFileSync('config/security/semgrep-reviewed.json', 'utf8')
  );
  const failures = checkReport(report, baseline);
  console.log(
    `Semgrep: ${report.results.length} findings; ${failures.length} unreviewed/changed/expired findings; ${(report.errors ?? []).length} parser/engine diagnostics retained in report.`
  );
  if (failures.length) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
  }
}
