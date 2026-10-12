import http from 'node:http';
import https from 'node:https';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

function stripPort(host) {
  const bracketed = host.match(/^\[(.+)\]/);
  if (bracketed) return bracketed[1];

  const parts = host.split(':');
  return parts.length === 2 ? parts[0] : host;
}

function hostnameOf(args) {
  const [first, second] = args;
  let fromUrl;

  if (typeof first === 'string' || first instanceof URL) {
    try {
      fromUrl = new URL(String(first)).hostname;
    } catch {
      fromUrl = undefined;
    }
  }

  const options = fromUrl !== undefined ? second : first;
  const fromOptions =
    typeof options === 'object' && options !== null
      ? (options.hostname ??
        (options.host ? stripPort(options.host) : undefined))
      : undefined;

  return stripPort(fromOptions ?? fromUrl ?? 'localhost').toLowerCase();
}

function blockOutboundRequests(mod, scheme, blocked) {
  for (const name of ['request', 'get']) {
    const original = mod[name];
    mod[name] = (...args) => {
      const hostname = hostnameOf(args);
      if (!LOOPBACK.has(hostname)) {
        const target = `${scheme}//${hostname}`;
        blocked.add(target);
        throw new Error(
          `Blocked outbound request to ${target}. Stub the API client this test uses.`
        );
      }

      return original(...args);
    };
  }
}

function blockOutboundFetchRequests(blocked) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const [input, init] = args;
    let request;
    try {
      request = new Request(input, init);
    } catch {
      return originalFetch.call(globalThis, ...args);
    }

    const url = new URL(request.url);
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (['http:', 'https:'].includes(url.protocol) && !LOOPBACK.has(hostname)) {
      const target = `${url.protocol}//${hostname}`;
      blocked.add(target);
      throw new Error(
        `Blocked outbound request to ${target}. Stub the API client this test uses.`
      );
    }

    if (request.redirect === 'follow') {
      const response = await originalFetch.call(globalThis, input, {
        ...init,
        redirect: 'manual',
      });
      if (
        [301, 302, 303, 307, 308].includes(response.status) &&
        response.headers.has('location')
      ) {
        const target = new URL(
          response.headers.get('location'),
          response.url || request.url
        );
        blocked.add(target.origin);
        if (response.body) await response.body.cancel().catch(() => {});
        throw new Error(
          `Blocked fetch redirect to ${target.origin}. Use explicit manual redirect handling in tests.`
        );
      }
      return response;
    }

    return originalFetch.call(globalThis, ...args);
  };
}

export function installTestNetworkGuard() {
  const blocked = new Set();
  blockOutboundRequests(http, 'http:', blocked);
  blockOutboundRequests(https, 'https:', blocked);
  blockOutboundFetchRequests(blocked);
  return blocked;
}
