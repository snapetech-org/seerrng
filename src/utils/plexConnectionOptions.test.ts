import type {
  PlexConnection,
  PlexDevice,
} from '@server/interfaces/api/plexInterfaces';
import { describe, expect, it } from 'vitest';
import {
  buildPlexServerOptions,
  matchesPlexConnection,
  plexConnectionFailure,
} from './plexConnectionOptions';

const connection = (
  address: string,
  overrides: Partial<PlexConnection> = {}
): PlexConnection => ({
  address,
  port: 32400,
  protocol: 'http',
  local: true,
  uri: 'http://' + address + ':32400',
  status: 200,
  ...overrides,
});
const server = (
  connections: PlexConnection[],
  clientIdentifier = 'one'
): PlexDevice =>
  ({
    clientIdentifier,
    name: 'Media Server',
    connection: connections,
  }) as PlexDevice;

describe('Plex connection recommendations', () => {
  it('prefers a working LAN route over bridges, loopback and remote routes', () => {
    const groups = buildPlexServerOptions([
      server([
        connection('127.0.0.1'),
        connection('172.19.0.1'),
        connection('172.31.200.1'),
        connection('108.80.4.149', { local: false, protocol: 'https' }),
        connection('192.168.5.124'),
        connection('192-168-5-124.fixture.plex.direct', {
          protocol: 'https',
          status: 500,
          message: 'unable to get local issuer certificate',
        }),
      ]),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].recommended?.connection.address).toBe('192.168.5.124');
    expect(groups[0].connections).toHaveLength(6);
    expect(plexConnectionFailure(groups[0].connections.at(-1)!)).toBe(
      'certificate'
    );
  });

  it('prefers HTTPS on the same network and preserves distinct server identities', () => {
    const lan = connection('192.168.5.124');
    const secure = connection('192-168-5-124.fixture.plex.direct', {
      protocol: 'https',
    });
    const groups = buildPlexServerOptions([
      server([lan, secure]),
      server([lan, secure]),
      server([lan], 'two'),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].connections).toHaveLength(2);
    expect(groups[0].recommended?.connection.protocol).toBe('https');
    expect(
      matchesPlexConnection(groups[0].recommended!, {
        hostname: secure.address,
        port: '32400',
        useSsl: true,
      })
    ).toBe(true);
  });

  it('only recommends reachable routes and preserves working fallbacks', () => {
    expect(
      buildPlexServerOptions([
        server([
          connection('192.168.5.124', { status: 500 }),
          connection('172.19.0.1'),
        ]),
      ])[0].recommended?.connection.address
    ).toBe('172.19.0.1');
    expect(
      buildPlexServerOptions([
        server([
          connection('192.168.5.124', { status: 500 }),
          connection('example.test', { local: false }),
        ]),
      ])[0].recommended?.kind
    ).toBe('remote');
    expect(
      buildPlexServerOptions([
        server([connection('192.168.5.124', { status: 500 })]),
      ])[0].recommended
    ).toBeUndefined();
    expect(buildPlexServerOptions([])).toEqual([]);
  });

  it('classifies IPv6 private, mapped IPv4, link-local and loopback endpoints', () => {
    const groups = buildPlexServerOptions([
      server([
        connection('::1'),
        connection('fe80::1'),
        connection('fd00::123'),
        connection('::ffff:192.168.1.4'),
      ]),
    ]);
    expect(groups[0].recommended?.kind).toBe('local');
    expect(
      groups[0].connections.find((x) => x.connection.address === '::1')?.kind
    ).toBe('loopback');
    expect(
      groups[0].connections.find((x) => x.connection.address === 'fe80::1')
        ?.kind
    ).toBe('linkLocal');
  });
});
