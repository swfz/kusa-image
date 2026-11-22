import { describe, expect, it } from 'vitest';
import { crc32, encodeIndexedPng, type Rgb } from '../src/render/png.ts';
import { decodePng } from './png-decode.ts';

const PALETTE: Rgb[] = [
  [255, 255, 255],
  [0, 0, 0],
  [64, 196, 99],
];

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('encodeIndexedPng', () => {
  it('round-trips header, palette and pixels', async () => {
    const width = 5;
    const height = 3;
    const pixels = Uint8Array.from({ length: width * height }, (_, i) => i % PALETTE.length);

    const decoded = await decodePng(await encodeIndexedPng(width, height, pixels, PALETTE));

    expect(decoded).toMatchObject({ width, height, bitDepth: 8, colorType: 3 });
    expect(decoded.palette).toEqual(PALETTE);
    expect([...decoded.pixels]).toEqual([...pixels]);
  });

  it('rejects a pixel buffer of the wrong size', async () => {
    await expect(encodeIndexedPng(2, 2, new Uint8Array(3), PALETTE)).rejects.toThrow('pixels length');
  });

  it('rejects an empty or oversized palette', async () => {
    await expect(encodeIndexedPng(1, 1, new Uint8Array(1), [])).rejects.toThrow('palette');
    const big = Array.from({ length: 257 }, (): Rgb => [0, 0, 0]);
    await expect(encodeIndexedPng(1, 1, new Uint8Array(1), big)).rejects.toThrow('palette');
  });
});
