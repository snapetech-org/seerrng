import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';

export const commitTypes = Object.freeze([
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
]);

export function formatCommitMessage({
  type,
  scope = '',
  subject,
  body = '',
  breakingChange = '',
  issues = '',
}) {
  if (!commitTypes.includes(type))
    throw new Error(`Unsupported Conventional Commit type: ${type}`);
  if (typeof subject !== 'string' || !subject.trim() || /[\r\n]/u.test(subject))
    throw new Error('Commit subject must be a non-empty single line');
  if (typeof scope !== 'string' || /[\r\n()]/u.test(scope))
    throw new Error('Commit scope must be a single line without parentheses');

  const header = `${type}${scope.trim() ? `(${scope.trim()})` : ''}: ${subject.trim()}`;
  const sections = [header];
  if (body.trim()) sections.push(body.trim());
  if (breakingChange.trim())
    sections.push(`BREAKING CHANGE: ${breakingChange.trim()}`);
  if (issues.trim()) sections.push(`Closes ${issues.trim()}`);
  return `${sections.join('\n\n')}\n`;
}

async function ask(terminal, prompt, defaultValue = '') {
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  const value = await terminal.question(`${prompt}${suffix}: `);
  return value.trim() || defaultValue;
}

async function promptForCommitMessage(path) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    console.log(`Conventional Commit types: ${commitTypes.join(', ')}`);
    const type = await ask(terminal, 'Type', 'feat');
    if (!commitTypes.includes(type))
      throw new Error(`Choose one of: ${commitTypes.join(', ')}`);
    const scope = await ask(terminal, 'Scope (optional)');
    const subject = await ask(terminal, 'Short description');
    const body = await ask(terminal, 'Body (optional)');
    const breakingChange = await ask(terminal, 'Breaking change (optional)');
    const issues = await ask(terminal, 'Issue references (optional)');
    writeFileSync(
      path,
      formatCommitMessage({
        type,
        scope,
        subject,
        body,
        breakingChange,
        issues,
      }),
      'utf8'
    );
  } finally {
    terminal.close();
  }
}

async function main(args) {
  const [messagePath, source] = args;
  if (!messagePath)
    throw new Error('Git did not provide a commit message file');
  if (source && source !== 'template') return;

  const originalMessage = readFileSync(messagePath, 'utf8');
  if (
    originalMessage
      .split('\n')
      .some((line) => line.trim() && !line.trim().startsWith('#'))
  )
    return;

  await promptForCommitMessage(messagePath);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[commit prompt] ${error.message}`);
    process.exitCode = 1;
  });
}
