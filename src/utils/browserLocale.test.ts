import { afterEach, describe, expect, it } from 'vitest';
import { getBrowserLocalePreference } from './browserLocale';

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  'navigator'
);

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, 'navigator', originalNavigator);
  } else {
    Reflect.deleteProperty(globalThis, 'navigator');
  }
});

describe('browser locale preference', () => {
  it('resolves a supported interface locale and the browser region separately', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { languages: ['ar-EG', 'en-US'], language: 'ar-EG' },
    });

    expect(getBrowserLocalePreference()).toEqual({
      locale: 'ar',
      formatRegion: 'EG',
    });
  });

  it('uses navigator.language when the preferred-language list is empty', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { languages: [], language: 'pt-PT' },
    });

    expect(getBrowserLocalePreference()).toEqual({
      locale: 'pt-PT',
      formatRegion: 'PT',
    });
  });
});
