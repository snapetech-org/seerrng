export type MusicQuality = 'mp3' | 'flac';

export const getMusicQualityFromLabels = (
  ...labels: (string | null | undefined)[]
): MusicQuality | undefined => {
  for (const value of labels) {
    const label = value?.trim().toLocaleUpperCase();
    if (!label) continue;
    if (/\bFLAC\b|\bLOSSLESS\b/.test(label)) return 'flac';
    if (/\bMP3\b/.test(label)) return 'mp3';
  }

  return undefined;
};
