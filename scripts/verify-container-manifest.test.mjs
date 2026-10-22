import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const rootDirectory = path.resolve(import.meta.dirname, '..');
const verifier = path.join(
  rootDirectory,
  'scripts',
  'verify-container-manifest.sh'
);
const requiresPosixBash =
  process.platform === 'win32'
    ? 'Requires POSIX bash; the Linux CI tooling suite remains authoritative.'
    : false;

test(
  'ignores unknown-platform provenance descriptors when verifying platforms',
  { skip: requiresPosixBash },
  () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'seerrng-manifest-test-')
    );
    try {
      const dockerPath = path.join(temporaryDirectory, 'docker');
      const fixturePath = path.join(temporaryDirectory, 'manifest.json');
      writeFileSync(
        fixturePath,
        JSON.stringify({
          manifests: [
            {
              digest: 'sha256:' + 'a'.repeat(64),
              platform: { architecture: 'amd64', os: 'linux' },
            },
            {
              digest: 'sha256:' + 'b'.repeat(64),
              platform: { architecture: 'arm64', os: 'linux' },
            },
            {
              annotations: {
                'vnd.docker.reference.type': 'attestation-manifest',
              },
              digest: 'sha256:' + 'c'.repeat(64),
              platform: { architecture: 'unknown', os: 'unknown' },
            },
          ],
          mediaType: 'application/vnd.oci.image.index.v1+json',
        })
      );
      writeFileSync(
        dockerPath,
        '#!/usr/bin/env bash\ncat "$MANIFEST_FIXTURE"\n',
        { mode: 0o755 }
      );

      const result = spawnSync(
        'bash',
        [
          verifier,
          '--require-provenance',
          'example:tag',
          'linux/amd64',
          'linux/arm64',
        ],
        {
          env: {
            ...process.env,
            MANIFEST_FIXTURE: fixturePath,
            PATH: `${temporaryDirectory}:${process.env.PATH}`,
          },
          encoding: 'utf8',
        }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stdout,
        /Verified example:tag: linux\/amd64, linux\/arm64/
      );

      const compatibleResult = spawnSync(
        'bash',
        [
          verifier,
          '--require-compatible-manifest',
          'example:tag',
          'linux/amd64',
          'linux/arm64',
        ],
        {
          env: {
            ...process.env,
            MANIFEST_FIXTURE: fixturePath,
            PATH: `${temporaryDirectory}:${process.env.PATH}`,
          },
          encoding: 'utf8',
        }
      );
      assert.equal(compatibleResult.status, 0, compatibleResult.stderr);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
);

test(
  'requires Docker v2 manifests for Unraid-compatible stable releases',
  { skip: requiresPosixBash },
  () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'seerrng-docker-manifest-test-')
    );
    try {
      const dockerPath = path.join(temporaryDirectory, 'docker');
      const fixturePath = path.join(temporaryDirectory, 'manifest.json');
      const manifest = {
        manifests: [
          {
            digest: 'sha256:' + 'a'.repeat(64),
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            platform: { architecture: 'amd64', os: 'linux' },
          },
          {
            digest: 'sha256:' + 'b'.repeat(64),
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            platform: { architecture: 'arm64', os: 'linux' },
          },
        ],
        mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
      };
      writeFileSync(fixturePath, JSON.stringify(manifest));
      writeFileSync(
        dockerPath,
        '#!/usr/bin/env bash\ncat "$MANIFEST_FIXTURE"\n',
        { mode: 0o755 }
      );

      const runVerifier = () =>
        spawnSync(
          'bash',
          [
            verifier,
            '--require-docker-list',
            'example:tag',
            'linux/amd64',
            'linux/arm64',
          ],
          {
            env: {
              ...process.env,
              MANIFEST_FIXTURE: fixturePath,
              PATH: `${temporaryDirectory}:${process.env.PATH}`,
            },
            encoding: 'utf8',
          }
        );

      const compatibleResult = runVerifier();
      assert.equal(compatibleResult.status, 0, compatibleResult.stderr);

      manifest.mediaType = 'application/vnd.oci.image.index.v1+json';
      writeFileSync(fixturePath, JSON.stringify(manifest));
      const ociIndexResult = runVerifier();
      assert.notEqual(ociIndexResult.status, 0);
      assert.match(ociIndexResult.stderr, /not a Docker v2 manifest list/u);

      manifest.mediaType =
        'application/vnd.docker.distribution.manifest.list.v2+json';
      manifest.manifests[1].mediaType =
        'application/vnd.oci.image.manifest.v1+json';
      writeFileSync(fixturePath, JSON.stringify(manifest));
      const ociChildResult = runVerifier();
      assert.notEqual(ociChildResult.status, 0);
      assert.match(ociChildResult.stderr, /non-Docker child manifest/u);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
);

test(
  'retries transient registry inspection failures',
  { skip: requiresPosixBash },
  () => {
    const temporaryDirectory = mkdtempSync(
      path.join(tmpdir(), 'seerrng-manifest-retry-test-')
    );
    try {
      const dockerPath = path.join(temporaryDirectory, 'docker');
      const fixturePath = path.join(temporaryDirectory, 'manifest.json');
      const attemptPath = path.join(temporaryDirectory, 'attempt');
      writeFileSync(
        fixturePath,
        JSON.stringify({
          manifests: [
            {
              digest: 'sha256:' + 'a'.repeat(64),
              platform: { architecture: 'amd64', os: 'linux' },
            },
            {
              digest: 'sha256:' + 'b'.repeat(64),
              platform: { architecture: 'arm64', os: 'linux' },
            },
          ],
          mediaType: 'application/vnd.oci.image.index.v1+json',
        })
      );
      writeFileSync(
        dockerPath,
        `#!/usr/bin/env bash
set -euo pipefail
if [[ ! -f "$ATTEMPT_FILE" ]]; then
  touch "$ATTEMPT_FILE"
  echo 'temporary registry timeout' >&2
  exit 1
fi
cat "$MANIFEST_FIXTURE"
`,
        { mode: 0o755 }
      );

      const result = spawnSync(
        'bash',
        [verifier, 'example:tag', 'linux/amd64', 'linux/arm64'],
        {
          env: {
            ...process.env,
            ATTEMPT_FILE: attemptPath,
            MANIFEST_FIXTURE: fixturePath,
            PATH: `${temporaryDirectory}:${process.env.PATH}`,
          },
          encoding: 'utf8',
        }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(
        result.stderr,
        /Manifest inspection failed for example:tag; retrying in 1s\./
      );
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
);
