// @ts-expect-error — the qrcode package ships untyped core internals; create() is stable API
import QRCodeCore from "qrcode/lib/core/qrcode";
import type { QRCode as QRCodeType } from "qrcode";

export interface QrMatrix {
  size: number;
  get(r: number, c: number): boolean;
}

/**
 * Encode text into a QR matrix using the battle-tested `qrcode` package
 * (ISO/IEC 18004-compliant, error correction level M — 15% recoverable).
 * Real phone cameras and banking apps decode the result reliably.
 */
export function qrEncode(text: string): QrMatrix {
  const qr = QRCodeCore.create(text, { errorCorrectionLevel: "M" }) as unknown as QRCodeType & {
    modules: { size: number; data: Uint8Array };
  };
  const { size, data } = qr.modules;
  return {
    size,
    get: (r: number, c: number) => data[r * size + c] === 1,
  };
}

/** Render a QR matrix to a compact SVG string (crisp print, no deps). */
export function qrSvg(text: string, opts: { scale?: number; quiet?: number; dark?: string; light?: string } = {}): string {
  const { scale = 4, quiet = 4, dark = "#111827", light = "#ffffff" } = opts;
  const m = qrEncode(text);
  const dim = (m.size + quiet * 2) * scale;
  const parts: string[] = [];
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) {
      if (m.get(r, c)) {
        parts.push(`M${(c + quiet) * scale},${(r + quiet) * scale}h${scale}v${scale}h-${scale}z`);
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="${light}"/><path d="${parts.join("")}" fill="${dark}"/></svg>`;
}
