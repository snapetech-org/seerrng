import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function splitDiscordReleaseBody(body, maxLength = 3600) {
  if (typeof body !== 'string') {
    throw new TypeError('Release body must be a string.');
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new RangeError('Maximum chunk length must be a positive integer.');
  }
  if (body.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;
  while (start < body.length) {
    const limit = Math.min(start + maxLength, body.length);
    if (limit === body.length) {
      chunks.push(body.slice(start));
      break;
    }

    const newline = body.lastIndexOf('\n', limit - 1);
    let end = newline > start ? newline + 1 : limit;
    if (
      end < body.length &&
      end > start &&
      /[\uD800-\uDBFF]/u.test(body[end - 1]) &&
      /[\uDC00-\uDFFF]/u.test(body[end])
    ) {
      if (end === start + 1) {
        throw new RangeError(
          'Maximum chunk length cannot fit this Unicode character.'
        );
      }
      end -= 1;
    }

    chunks.push(body.slice(start, end));
    start = end;
  }

  return chunks;
}

// Discord trims embed text at its boundaries. Preserve all interior content
// while accepting that documented normalization in the returned message.
export function verifyDiscordReleaseResponse(response, payload) {
  const expected = payload?.embeds?.[0];
  const actual = response?.embeds?.[0];
  return (
    typeof response?.id === 'string' &&
    /^\d+$/.test(response.id) &&
    typeof expected?.description === 'string' &&
    expected.description.trim().length > 0 &&
    typeof actual?.description === 'string' &&
    actual.description.trim() === expected.description.trim() &&
    actual.title === expected.title
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--verify') {
    try {
      const payload = JSON.parse(await readFile(args[1], 'utf8'));
      const response = JSON.parse(await readStdin());
      if (!verifyDiscordReleaseResponse(response, payload)) {
        throw new Error('Response did not confirm the complete embed.');
      }
      process.stdout.write(
        `Confirmed Discord release-note message ${response.id}\n`
      );
    } catch {
      process.stderr.write(
        'Discord response did not confirm the complete release-note message.\n'
      );
      process.exitCode = 1;
    }
  } else if (args.length !== 1 || args[0] !== '--split') {
    process.stderr.write(
      'Usage: node scripts/discord-release-notes.mjs --split | --verify payload.json\n'
    );
    process.exitCode = 2;
  } else {
    const body = await readStdin();
    process.stdout.write(JSON.stringify(splitDiscordReleaseBody(body)) + '\n');
  }
}
