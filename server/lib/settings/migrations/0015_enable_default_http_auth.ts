import type { AllSettings } from '@server/lib/settings';

type MutableSettings = {
  network?: {
    tls?: {
      mode?: string;
      allowHttpAuth?: boolean;
      httpAuthAcknowledged?: boolean;
    };
  };
  migrations?: string[];
};

const MIGRATION_NAME = '0015_enable_default_http_auth';

// Listener mode does not establish consent to send credentials over HTTP:
// reverse-proxy TLS deployments also disable the built-in TLS listener.
const enableDefaultHttpAuth = (settings: AllSettings): AllSettings => {
  const mutableSettings = settings as unknown as MutableSettings;

  if (
    Array.isArray(mutableSettings.migrations) &&
    mutableSettings.migrations.includes(MIGRATION_NAME)
  ) {
    return settings;
  }

  const tls = mutableSettings.network?.tls;
  if (tls) {
    tls.allowHttpAuth ??= false;
    tls.httpAuthAcknowledged ??= false;
  }

  if (!Array.isArray(mutableSettings.migrations)) {
    mutableSettings.migrations = [];
  }
  mutableSettings.migrations.push(MIGRATION_NAME);

  return settings;
};

export default enableDefaultHttpAuth;
