/**
 * Code 39 barcode rendering (SVG) + parsing helpers.
 * Code 39 is self-checking and supports A-Z, 0-9, space and - . $ / + % —
 * enough for SKUs, no library needed.
 */

// Each character: 9 elements (5 bars + 4 spaces), 'n' = narrow, 'w' = wide.
const CODE39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", "A": "wnnnnwnnw", "B": "nnwnnwnnw",
  "C": "wnwnnwnnn", "D": "nnnnwwnnw", "E": "wnnnwwnnn", "F": "nnwnwwnnn",
  "G": "nnnnnwwnw", "H": "wnnnnwwnn", "I": "nnwnnwwnn", "J": "nnnnwwwnn",
  "K": "wnnnnnnww", "L": "nnwnnnnww", "M": "wnwnnnnwn", "N": "nnnnwnnww",
  "O": "wnnnwnnwn", "P": "nnwnwnnwn", "Q": "nnnnnnwww", "R": "wnnnnnwwn",
  "S": "nnwnnnwwn", "T": "nnnnwnwwn", "U": "wwnnnnnnw", "V": "nwwnnnnnw",
  "W": "wwwnnnnnn", "X": "nwnnwnnnw", "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

export function code39Sanitize(input: string): string {
  return input
    .toUpperCase()
    .split("")
    .filter((ch) => CODE39[ch] && ch !== "*")
    .join("");
}

export interface BarcodeSpec {
  chars: { x: number; w: number }[];
  bars: { x: number; w: number }[];
  width: number;
  text: string;
}

/** Build geometry for an SVG barcode. narrow = 1 unit, wide = 2.6 units. */
export function code39(input: string, narrow = 2, wide = 5.2, quiet = 10): BarcodeSpec {
  const text = code39Sanitize(input) || "0";
  const chars: { x: number; w: number }[] = [];
  const bars: { x: number; w: number }[] = [];
  let x = quiet;

  const drawChar = (ch: string) => {
    const pattern = CODE39[ch];
    if (!pattern) return;
    for (let i = 0; i < pattern.length; i++) {
      const wUnit = pattern[i] === "n" ? narrow : wide;
      if (i % 2 === 0) {
        bars.push({ x, w: wUnit });
      }
      x += wUnit;
    }
    x += narrow; // inter-character gap
  };

  drawChar("*");
  for (const ch of text) drawChar(ch);
  drawChar("*");

  return { chars, bars, width: x + quiet, text };
}

export const CODE39_ALPHABET = Object.keys(CODE39).filter((c) => c !== "*").join("");

/** Tolerant Code-39 read: strips the sentinels, accepts raw digit strings too. */
export function code39Parse(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  const stripped = s.startsWith("*") && s.endsWith("*") ? s.slice(1, -1) : s;
  if (!stripped) return null;
  // Accept anything a handheld/camera might emit; the caller matches against products.
  return stripped;
}
