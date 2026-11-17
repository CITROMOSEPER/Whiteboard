/* Whiteboard: QR codes, for joining a live board from a phone (the share window shows one).

   A small encoder for short texts: byte mode, error correction level M (about 15 % of the code
   can be damaged or covered), versions 1-6 (up to 106 bytes, plenty for an address with a room
   code), and the mask that makes the code easiest to read, chosen by the standard's penalty rules.

   WB.qr(text) -> { size, dark(x, y) }        (no quiet zone; leave 4 modules of margin around it)
   WB.qrSvg(text, scale) -> '<svg …>'         (black on white, with the quiet zone) */
(function () {
  const WB = window.WB;
  // Per version (index 1-6), level M: [error correction codewords per block, [data codewords of each block]].
  const BLOCKS = [null, [10, [16]], [16, [28]], [26, [44]], [18, [32, 32]], [24, [43, 43]], [16, [27, 27, 27, 27]]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

  // ---- Reed-Solomon over GF(256), polynomial 0x11D ----
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function divisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < degree; j++) { r[j] = mul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
      root = mul(root, 2);
    }
    return r;
  }
  function remainder(data, div) {
    const r = new Array(div.length).fill(0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  }

  function encode(text, mask) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let version = 1;
    while (version <= 6 && 4 + 8 + bytes.length * 8 > BLOCKS[version][1].reduce((a, b) => a + b, 0) * 8) version++;
    if (version > 6) throw new Error('text too long for a QR code here');
    const [ecLen, blockSizes] = BLOCKS[version];
    const capacity = blockSizes.reduce((a, b) => a + b, 0) * 8;

    // Bits: mode 0100 (bytes), 8-bit length, the bytes, a terminator, then padding.
    const bits = [];
    const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, 8);
    for (const b of bytes) put(b, 8);
    put(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }

    // Blocks, each with its error correction, interleaved.
    const div = divisor(ecLen), blocks = [];
    let k = 0;
    for (const n of blockSizes) { const d = data.slice(k, k + n); k += n; blocks.push({ d, e: remainder(d, div) }); }
    const words = [];
    for (let i = 0; i < Math.max(...blockSizes); i++) for (const b of blocks) if (i < b.d.length) words.push(b.d[i]);
    for (let i = 0; i < ecLen; i++) for (const b of blocks) words.push(b.e[i]);

    // ---- The grid ----
    const size = version * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }      // timing
    for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {                          // finders and their separators
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
    const al = ALIGN[version], last = al.length - 1;
    for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const format = (mask) => {
      const v = (0 << 3) | mask;                         // level M is 00
      let r = v;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const f = ((v << 10) | r) ^ 0x5412, bit = (i) => ((f >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);                            // the dark module
    };
    format(0);                                           // (reserves those places)

    // Codewords, in the zigzag from the bottom right.
    let n = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (fn[y][x] || n >= words.length * 8) continue;
        mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) === 1;
        n++;
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const flip = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    let best = 0, low = Infinity;
    for (let m = 0; m < 8; m++) {
      flip(m); format(m);
      const p = penalty(mod, size);
      if (p < low) { low = p; best = m; }
      flip(m);
    }
    if (mask >= 0 && mask < 8) best = mask;            // (a given mask: for testing)
    flip(best); format(best);
    return { size, version, dark: (x, y) => mod[y][x] };
  }

  /* The standard's penalty: long runs, 2×2 blocks, finder-like patterns, and an uneven dark/light balance. */
  function penalty(m, size) {
    let p = 0, dark = 0;
    const lines = [];
    for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map((row) => row[i])); }
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) { run++; continue; }
        if (run >= 5) p += 3 + run - 5;
        run = 1;
      }
      for (let i = 0; i + 7 <= size; i++) {               // 1:1:3:1:1 with 4 light modules on either side
        if (!(line[i] && !line[i + 1] && line[i + 2] && line[i + 3] && line[i + 4] && !line[i + 5] && line[i + 6])) continue;
        const before = i >= 4 && !line[i - 1] && !line[i - 2] && !line[i - 3] && !line[i - 4];
        const after = i + 11 <= size && !line[i + 7] && !line[i + 8] && !line[i + 9] && !line[i + 10];
        if (before || after) p += 40;
      }
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (m[y][x]) dark++;
      if (x < size - 1 && y < size - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    }
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  }

  WB.qr = encode;
  WB.qrSvg = function (text, scale) {
    const q = encode(text), quiet = 4, n = q.size + quiet * 2;
    let d = '';
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.dark(x, y)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    const px = n * (scale || 4);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
  };
})();
