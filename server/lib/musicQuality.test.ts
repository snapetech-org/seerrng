import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getMusicQualityFromLabels } from './musicQuality';

describe('getMusicQualityFromLabels', () => {
  it('recognizes lossless Lidarr profiles as FLAC', () => {
    assert.equal(getMusicQualityFromLabels('Lossless Preferred'), 'flac');
  });

  it('uses the profile label before the service name', () => {
    assert.equal(getMusicQualityFromLabels('MP3 320', 'Lidarr FLAC'), 'mp3');
  });

  it('falls back to a format in the service name', () => {
    assert.equal(getMusicQualityFromLabels('Any', 'Lidarr FLAC'), 'flac');
  });

  it('does not guess a format from a generic label', () => {
    assert.equal(getMusicQualityFromLabels('Any', 'Lidarr'), undefined);
  });
});
