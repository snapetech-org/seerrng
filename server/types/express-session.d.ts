import 'express-session';

// Declaration merging to apply our own types to SessionData
// See: (https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/express-session/index.d.ts#L23)
declare module 'express-session' {
  interface SessionData {
    userId: number;
    credentialVersion?: number;
    jellyfinBridge?: {
      jellyfinUserId: string;
      authorityKey: string;
    };
    discoveryAuth?: {
      trakt?: {
        codeVerifier: string;
        state: string;
        clientId: string;
        userId: number;
        applicationUrl: string;
        redirectUri: string;
        expiresAt: number;
      };
      simkl?: {
        userCode: string;
        clientId: string;
        interval: number;
        expiresAt: number;
        nextPollAt: number;
      };
    };
    spotifyOAuthFrontend?: 'bundled' | 'companion';
    spotifyOAuthState?: string;
    spotifyOAuthStateCreatedAt?: number;
    steamOpenIdFrontend?: 'native' | 'bundled-lumen' | 'companion-lumen';
    steamOpenIdState?: string;
    steamOpenIdStateCreatedAt?: number;
  }
}
