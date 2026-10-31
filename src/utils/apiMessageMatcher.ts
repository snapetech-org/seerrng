export interface ApiMessageMatch<Key extends string = string> {
  key: Key;
  values: Record<string, string>;
}

export type ApiMessagePattern<Key extends string = string> = readonly [
  Key,
  readonly string[],
];

/** Capture opaque data between literal fragments without regex backtracking. */
const captureValues = (
  parts: readonly string[],
  message: string
): string[] | undefined => {
  if (!message.startsWith(parts[0])) return undefined;
  const suffix = parts[parts.length - 1];
  if (!message.endsWith(suffix)) return undefined;
  const end = message.length - suffix.length;
  let position = parts[0].length;
  if (position > end) return undefined;
  const values: string[] = [];
  for (let index = 1; index < parts.length - 1; index += 1) {
    const next = message.indexOf(parts[index], position);
    if (next < position || next + parts[index].length > end) return undefined;
    values.push(message.slice(position, next));
    position = next + parts[index].length;
  }
  values.push(message.slice(position, end));
  return values;
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
      const values = captureValues(template.parts, message);
      if (values)
        return {
          key: template.key,
          values: Object.fromEntries(
            values.map((value, index) => [`value${index}`, value])
          ),
        };
    }
    return undefined;
  };
};
