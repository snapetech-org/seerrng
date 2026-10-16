import { describe, expect, it } from 'vitest';
import {
  getMusicServiceQuality,
  isMusicServiceForQuality,
} from './musicService';

describe('music service quality', () => {
  it('recognizes a lossless profile exposed as a FLAC destination', () => {
    const service = {
      name: 'Lidarr',
      musicQuality: 'flac' as const,
    };

    expect(getMusicServiceQuality(service)).toBe('flac');
    expect(isMusicServiceForQuality(service, 'flac')).toBe(true);
  });

  it('retains compatibility with services named by format', () => {
    expect(
      isMusicServiceForQuality(
        {
          name: 'Lidarr MP3',
        },
        'mp3'
      )
    ).toBe(true);
  });
});
