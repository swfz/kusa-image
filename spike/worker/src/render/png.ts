// スパイク用: indexed（color type 3）PNG エンコーダ。deflate はランタイムの CompressionStream に任せる

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

const crc32 = (bytes: Uint8Array, start = 0, end = bytes.length) => {
	let c = 0xffffffff;
	for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array) => {
	const out = new Uint8Array(12 + data.length);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
	out.set(data, 8);
	view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
	return out;
};

const zlib = async (data: Uint8Array) => {
	// "deflate" は zlib ヘッダー付きの形式なので、PNG の IDAT にそのまま使える
	const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
};

/** pixels: 1px = パレットのインデックス 1 バイト。palette: [r,g,b] の配列（最大 256） */
export const encodeIndexedPng = async (width: number, height: number, pixels: Uint8Array, palette: number[][]) => {
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, width);
	v.setUint32(4, height);
	ihdr.set([8, 3, 0, 0, 0], 8); // bit depth 8, color type 3（indexed）

	const plte = new Uint8Array(palette.length * 3);
	palette.forEach(([r, g, b], i) => plte.set([r, g, b], i * 3));

	// 各行の先頭にフィルタ種別 0（None）を付ける
	const raw = new Uint8Array((width + 1) * height);
	for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
	const idat = await zlib(raw);

	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("PLTE", plte),
		chunk("IDAT", idat),
		chunk("IEND", new Uint8Array()),
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
};
