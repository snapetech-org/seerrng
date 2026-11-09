import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';

const readPersistedTlsSettings = () => {
  const configDirectory = process.env.CONFIG_DIRECTORY ?? '/app/config';
  try {
    const settings = JSON.parse(
      fs.readFileSync(path.join(configDirectory, 'settings.json'), 'utf8')
    );
    return settings?.network?.tls ?? {};
  } catch {
    return {};
  }
};

const persistedTlsSettings = readPersistedTlsSettings();
const tlsMode = (
  process.env.SEERR_TLS_MODE ??
  persistedTlsSettings.mode ??
  'disabled'
).toLowerCase();
const tlsEnabled = tlsMode === 'self-signed' || tlsMode === 'provided';
const configDirectory = process.env.CONFIG_DIRECTORY ?? '/app/config';
const readinessPath = process.argv[2] ?? '/api/v1/status/ready';
const expectedStatus = readinessPath === '/api/v1/settings/public' ? 200 : 204;
const port = Number(
  tlsEnabled
    ? (process.env.SEERR_HTTPS_PORT ?? persistedTlsSettings.httpsPort ?? '5056')
    : (process.env.PORT ?? '5055')
);
const client = tlsEnabled ? https : http;

const readOptionalTlsFile = (filePath) => {
  if (!filePath) return undefined;
  try {
    return fs.readFileSync(filePath);
  } catch {
    return undefined;
  }
};

const firstConfiguredHost = (value) =>
  value
    ?.split(',')
    .map((host) => host.trim())
    .find(Boolean);

const certificatePath =
  process.env.SEERR_TLS_CERT_FILE !== undefined
    ? process.env.SEERR_TLS_CERT_FILE
    : persistedTlsSettings.certificateFile ||
      (tlsMode === 'self-signed'
        ? path.join(configDirectory, 'tls', 'server.crt')
        : undefined);
const certificateHosts = (() => {
  const certificate = readOptionalTlsFile(certificatePath);
  if (!certificate) return [];
  try {
    return (new X509Certificate(certificate).subjectAltName ?? '')
      .split(/,\s*/u)
      .map((entry) => entry.replace(/^(?:DNS|IP Address):/u, '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
})();
const configuredHost =
  firstConfiguredHost(
    process.env.SEERR_TLS_HOSTS !== undefined
      ? process.env.SEERR_TLS_HOSTS
      : persistedTlsSettings.hosts
  ) ?? certificateHosts[0];
const caPath =
  process.env.SEERR_TLS_CA_FILE !== undefined
    ? process.env.SEERR_TLS_CA_FILE
    : persistedTlsSettings.caFile ||
      (tlsMode === 'self-signed'
        ? path.join(configDirectory, 'tls', 'ca.crt')
        : undefined);
const ca = readOptionalTlsFile(caPath);

const request = client.get(
  {
    hostname: '127.0.0.1',
    path: readinessPath,
    port,
    ...(tlsEnabled && configuredHost ? { servername: configuredHost } : {}),
    ...(tlsEnabled && ca ? { ca } : {}),
  },
  (response) => {
    response.resume();
    response.once('end', () => {
      process.exit(response.statusCode === expectedStatus ? 0 : 1);
    });
  }
);

request.setTimeout(3_000, () => request.destroy());
request.once('error', () => process.exit(1));
