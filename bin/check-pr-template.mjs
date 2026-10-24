#!/usr/bin/env node
/**
 * Validate that a pull request body follows the PR template.
 *
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const bodyFile = process.argv[2];

if (!bodyFile) {
  console.error('body file path is required as an argument.');
  process.exit(2);
}

const body = readFileSync(resolve(bodyFile), 'utf8');
const issues = [];

const MAINTAINER_ROLES = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const isMaintainer = MAINTAINER_ROLES.includes(
  process.env.AUTHOR_ASSOCIATION ?? ''
);

const stripComments = (s) => {
  let result = s;
  let previous;
  do {
    previous = result;
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  } while (result !== previous);
  return result;
};

const stripFixesPlaceholder = (s) => s.replace(/-\s*Fixes\s*`?#XXXX`?/gi, '');

const descriptionMatch = body.match(/## Description\s*\n([\s\S]*?)(?=\n## |$)/);
const descriptionContent = descriptionMatch
  ? stripFixesPlaceholder(stripComments(descriptionMatch[1])).trim()
  : '';

if (!descriptionContent) {
  issues.push(
    '**Description** section is empty or only contains placeholder text.'
  );
}

const testingMatch = body.match(
  /## How Has This Been Tested\?\s*\n([\s\S]*?)(?=\n## |$)/
);
const testingContent = testingMatch
  ? stripComments(testingMatch[1]).trim()
  : '';

if (!testingContent) {
  issues.push('**How Has This Been Tested?** section is empty.');
}

const releaseNotesMatch = body.match(
  /## Release Notes\s*\n([\s\S]*?)(?=\n## |$)/
);
const releaseNotesContent = releaseNotesMatch
  ? stripComments(releaseNotesMatch[1]).trim()
  : '';
const releaseNoteOptions =
  releaseNotesContent.match(/- \[[ x]\][^\n]*/gi) || [];
const hasReleaseNoteFragment =
  /- \[x\][^\n]*I added a (?:validated )?release-note fragment/iu.test(
    releaseNotesContent
  );
const hasInternalOnlyOptOut =
  /- \[x\][^\n]*This change is internal-only/iu.test(releaseNotesContent);

if (!releaseNotesContent) {
  issues.push('**Release Notes** section is missing or empty.');
} else if (releaseNoteOptions.length === 0) {
  issues.push(
    '**Release Notes** must select a release-note fragment or the internal-only opt-out.'
  );
} else if (hasReleaseNoteFragment === hasInternalOnlyOptOut) {
  issues.push(
    '**Release Notes** must select exactly one primary option: add a release-note fragment or mark the change internal-only. Supporting confirmation boxes may also be checked.'
  );
}

const checklistMatch = body.match(/## Checklist:\s*\n([\s\S]*?)$/);
const checklistContent = checklistMatch ? checklistMatch[1] : '';

const totalBoxes = (checklistContent.match(/- \[[ x]\]/gi) || []).length;
const checkedBoxes = (checklistContent.match(/- \[x\]/gi) || []).length;

if (totalBoxes === 0) {
  issues.push('**Checklist** section is missing or has been removed.');
} else if (checkedBoxes === 0) {
  issues.push(
    'No items in the **checklist** have been checked. Please review and check all applicable items.'
  );
}

if (
  !/- \[x\] I have read and followed the contribution/i.test(checklistContent)
) {
  issues.push('The **contribution guidelines** checkbox has not been checked.');
}

if (
  !isMaintainer &&
  !/- \[x\] Disclosed any use of AI/i.test(checklistContent)
) {
  issues.push('The **AI disclosure** checkbox has not been checked.');
}

if (/-\s*Fixes\s*`?#XXXX`?/i.test(body)) {
  issues.push(
    'The `Fixes #XXXX` placeholder has not been updated. Please link the relevant issue or remove it.'
  );
}

console.log(JSON.stringify(issues));
process.exit(issues.length > 0 ? 1 : 0);
