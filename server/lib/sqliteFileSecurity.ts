import logger from '@server/logger';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertNoSymlinkDirectoryComponents,
  isTolerableChmodError,
} from './pathSecurity';

export const PRIVATE_SQLITE_DIRECTORY_MODE = 0o700;
export const PRIVATE_SQLITE_FILE_MODE = 0o600;

const lstatIfPresent = (filePath: string): fs.Stats | undefined => {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

// Call only before opening a SQLite connection in this process: closing any
// descriptor for its files can release SQLite's POSIX advisory locks.
export const secureSqliteDatabaseFiles = (databasePath: string): void => {
  const databaseDirectory = path.dirname(databasePath);
  assertNoSymlinkDirectoryComponents(databaseDirectory, {
    allowMissing: true,
    label: 'SQLite database directory',
  });
  fs.mkdirSync(databaseDirectory, {
    recursive: true,
    mode: PRIVATE_SQLITE_DIRECTORY_MODE,
  });
  const directoryStat = lstatIfPresent(databaseDirectory);
  if (directoryStat) {
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error('SQLite database directory must not be a symlink');
    }
    try {
      fs.chmodSync(databaseDirectory, PRIVATE_SQLITE_DIRECTORY_MODE);
    } catch (error) {
      if (!isTolerableChmodError(error)) throw error;
      logger.warn(
        'Unable to set restrictive permissions on the SQLite database directory; continuing with its existing permissions.',
        {
          label: 'Database',
          directory: databaseDirectory,
          errorMessage: (error as Error).message,
        }
      );
    }
  }

  // Create an empty private database before SQLite opens it. Besides protecting
  // first-run installs, this gives SQLite's sidecars a private mode to inherit
  // without reopening database descriptors after SQLite acquires its locks.
  if (!lstatIfPresent(databasePath)) {
    try {
      const descriptor = fs.openSync(
        databasePath,
        fs.constants.O_CREAT |
          fs.constants.O_EXCL |
          fs.constants.O_RDWR |
          (fs.constants.O_NOFOLLOW ?? 0),
        PRIVATE_SQLITE_FILE_MODE
      );
      fs.closeSync(descriptor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  for (const filePath of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
  ]) {
    const fileStat = lstatIfPresent(filePath);
    if (!fileStat) {
      continue;
    }
    if (
      !fileStat.isFile() ||
      fileStat.isSymbolicLink() ||
      fileStat.nlink !== 1
    ) {
      throw new Error(
        `SQLite database path must be a regular file: ${filePath}`
      );
    }

    const descriptor = fs.openSync(
      filePath,
      fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0)
    );
    try {
      const descriptorStat = fs.fstatSync(descriptor);
      if (!descriptorStat.isFile() || descriptorStat.nlink !== 1) {
        throw new Error(
          `SQLite database path must be a regular file: ${filePath}`
        );
      }
      try {
        fs.fchmodSync(descriptor, PRIVATE_SQLITE_FILE_MODE);
      } catch (error) {
        if (!isTolerableChmodError(error)) throw error;
        logger.warn(
          'Unable to set restrictive permissions on a SQLite database file; continuing with its existing permissions.',
          {
            label: 'Database',
            filePath,
            errorMessage: (error as Error).message,
          }
        );
      }
    } finally {
      fs.closeSync(descriptor);
    }
  }
};
