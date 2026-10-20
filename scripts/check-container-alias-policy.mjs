import { readFileSync } from 'node:fs';

const releaseWorkflow = readFileSync('.github/workflows/release.yml', 'utf8');
const ciWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const manualPromotionWorkflow = readFileSync(
  '.github/workflows/promote-container-aliases.yml',
  'utf8'
);
const promotionScript = readFileSync(
  'scripts/promote-container-aliases.sh',
  'utf8'
);

function metadataTags(workflow, start, end) {
  const actionIndex = workflow.indexOf('uses: docker/metadata-action', start);

  if (actionIndex < 0 || (end >= 0 && actionIndex >= end)) {
    return [];
  }

  const lines = workflow
    .slice(actionIndex, end < 0 ? undefined : end)
    .split('\n');
  const tagsIndex = lines.findIndex((line) => /^\s+tags:\s*\|\s*$/u.test(line));

  if (tagsIndex < 0) {
    return [];
  }

  const keyIndent = lines[tagsIndex].match(/^\s*/u)[0].length;
  const tags = [];

  for (const line of lines.slice(tagsIndex + 1)) {
    const indent = line.match(/^\s*/u)[0].length;

    if (line.trim() && indent <= keyIndent) {
      break;
    }

    if (line.trim()) {
      tags.push(line.trim());
    }
  }

  return tags;
}

const requiredAliases = ['main', 'master', 'latest', 'stable'];
const publishStart = releaseWorkflow.indexOf('\n  publish:\n');
const scanStart = releaseWorkflow.indexOf('\n  scan-release-image:\n');
const publishBlock = releaseWorkflow.slice(publishStart, scanStart);
const releaseTags = metadataTags(releaseWorkflow, publishStart, scanStart);
const mainPublishStart = ciWorkflow.indexOf('\n  publish:\n');
const mainScanStart = ciWorkflow.indexOf('\n  scan-main-image:\n');
const mainPublishBlock = ciWorkflow.slice(mainPublishStart, mainScanStart);
const mainTags = metadataTags(ciWorkflow, mainPublishStart, mainScanStart);
const publishReleaseIndex = releaseWorkflow.indexOf('\n  publish-release:\n');
const promoteIndex = releaseWorkflow.indexOf(
  '\n  promote-stable-container-aliases:\n'
);

for (const alias of requiredAliases) {
  if (!promotionScript.includes(alias)) {
    console.error(`Post-publication promotion is missing the :${alias} alias.`);
    process.exitCode = 1;
  }
}

if (
  publishStart < 0 ||
  scanStart < 0 ||
  !publishBlock.includes('flavor: latest=false') ||
  releaseTags.length !== 1 ||
  releaseTags[0] !== 'type=semver,pattern={{raw}},value=${{ env.VERSION }}' ||
  /type=raw,value=(?:main|master|latest|stable)|pattern=v\{\{major\}\}/u.test(
    publishBlock
  )
) {
  console.error(
    'Release image builds must not move stable aliases before publication.'
  );
  process.exitCode = 1;
}

if (
  mainPublishStart < 0 ||
  mainScanStart < 0 ||
  !mainPublishBlock.includes('flavor: latest=false') ||
  mainTags.length !== 1 ||
  mainTags[0] !== 'type=sha' ||
  /type=raw,value=(?:main|master|latest|stable)/u.test(mainPublishBlock)
) {
  console.error(
    'Main CI must publish commit images without moving stable aliases.'
  );
  process.exitCode = 1;
}

if (
  publishReleaseIndex < 0 ||
  promoteIndex < 0 ||
  promoteIndex < publishReleaseIndex ||
  !releaseWorkflow.includes('needs: [publish-release]') ||
  !releaseWorkflow.includes(
    'bash scripts/promote-container-aliases.sh "$VERSION" "$GHCR_IMAGE" "$DOCKER_HUB"'
  ) ||
  !releaseWorkflow.includes('group: seerrng-stable-container-aliases')
) {
  console.error(
    'Stable image aliases must be promoted only after release publication.'
  );
  process.exitCode = 1;
}

if (
  !promotionScript.includes('bash scripts/verify-container-aliases.sh') ||
  !promotionScript.includes('minor_tag') ||
  !promotionScript.includes('major_tag')
) {
  console.error('Promotion must verify all version and stable alias digests.');
  process.exitCode = 1;
}

if (
  !manualPromotionWorkflow.includes(
    'scripts/latest-published-release-tag.sh'
  ) ||
  !manualPromotionWorkflow.includes('scripts/promote-container-aliases.sh') ||
  !manualPromotionWorkflow.includes('group: seerrng-stable-container-aliases')
) {
  console.error(
    'Manual recovery must promote only the latest published stable release.'
  );
  process.exitCode = 1;
}

if (!ciWorkflow.includes('node scripts/check-container-alias-policy.mjs')) {
  console.error('Main CI must run the stable container alias policy check.');
  process.exitCode = 1;
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('Stable container aliases are configured and digest-checked.');
