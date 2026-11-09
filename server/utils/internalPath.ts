/** A local navigation target must retain its origin after URL normalization. */
export const isInternalPath = (value: unknown): value is string => {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return false;
  if (
    [...value].some(
      (character) =>
        character === '\\' ||
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127
    )
  )
    return false;
  try {
    const decoded = decodeURIComponent(value);
    if (
      decoded.startsWith('//') ||
      [...decoded].some(
        (character) =>
          character === '\\' ||
          character.charCodeAt(0) < 32 ||
          character.charCodeAt(0) === 127
      )
    )
      return false;
    return (
      new URL(value, 'https://seerr.invalid').origin === 'https://seerr.invalid'
    );
  } catch {
    return false;
  }
};
