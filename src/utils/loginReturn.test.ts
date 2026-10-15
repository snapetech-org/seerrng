import { describe, expect, it } from 'vitest';
import { buildLoginPath, getSafeReturnPath } from './loginReturn';

describe('getSafeReturnPath', () => {
  it('keeps in-app paths with query strings', () => {
    expect(getSafeReturnPath('/movie/603?tab=cast')).toBe(
      '/movie/603?tab=cast'
    );
    expect(getSafeReturnPath('/requests')).toBe('/requests');
  });

  it('rejects off-site and malformed targets', () => {
    for (const value of [
      undefined,
      42,
      '',
      'movie/603',
      'https://evil.example/path',
      '//evil.example/path',
      '/\\evil.example',
      '/path\nwith-newline',
      `/${'a'.repeat(3000)}`,
    ]) {
      expect(getSafeReturnPath(value)).toBeUndefined();
    }
  });

  it('rejects auth pages to avoid redirect loops', () => {
    for (const value of [
      '/login',
      '/login/plex/loading?complete=1',
      '/setup',
      '/resetpassword/abc',
    ]) {
      expect(getSafeReturnPath(value)).toBeUndefined();
    }
  });
});

describe('buildLoginPath', () => {
  it('encodes the requested page', () => {
    expect(buildLoginPath('/tv/1399', '?season=2')).toBe(
      '/login?returnTo=%2Ftv%2F1399%3Fseason%3D2'
    );
  });

  it('falls back to the bare login page for home and unsafe paths', () => {
    expect(buildLoginPath('/')).toBe('/login');
    expect(buildLoginPath('//evil.example')).toBe('/login');
  });
});
