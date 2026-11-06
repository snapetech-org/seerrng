export interface ApiMessageMatch<Key extends string = string> {
  key: Key;
  values: Record<string, string>;
}

export type ApiMessagePattern<Key extends string = string> = readonly [
  Key,
  readonly string[],
];

/** Decode only the literal quoting and ordered placeholders emitted by our
 * source catalog generator. Never pass translated or provider-authored text. */
export const getGeneratedApiMessageParts = (message: string): string[] => {
  const parts = [''];
  for (let offset = 0; offset < message.length;) {
    if (message.startsWith("''", offset)) {
      parts[parts.length - 1] += "'";
      offset += 2;
    } else if (
      message[offset] === "'" &&
      ['{', '}', '<'].includes(message[offset + 1]) &&
      message[offset + 2] === "'"
    ) {
      parts[parts.length - 1] += message[offset + 1];
      offset += 3;
    } else {
      const placeholder = `{value${parts.length - 1}}`;
      if (message.startsWith(placeholder, offset)) {
        parts.push('');
        offset += placeholder.length;
      } else {
        parts[parts.length - 1] += message[offset++];
      }
    }
  }
  return parts;
};

type TemplateCapture =
  { state: 'matched'; values: string[] } | { state: 'ambiguous' };

/**
 * Capture opaque data only when each literal boundary has a unique position.
 * A provider value or path can itself contain the boundary text, so choosing
 * the first occurrence could move part of that value into another placeholder.
 */
const captureValues = (
  parts: readonly string[],
  message: string
): TemplateCapture | undefined => {
  if (!message.startsWith(parts[0])) return undefined;
  const suffix = parts[parts.length - 1];
  if (!message.endsWith(suffix)) return undefined;
  const end = message.length - suffix.length;
  let position = parts[0].length;
  if (position > end) return undefined;
  const values: string[] = [];
  for (let index = 1; index < parts.length - 1; index += 1) {
    const boundary = parts[index];
    if (!boundary) return { state: 'ambiguous' };
    const next = message.indexOf(boundary, position);
    if (next < position || next + boundary.length > end) return undefined;
    const repeated = message.indexOf(boundary, next + 1);
    if (repeated >= 0 && repeated + boundary.length <= end) {
      return { state: 'ambiguous' };
    }
    values.push(message.slice(position, next));
    position = next + boundary.length;
  }
  values.push(message.slice(position, end));
  return { state: 'matched', values };
};

/** Match authored phrases only; never translate the captured data itself. */
export const createApiMessageMatcher = <Key extends string>(
  patterns: readonly ApiMessagePattern<Key>[]
): ((message: string) => ApiMessageMatch<Key> | undefined) => {
  const exact = new Map<string, Key>();
  const templates: {
    key: Key;
    parts: readonly string[];
    specificity: number;
  }[] = [];
  for (const [key, parts] of patterns) {
    if (parts.length === 1) exact.set(parts[0], key);
    else if (parts.length > 1)
      templates.push({ key, parts, specificity: parts.join('').length });
  }
  templates.sort((left, right) => right.specificity - left.specificity);
  return (message) => {
    const exactKey = exact.get(message);
    if (exactKey) return { key: exactKey, values: {} };
    // Unknown/large provider output remains verbatim and avoids template work.
    if (message.length > 16_384) return undefined;
    for (const template of templates) {
      const capture = captureValues(template.parts, message);
      if (capture?.state === 'ambiguous') return undefined;
      if (capture?.state === 'matched')
        return {
          key: template.key,
          values: Object.fromEntries(
            capture.values.map((value, index) => [`value${index}`, value])
          ),
        };
    }
    return undefined;
  };
};
