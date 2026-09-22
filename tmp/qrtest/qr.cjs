"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/lib/qr.ts
var qr_exports = {};
__export(qr_exports, {
  qrEncode: () => qrEncode,
  qrSvg: () => qrSvg
});
module.exports = __toCommonJS(qr_exports);
var V_TABLE = {
  1: { size: 21, blocks: 1, data: 16, ecc: 10 },
  2: { size: 25, blocks: 1, data: 28, ecc: 16 },
  3: { size: 29, blocks: 1, data: 44, ecc: 26 },
  4: { size: 33, blocks: 2, data: 32, ecc: 18 },
  5: { size: 37, blocks: 2, data: 43, ecc: 24 },
  6: { size: 41, blocks: 4, data: 27, ecc: 16 },
  7: { size: 45, blocks: 4, data: 34, ecc: 15 }
};
function pickVersion(byteLen) {
  for (let version = 1; version <= 7; version++) {
    const v = V_TABLE[version];
    if (byteLen <= v.blocks * v.data - 2) return { version, v };
  }
  throw new Error("Payload too long for the built-in QR encoder (max ~120 bytes).");
}
var EXP = new Uint8Array(512);
var LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 285;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
var gmul = (a, b) => a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
function rsGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gmul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}
function rsEncode(data, eccLen) {
  const gen = rsGenerator(eccLen);
  const res = new Array(eccLen).fill(0);
  for (const byte of data) {
    const factor = byte ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let i = 0; i < eccLen; i++) res[i] ^= gmul(gen[i], factor);
    }
  }
  return res;
}
function buildCodewords(text, dataCodewords) {
  const bytes = new TextEncoder().encode(text);
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push(val >> i & 1);
  };
  push(4, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capBits = dataCodewords * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const pads = [236, 17];
  let pi = 0;
  while (bits.length < capBits) {
    push(pads[pi % 2], 8);
    pi++;
  }
  const out = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = b << 1 | bits[i + j];
    out.push(b);
  }
  return out;
}
var Matrix = class _Matrix {
  size;
  m;
  constructor(size) {
    this.size = size;
    this.m = Array.from({ length: size }, () => new Array(size).fill(null));
  }
  get(r, c) {
    return (this.m[r] && this.m[r][c]) ?? null;
  }
  set(r, c, v) {
    if (r >= 0 && c >= 0 && r < this.size && c < this.size) this.m[r][c] = v;
  }
  clone() {
    const copy = new _Matrix(this.size);
    for (let r = 0; r < this.size; r++)
      for (let c = 0; c < this.size; c++) copy.m[r][c] = this.m[r][c];
    return copy;
  }
};
function placeFinder(m, r0, c0) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const dark = r >= 0 && r <= 6 && (c === 0 || c === 6) || c >= 0 && c <= 6 && (r === 0 || r === 6) || r >= 2 && r <= 4 && c >= 2 && c <= 4;
      m.set(r0 + r, c0 + c, dark);
    }
  }
}
function placeTiming(m) {
  for (let i = 8; i < m.size - 8; i++) {
    const dark = i % 2 === 0;
    m.set(6, i, dark);
    m.set(i, 6, dark);
  }
}
var ALIGN_CENTERS = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38]
};
function placeAlignment(m, version) {
  const centers = ALIGN_CENTERS[version] ?? [];
  for (const r of centers) {
    for (const c of centers) {
      if (r <= 8 && c <= 8 || r <= 8 && c >= m.size - 9 || r >= m.size - 9 && c <= 8) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          m.set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
        }
      }
    }
  }
}
function placeDarkModule(m) {
  m.set(m.size - 8, 8, true);
}
function placeData(m, codewords) {
  const totalBits = codewords.length * 8;
  let bitIdx = 0;
  let col = m.size - 1;
  let up = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < m.size; i++) {
      const r = up ? m.size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (m.get(r, c) !== null) continue;
        const bit = bitIdx < totalBits ? (codewords[bitIdx >> 3] >> 7 - (bitIdx & 7) & 1) === 1 : false;
        m.set(r, c, bit);
        bitIdx++;
      }
    }
    up = !up;
    col -= 2;
  }
}
var MASK_FNS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => r * c % 2 + r * c % 3 === 0,
  (r, c) => (r * c % 2 + r * c % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + r * c % 3) % 2 === 0
];
function maskData(m, maskId) {
  const fn = MASK_FNS[maskId];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(r, c) !== null && fn(r, c)) m.set(r, c, !m.get(r, c));
    }
  }
}
function penalty(m) {
  let score = 0;
  const dark = (r, c) => m.get(r, c) === true;
  for (let r = 0; r < m.size; r++) {
    let run = 1;
    for (let c = 1; c < m.size; c++) {
      if (m.get(r, c) !== null && m.get(r, c) === m.get(r, c - 1)) run++;
      else run = 1;
      if (run === 5) score += 3;
      else if (run > 5) score += 1;
    }
  }
  for (let c = 0; c < m.size; c++) {
    let run = 1;
    for (let r = 1; r < m.size; r++) {
      if (m.get(r, c) !== null && m.get(r, c) === m.get(r - 1, c)) run++;
      else run = 1;
      if (run === 5) score += 3;
      else if (run > 5) score += 1;
    }
  }
  for (let r = 0; r < m.size - 1; r++) {
    for (let c = 0; c < m.size - 1; c++) {
      if (dark(r, c) === dark(r, c + 1) && dark(r, c) === dark(r + 1, c) && dark(r, c) === dark(r + 1, c + 1)) score += 3;
    }
  }
  let darkCount = 0;
  for (let r = 0; r < m.size; r++) for (let c = 0; c < m.size; c++) if (dark(r, c)) darkCount++;
  score += Math.floor(Math.abs(darkCount * 100 / (m.size * m.size) - 50) / 5) * 10;
  return score;
}
function drawFormat(m, maskId) {
  const data = maskId;
  const rem = bchRemainder(data);
  const bits = (data << 10 | rem) ^ 21522;
  const s = m.size;
  for (let i = 0; i <= 5; i++) m.set(8, i, (bits >> i & 1) === 1);
  m.set(8, 7, (bits >> 6 & 1) === 1);
  m.set(8, 8, (bits >> 7 & 1) === 1);
  m.set(7, 8, (bits >> 8 & 1) === 1);
  for (let i = 9; i < 15; i++) m.set(14 - i, 8, (bits >> i & 1) === 1);
  for (let i = 0; i < 8; i++) m.set(s - 1 - i, 8, (bits >> i & 1) === 1);
  for (let i = 8; i < 15; i++) m.set(8, s - 15 + i, (bits >> i & 1) === 1);
  m.set(s - 8, 8, true);
}
function bchRemainder(data) {
  let d = data << 10;
  const g = 1335;
  for (let i = 4; i >= 0; i--) {
    if (d & 1 << i + 10) d ^= g << i;
  }
  return d & 1023;
}
function qrEncode(text) {
  const byteLen = new TextEncoder().encode(text).length;
  const { version, v } = pickVersion(byteLen);
  const dataCodewords = v.blocks * v.data;
  const codewords = buildCodewords(text, dataCodewords);
  const dataBlocks = [];
  for (let i = 0; i < v.blocks; i++) dataBlocks.push(codewords.slice(i * v.data, (i + 1) * v.data));
  const eccBlocks = dataBlocks.map((b) => rsEncode(b, v.ecc));
  const interleaved = [];
  for (let i = 0; i < v.data; i++) for (const b of dataBlocks) interleaved.push(b[i]);
  for (let i = 0; i < v.ecc; i++) for (const b of eccBlocks) interleaved.push(b[i]);
  const m = new Matrix(v.size);
  placeFinder(m, 0, 0);
  placeFinder(m, 0, v.size - 7);
  placeFinder(m, v.size - 7, 0);
  placeTiming(m);
  placeAlignment(m, version);
  placeDarkModule(m);
  placeData(m, interleaved);
  let best = 0;
  let bestScore = Infinity;
  for (let id = 0; id < 8; id++) {
    const trial = m.clone();
    maskData(trial, id);
    const score = penalty(trial);
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  maskData(m, best);
  drawFormat(m, best);
  return {
    size: m.size,
    get: (r, c) => m.get(r, c) === true
  };
}
function qrSvg(text, opts = {}) {
  const { scale = 4, quiet = 4, dark = "#111827", light = "#ffffff" } = opts;
  const m = qrEncode(text);
  const dim = (m.size + quiet * 2) * scale;
  const parts = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(r, c)) {
        parts.push(`M${(c + quiet) * scale},${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  qrEncode,
  qrSvg
});
