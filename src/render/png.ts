// Minimal PNG encoder for palette (color type 3) images.
// Deflate is delegated to the runtime's CompressionStream.

export type Rgb = readonly [number, number, number];

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length): number => {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
};

// "deflate" produces the zlib format that IDAT expects.
const zlib = async (data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> => {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const concat = (parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
};

/**
 * Encode an 8-bit palette image.
 * @param pixels one palette index per pixel, row-major, length = width * height
 */
export const encodeIndexedPng = async (
  width: number,
  height: number,
  pixels: Uint8Array,
  palette: readonly Rgb[],
): Promise<Uint8Array<ArrayBuffer>> => {
  if (pixels.length !== width * height) throw new Error('pixels length does not match width * height');
  if (palette.length === 0 || palette.length > 256) throw new Error('palette must have 1..256 colors');

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 3, 0, 0, 0], 8); // bit depth 8, color type 3 (palette), deflate, filter 0, no interlace

  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((rgb, i) => plte.set(rgb, i * 3));

  // Each scanline starts with filter type 0 (None).
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);

  return concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array()),
  ]);
};
