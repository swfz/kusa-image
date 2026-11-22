// Test helper: decode the palette PNGs produced by encodeIndexedPng.
import { crc32 } from '../src/render/png.ts';

export interface DecodedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  palette: [number, number, number][];
  pixels: Uint8Array;
}

const inflate = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const decodePng = async (png: Uint8Array): Promise<DecodedPng> => {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if ([...png.subarray(0, 8)].join() !== '137,80,78,71,13,10,26,10') throw new Error('bad signature');

  let offset = 8;
  let ihdr: DataView | undefined;
  let palette: [number, number, number][] = [];
  const idat: Uint8Array[] = [];
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (crc32(png, offset + 4, offset + 8 + length) !== view.getUint32(offset + 8 + length)) {
      throw new Error(`bad crc in ${type}`);
    }
    if (type === 'IHDR') ihdr = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (type === 'PLTE') {
      palette = Array.from({ length: length / 3 }, (_, i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!ihdr) throw new Error('missing IHDR');

  const width = ihdr.getUint32(0);
  const height = ihdr.getUint32(4);
  const raw = await inflate(new Uint8Array(idat.flatMap((d) => [...d])));
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    if (raw[y * (width + 1)] !== 0) throw new Error('unsupported filter');
    pixels.set(raw.subarray(y * (width + 1) + 1, (y + 1) * (width + 1)), y * width);
  }
  return { width, height, bitDepth: ihdr.getUint8(8), colorType: ihdr.getUint8(9), palette, pixels };
};
