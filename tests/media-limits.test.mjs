import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_MEDIA_BYTES, checkMediaSize, videoBitrate } from '../src/lib/media-limits.ts';

test('72-second clips have room for audio and encoding overhead below the storage ceiling', () => {
  const estimatedBytes = (videoBitrate(72) + 256_000) * 72 / 8;
  assert.ok(estimatedBytes < 40 * 1024 * 1024);
});
test('longer clips receive a lower bitrate; invalid or impractically long clips fail clearly', () => {
  assert.ok(videoBitrate(180) < videoBitrate(72));
  for (const duration of [0, -1, NaN, Infinity, 3600]) assert.throws(() => videoBitrate(duration));
});
test('actual size validation accepts the boundary and rejects invalid or oversized files', () => {
  checkMediaSize(MAX_MEDIA_BYTES, true);
  for (const size of [0, -1, NaN, Infinity, MAX_MEDIA_BYTES + 1]) assert.throws(() => checkMediaSize(size, true));
  assert.throws(() => checkMediaSize(MAX_MEDIA_BYTES + 1, false), /photo/);
  assert.throws(() => checkMediaSize(MAX_MEDIA_BYTES + 1, true), /after compression/);
});
