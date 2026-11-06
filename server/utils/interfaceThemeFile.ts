import fs from 'node:fs';
import path from 'node:path';

/** Read the same bounded regular file we validated, without following links. */
export const readInterfaceThemeFile = (
  filename: string,
  maxBytes: number
): string => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new Error('Invalid theme package size limit.');
  }
  const directory = path.dirname(path.resolve(filename));
  const parent = fs.lstatSync(directory);
  const before = fs.lstatSync(filename);
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1 ||
    before.size > maxBytes
  ) {
    throw new Error(
      'Theme package file is not a supported bounded regular file.'
    );
  }
  const descriptor = fs.openSync(
    filename,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW ?? 0) |
      (fs.constants.O_NONBLOCK ?? 0)
  );
  try {
    const opened = fs.fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.size > maxBytes ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    ) {
      throw new Error('Theme package file changed while opening.');
    }
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(
        descriptor,
        bytes,
        length,
        bytes.length - length,
        null
      );
      if (count === 0) break;
      length += count;
    }
    const after = fs.fstatSync(descriptor);
    const current = fs.lstatSync(filename);
    const currentParent = fs.lstatSync(directory);
    if (
      length > maxBytes ||
      after.nlink !== 1 ||
      after.size !== opened.size ||
      after.mtimeMs !== opened.mtimeMs ||
      after.ctimeMs !== opened.ctimeMs ||
      current.isSymbolicLink() ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      currentParent.isSymbolicLink() ||
      currentParent.dev !== parent.dev ||
      currentParent.ino !== parent.ino
    ) {
      throw new Error('Theme package file changed while reading.');
    }
    return bytes.subarray(0, length).toString('utf8');
  } finally {
    fs.closeSync(descriptor);
  }
};
