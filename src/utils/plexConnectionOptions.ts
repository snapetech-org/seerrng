import type {
  PlexConnection,
  PlexDevice,
} from '@server/interfaces/api/plexInterfaces';
import { Address4, Address6 } from 'ip-address';

export type PlexConnectionKind = 'local' | 'remote' | 'loopback' | 'linkLocal';
export interface PlexConnectionOption {
  id: string;
  name: string;
  connection: PlexConnection;
  kind: PlexConnectionKind;
}
export interface PlexServerOption {
  id: string;
  name: string;
  connections: PlexConnectionOption[];
  recommended?: PlexConnectionOption;
}

const normalizeHost = (host: string) =>
  host.trim().toLowerCase().replace(/^\[|\]$/g, '');

const hostIp = (host: string) => {
  const normalized = normalizeHost(host);
  if (!normalized.endsWith('.plex.direct')) return normalized;
  const label = normalized.split('.')[0];
  const ipv4 = label.replace(/-/g, '.');
  return Address4.isValid(ipv4) ? ipv4 : label.replace(/-/g, ':');
};

const connectionScope = (
  connection: PlexConnection
): [PlexConnectionKind, number] => {
  const host = hostIp(connection.address);
  if (host === 'localhost' || host.endsWith('.localhost'))
    return ['loopback', 5];
  if (Address4.isValid(host)) {
    const [a, b, , d] = host.split('.').map(Number);
    if (a === 127 || a === 0) return ['loopback', 5];
    if (a === 169 && b === 254) return ['linkLocal', 4];
    if (
      a === 10 ||
      (a === 192 && b === 168) ||
      (a === 172 && b >= 16 && b <= 31)
    ) {
      // This may be a container gateway, but remains available as a fallback.
      return ['local', a === 172 && d === 1 ? 2 : 0];
    }
    return ['remote', 3];
  }
  if (Address6.isValid(host)) {
    const address = new Address6(host);
    if (address.is4()) {
      return connectionScope({
        ...connection,
        address: address.to4().correctForm(),
      });
    }
    const normalized = address.correctForm();
    if (normalized === '::1' || normalized === '::') return ['loopback', 5];
    if (address.isLinkLocal()) return ['linkLocal', 4];
    if (/^f[cd]/.test(normalized)) return ['local', 0];
    return ['remote', 3];
  }
  return connection.local ? ['local', 1] : ['remote', 3];
};

export const buildPlexServerOptions = (
  devices: PlexDevice[]
): PlexServerOption[] => {
  const servers = new Map<string, PlexServerOption>();
  devices.forEach((device) => {
    const id = device.clientIdentifier;
    const server = servers.get(id) ?? {
      id,
      name: device.name,
      connections: [],
    };
    (device.connection ?? []).forEach((connection) => {
      const key = [
        id,
        connection.protocol,
        normalizeHost(connection.address),
        connection.port,
      ].join('|');
      if (!server.connections.some((option) => option.id === key)) {
        server.connections.push({
          id: key,
          name: device.name,
          connection,
          kind: connectionScope(connection)[0],
        });
      }
    });
    servers.set(id, server);
  });
  return [...servers.values()]
    .map((server) => {
      const connections = server.connections.sort(
        (a, b) =>
          Number(b.connection.status === 200) -
            Number(a.connection.status === 200) ||
          connectionScope(a.connection)[1] -
            connectionScope(b.connection)[1] ||
          Number(b.connection.protocol === 'https') -
            Number(a.connection.protocol === 'https') ||
          a.id.localeCompare(b.id)
      );
      return {
        ...server,
        connections,
        recommended: connections.find(
          (option) => option.connection.status === 200
        ),
      };
    })
    .sort(
      (a, b) =>
        Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) ||
        a.name.localeCompare(b.name)
    );
};

export const matchesPlexConnection = (
  option: PlexConnectionOption,
  values: { hostname?: string; port: string | number; useSsl?: boolean }
): boolean =>
  normalizeHost(option.connection.address) ===
    normalizeHost(values.hostname ?? '') &&
  option.connection.port === Number(values.port) &&
  (option.connection.protocol === 'https') === Boolean(values.useSsl);

export const plexConnectionFailure = (
  option: PlexConnectionOption
): 'certificate' | 'timeout' | 'unavailable' => {
  const message = option.connection.message ?? '';
  if (/certificate|issuer|self.signed|\btls\b|\bssl\b/i.test(message))
    return 'certificate';
  return /timeout|timed out|ETIMEDOUT/i.test(message)
    ? 'timeout'
    : 'unavailable';
};
