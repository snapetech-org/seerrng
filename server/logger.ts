/* eslint-disable no-console */
import {
  PRIVATE_LOG_FILE_MODE,
  secureLogDirectory,
} from '@server/lib/logFileSecurity';
import { isSecretFieldName, redactSecrets } from '@server/utils/security';
import fs from 'fs';
import path from 'path';
import * as winston from 'winston';
import 'winston-daily-rotate-file';

const logDirectory = process.env.CONFIG_DIRECTORY
  ? `${process.env.CONFIG_DIRECTORY}/logs`
  : path.join(__dirname, '../config/logs');
const privateLogFileOptions = { flags: 'a', mode: PRIVATE_LOG_FILE_MODE };

secureLogDirectory(logDirectory);

type LogInfo = {
  level: string;
  message: unknown;
  [key: string]: unknown;
};

const LOG_ASSIGNMENT_PATTERN =
  /(["']?)([a-z][a-z0-9_-]{0,63})\1\s*([:=])\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}\]]+)/gi;
const LOG_AUTH_SCHEME_PATTERN = /\b(bearer|basic)\s+[^\s,;]+/gi;
const LOG_URL_USERINFO_PATTERN = /\b([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi;
const LOG_SLACK_WEBHOOK_PATTERN =
  /\b(https:\/\/hooks\.slack\.com\/services\/)[^\s?#]+/gi;
const LOG_DISCORD_WEBHOOK_PATTERN =
  /\b(https:\/\/(?:canary\.|ptb\.)?(?:discord(?:app)?\.com)\/api\/webhooks\/\d+\/)[^/?#\s]+/gi;
const LOG_TELEGRAM_BOT_PATTERN =
  /\b(https:\/\/api\.telegram\.org\/bot)[^/\s?#]+/gi;
const MAX_LOG_STRING_LENGTH = 16 * 1024;
const LOG_STRING_TRUNCATED = '[TRUNCATED]';

const escapeLogControlCharacters = (value: string): string => {
  let escaped = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl =
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069);
    escaped += isControl
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }
  return escaped;
};

const boundLogString = (value: string): string => {
  if (value.length <= MAX_LOG_STRING_LENGTH) {
    return value;
  }

  let bounded = value.slice(0, MAX_LOG_STRING_LENGTH);
  const lastCode = bounded.charCodeAt(bounded.length - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    bounded = bounded.slice(0, -1);
  }
  return `${bounded}${LOG_STRING_TRUNCATED}`;
};

export const redactLogString = (value: string): string =>
  escapeLogControlCharacters(
    boundLogString(value)
      .replace(LOG_URL_USERINFO_PATTERN, '$1[REDACTED]@')
      .replace(LOG_SLACK_WEBHOOK_PATTERN, '$1[REDACTED]')
      .replace(LOG_DISCORD_WEBHOOK_PATTERN, '$1[REDACTED]')
      .replace(LOG_TELEGRAM_BOT_PATTERN, '$1[REDACTED]')
      .replace(LOG_AUTH_SCHEME_PATTERN, '$1 [REDACTED]')
      .replace(
        LOG_ASSIGNMENT_PATTERN,
        (match, quote: string, key: string, separator: string) => {
          if (!isSecretFieldName(key)) {
            return match;
          }
          if (/\b(?:bearer|basic)$/i.test(match)) {
            return match;
          }
          return `${quote}${key}${quote}${separator}[REDACTED]`;
        }
      )
  );

const redactLogStrings = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactLogString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redactLogStrings);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redactLogStrings(item)])
  );
};

export const redactLogInfo = (info: LogInfo): LogInfo => {
  const metadata = Object.fromEntries(
    Object.entries(info).filter(
      ([key]) => !['level', 'label', 'message', 'timestamp'].includes(key)
    )
  );
  const redacted = redactLogStrings(redactSecrets(metadata)) as Record<
    string,
    unknown
  >;

  if (typeof info.message === 'string') {
    info.message = redactLogString(info.message);
  }

  for (const key of Object.keys(metadata)) {
    info[key] = redacted[key];
  }

  return info;
};

const redactLogMetadata = winston.format(redactLogInfo);

const hformat = winston.format.printf(
  ({ level, label, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level}]${
      label ? `[${label}]` : ''
    }: ${message} `;
    if (Object.keys(metadata).length > 0) {
      msg += JSON.stringify(metadata);
    }
    return msg;
  }
);

type ConsoleColorEnvironment = {
  FORCE_COLOR?: string;
  NO_COLOR?: string;
  TERM?: string;
};

export const shouldColorizeConsoleLogs = (
  env: ConsoleColorEnvironment,
  stdoutIsTTY: boolean
): boolean => {
  const forceColor = env.FORCE_COLOR;
  if (forceColor) {
    return !['0', 'false'].includes(forceColor.trim().toLowerCase());
  }
  if (env.NO_COLOR) {
    return false;
  }
  if (env.TERM?.toLowerCase() === 'dumb') {
    return false;
  }
  return stdoutIsTTY;
};

const seerrFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDirectory, 'seerr-%DATE%.log'),
  auditFile: path.join(logDirectory, '.seerr-audit.json'),
  options: privateLogFileOptions,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '7d',
  createSymlink: true,
  symlinkName: 'seerr.log',
});
const machineLogFileTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDirectory, '.machinelogs-%DATE%.json'),
  auditFile: path.join(logDirectory, '.machinelogs-audit.json'),
  options: privateLogFileOptions,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '1d',
  createSymlink: true,
  symlinkName: '.machinelogs.json',
  format: winston.format.combine(
    winston.format.splat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
});

const secureRotatedLog = (filePath: string) => {
  fs.chmod(filePath, PRIVATE_LOG_FILE_MODE, (error) => {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to secure rotated log file:', error);
    }
  });
};

for (const transport of [seerrFileTransport, machineLogFileTransport]) {
  transport.on('new', secureRotatedLog);
  transport.on('archive', secureRotatedLog);
  transport.on('rotate', (oldFile, newFile) => {
    secureRotatedLog(oldFile);
    secureRotatedLog(newFile);
  });
}

seerrFileTransport.on('error', (err) => {
  console.error('Error in seerr file transport:', err);
});

machineLogFileTransport.on('error', (err) => {
  console.error('Error in machine log file transport:', err);
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL?.toLowerCase() || 'debug',
  format: winston.format.combine(
    winston.format.splat(),
    redactLogMetadata(),
    winston.format.timestamp(),
    hformat
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        ...(shouldColorizeConsoleLogs(
          {
            FORCE_COLOR: process.env.FORCE_COLOR,
            NO_COLOR: process.env.NO_COLOR,
            TERM: process.env.TERM,
          },
          Boolean(process.stdout.isTTY)
        )
          ? [winston.format.colorize()]
          : []),
        winston.format.splat(),
        winston.format.timestamp(),
        hformat
      ),
    }),
    seerrFileTransport,
    machineLogFileTransport,
  ],
});

export default logger;
