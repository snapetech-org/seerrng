import axios from 'axios';
import Bowser from 'bowser';

export const PLEX_OAUTH_HTTP_OPTIONS = {
  timeout: 10_000,
} as const;
const MAX_PLEX_AUTH_TOKEN_LENGTH = 4096;
const MAX_PLEX_PIN_ID = 2_147_483_647;
const MAX_PLEX_PIN_CODE_LENGTH = 128;
const MAX_PLEX_PIN_EXPIRY_LENGTH = 128;

export const getPlexPopupReturnUrl = (origin: string): string => {
  const returnUrl = new URL('/login/plex/loading', origin);
  returnUrl.searchParams.set('complete', '1');
  return returnUrl.toString();
};

export const getBoundedPlexPinDeadline = (
  expiresAt: unknown,
  hardDeadline: number
): number => {
  if (typeof expiresAt !== 'string') {
    return hardDeadline;
  }

  const parsedDeadline = Date.parse(expiresAt);
  return Number.isFinite(parsedDeadline)
    ? Math.min(parsedDeadline, hardDeadline)
    : hardDeadline;
};

export const getPlexPinPollDeadline = (
  pollExpiresAt: unknown,
  pinExpiresAt: unknown,
  hardDeadline: number
): number =>
  Math.min(
    getBoundedPlexPinDeadline(pollExpiresAt, hardDeadline),
    getBoundedPlexPinDeadline(pinExpiresAt, hardDeadline)
  );

const parsePlexPinExpiry = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PLEX_PIN_EXPIRY_LENGTH
    ? value
    : undefined;

export const parsePlexPinAuthToken = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= MAX_PLEX_AUTH_TOKEN_LENGTH
    ? value
    : undefined;

interface PlexHeaders extends Record<string, string> {
  Accept: string;
  'X-Plex-Product': string;
  'X-Plex-Version': string;
  'X-Plex-Client-Identifier': string;
  'X-Plex-Model': string;
  'X-Plex-Platform': string;
  'X-Plex-Platform-Version': string;
  'X-Plex-Device': string;
  'X-Plex-Device-Name': string;
  'X-Plex-Device-Screen-Resolution': string;
  'X-Plex-Language': string;
}

export interface PlexPin {
  id: number;
  code: string;
  expiresAt?: string;
}

export const parsePlexPin = (value: unknown): PlexPin | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as Partial<PlexPin>;
  if (
    !Number.isSafeInteger(candidate.id) ||
    (candidate.id ?? 0) <= 0 ||
    (candidate.id ?? 0) > MAX_PLEX_PIN_ID ||
    typeof candidate.code !== 'string' ||
    candidate.code.length === 0 ||
    candidate.code.length > MAX_PLEX_PIN_CODE_LENGTH
  ) {
    return undefined;
  }

  const expiresAt = parsePlexPinExpiry(candidate.expiresAt);
  return {
    id: candidate.id as number,
    code: candidate.code,
    ...(expiresAt ? { expiresAt } : {}),
  };
};

class PlexOAuth {
  private nextAttemptId = 0;
  private activeAttemptId?: number;
  private plexHeaders?: PlexHeaders;

  private pin?: PlexPin;
  private popup?: Window;

  private authToken?: string;

  public initializeHeaders(plexClientIdentifier: string): void {
    if (typeof window === 'undefined') {
      throw new Error(
        'Window is not defined. Are you calling this in the browser?'
      );
    }

    if (!plexClientIdentifier) {
      throw new Error(
        'Plex client identifier missing. Reload the page and try again.'
      );
    }

    const browser = Bowser.getParser(window.navigator.userAgent);
    this.plexHeaders = {
      Accept: 'application/json',
      // Plex OAuth identifies the registered Seerr client, not the fork's UI
      // branding. Changing this value prevents Plex from claiming the PIN.
      'X-Plex-Product': 'Seerr',
      'X-Plex-Version': 'Plex OAuth',
      'X-Plex-Client-Identifier': plexClientIdentifier,
      'X-Plex-Model': 'Plex OAuth',
      'X-Plex-Platform': browser.getBrowserName(),
      'X-Plex-Platform-Version': browser.getBrowserVersion() || 'Unknown',
      'X-Plex-Device': browser.getOSName(),
      'X-Plex-Device-Name': `${browser.getBrowserName()} (Seerr)`,
      'X-Plex-Device-Screen-Resolution':
        window.screen.width + 'x' + window.screen.height,
      'X-Plex-Language': 'en',
    };
  }

  private assertCurrentAttempt(attemptId: number): void {
    if (this.activeAttemptId !== attemptId) {
      throw new Error('This Plex login attempt is no longer active.');
    }
  }

  private async getPin(attemptId: number): Promise<PlexPin> {
    this.assertCurrentAttempt(attemptId);
    if (!this.plexHeaders) {
      throw new Error(
        'You must initialize the plex headers clientside to login'
      );
    }
    const response = await axios.post('/api/v1/auth/plex/pin');
    this.assertCurrentAttempt(attemptId);

    const pin = parsePlexPin(response.data);
    if (!pin) {
      throw new Error('Plex returned an invalid PIN response.');
    }
    this.pin = pin;

    return this.pin;
  }

  public preparePopup(): number {
    if (this.activeAttemptId !== undefined) {
      this.cancelLogin(this.activeAttemptId);
    }
    const attemptId = ++this.nextAttemptId;
    this.activeAttemptId = attemptId;
    this.openPopup({ title: 'Plex Auth', w: 600, h: 700 });
    return attemptId;
  }

  public cancelLogin(attemptId: number): void {
    if (this.activeAttemptId !== attemptId) {
      return;
    }
    this.closePopup();
    this.activeAttemptId = undefined;
    this.pin = undefined;
    this.authToken = undefined;
  }

  public async login(
    plexClientIdentifier: string,
    attemptId: number
  ): Promise<string> {
    try {
      this.assertCurrentAttempt(attemptId);
      this.initializeHeaders(plexClientIdentifier);
      await this.getPin(attemptId);

      if (!this.plexHeaders || !this.pin) {
        throw new Error('Unable to call login if class is not initialized.');
      }

      const params = {
        clientID: this.plexHeaders['X-Plex-Client-Identifier'],
        'context[device][product]': this.plexHeaders['X-Plex-Product'],
        'context[device][version]': this.plexHeaders['X-Plex-Version'],
        'context[device][platform]': this.plexHeaders['X-Plex-Platform'],
        'context[device][platformVersion]':
          this.plexHeaders['X-Plex-Platform-Version'],
        'context[device][device]': this.plexHeaders['X-Plex-Device'],
        'context[device][deviceName]': this.plexHeaders['X-Plex-Device-Name'],
        'context[device][model]': this.plexHeaders['X-Plex-Model'],
        'context[device][screenResolution]':
          this.plexHeaders['X-Plex-Device-Screen-Resolution'],
        'context[device][layout]': 'desktop',
        forwardUrl: getPlexPopupReturnUrl(window.location.origin),
        code: this.pin.code,
      };

      if (!this.popup || this.popup.closed) {
        throw new Error(
          'Unable to open the Plex login window. Please allow popups for this site and try again.'
        );
      }

      this.popup.location.href = `https://app.plex.tv/auth#?${this.encodeData(
        params
      )}`;

      return await this.pinPoll(attemptId);
    } finally {
      this.cancelLogin(attemptId);
    }
  }

  private async pinPoll(attemptId: number): Promise<string> {
    // popup.closed is unreliable under COOP same-origin-allow-popups once the
    // popup navigates to app.plex.tv; bound polling by expiresAt with a 15m
    // hard fallback.
    const deadline = Date.now() + 15 * 60 * 1000;
    const executePoll = async (
      resolve: (authToken: string) => void,
      reject: (e: Error) => void
    ) => {
      try {
        this.assertCurrentAttempt(attemptId);
        if (!this.pin) {
          throw new Error('Unable to poll when pin is not initialized.');
        }

        const response = await axios.get(
          `/api/v1/auth/plex/pin/${this.pin.id}?code=${encodeURIComponent(
            this.pin.code
          )}`
        );
        this.assertCurrentAttempt(attemptId);

        const rawAuthToken: unknown = response.data?.authToken;
        const authToken = parsePlexPinAuthToken(rawAuthToken);
        if (authToken) {
          this.authToken = authToken;
          resolve(this.authToken);
        } else {
          if (rawAuthToken) {
            throw new Error('Plex returned an invalid authentication token.');
          }
          const expiresAt = getPlexPinPollDeadline(
            response.data?.expiresAt,
            this.pin.expiresAt,
            deadline
          );
          if (Date.now() >= expiresAt) {
            reject(new Error('Plex PIN expired before login completed.'));
            return;
          }
          setTimeout(executePoll, 1000, resolve, reject);
        }
      } catch (e) {
        reject(e);
      }
    };

    return new Promise(executePoll);
  }

  private closePopup(): void {
    this.popup?.close();
    this.popup = undefined;
  }

  private openPopup({
    title,
    w,
    h,
  }: {
    title: string;
    w: number;
    h: number;
  }): Window | void {
    if (typeof window === 'undefined') {
      throw new Error(
        'Window is undefined. Are you running this in the browser?'
      );
    }
    // Fixes dual-screen position                         Most browsers      Firefox
    const dualScreenLeft =
      window.screenLeft != undefined ? window.screenLeft : window.screenX;
    const dualScreenTop =
      window.screenTop != undefined ? window.screenTop : window.screenY;
    const width = window.innerWidth
      ? window.innerWidth
      : document.documentElement.clientWidth
        ? document.documentElement.clientWidth
        : screen.width;
    const height = window.innerHeight
      ? window.innerHeight
      : document.documentElement.clientHeight
        ? document.documentElement.clientHeight
        : screen.height;
    const left = width / 2 - w / 2 + dualScreenLeft;
    const top = height / 2 - h / 2 + dualScreenTop;

    //Set url to login/plex/loading so browser doesn't block popup
    const newWindow = window.open(
      '/login/plex/loading',
      title,
      'scrollbars=yes, width=' +
        w +
        ', height=' +
        h +
        ', top=' +
        top +
        ', left=' +
        left
    );
    if (newWindow) {
      newWindow.focus();
      this.popup = newWindow;
      return this.popup;
    }
  }

  private encodeData(data: Record<string, string>): string {
    return Object.keys(data)
      .map(function (key) {
        return [key, data[key]].map(encodeURIComponent).join('=');
      })
      .join('&');
  }
}

export default PlexOAuth;
