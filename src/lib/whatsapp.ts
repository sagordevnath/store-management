import type { DB } from "../types";

/**
 * Parses a free-text order (WhatsApp message, voice transcript) into
 * catalog-matched line items. Handles "2 x cola", "2x cola", "cola 2",
 * bare product names, and Bangla digits (০-৯ → 0-9).
 */

const BN_DIGITS: Record<string, string> = {
  "০": "0", "১": "1", "২": "2", "৩": "3", "৪": "4",
  "৫": "5", "৬": "6", "৭": "7", "৮": "8", "৯": "9",
};

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, dozen: 12,
  ek: 1, dui: 2, tin: 3, char: 4, panch: 5, choi: 6, sat: 7, ath: 8, noy: 9, dos: 10,
};

export interface ParsedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface ParsedOrder {
  items: ParsedLine[];
  unmatched: string[];
}

function normalize(text: string): string {
  return text
    .split("")
    .map((ch) => BN_DIGITS[ch] ?? ch)
    .join("");
}

function score(productName: string, line: string): number {
  const pn = productName.toLowerCase();
  const ln = line.toLowerCase();
  if (ln.includes(pn) || pn.includes(ln)) return 100 + Math.min(ln.length, pn.length);
  const pt = new Set(pn.split(/[^a-z0-9\u0980-\u09FF]+/).filter((t) => t.length > 1));
  const lt = ln.split(/[^a-z0-9\u0980-\u09FF]+/).filter((t) => t.length > 1);
  let hits = 0;
  for (const t of lt) if (pt.has(t)) hits++;
  return hits * 10;
}

export function parseOrderText(db: DB, raw: string): ParsedOrder {
  const items: ParsedLine[] = [];
  const unmatched: string[] = [];
  const seen = new Map<string, number>();

  for (const rawLine of normalize(raw).split(/\n|(?<=[.!?])\s{2,}|,|;/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // Leading "N x" / "N x " / "N*"
    let qty = 1;
    let rest = line;
    const lead = /^(\d{1,3})\s*(?:x|×|\*)?\s+(.+)$/i.exec(line) ?? /^(\d{1,3})\s*(?:x|×|\*)\s*(.+)$/i.exec(line);
    if (lead) {
      qty = parseInt(lead[1]!, 10) || 1;
      rest = lead[2]!.trim();
    } else {
      const word = /^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|dozen|ek|dui|tin|char|panch|choi|sat|ath|noy|dos)\s+(.+)$/i.exec(line);
      if (word) {
        qty = WORD_NUMBERS[word[1]!.toLowerCase()] ?? 1;
        rest = word[2]!.trim();
      }
    }

    // Trailing bare number: "milk 2"
    const trail = /^([^0-9]+?)\s+(\d{1,3})$/.exec(rest);
    if (trail && qty === 1 && trail[1]!.trim().length > 2) {
      rest = trail[1]!.trim();
      qty = parseInt(trail[2]!, 10) || 1;
    }

    if (!rest) continue;

    // Fuzzy-match against catalog
    let best: { id: string; name: string; price: number; sc: number } | null = null;
    for (const p of db.products) {
      const sc = score(p.name, rest);
      if (sc >= 10 && (!best || sc > best.sc)) {
        best = { id: p.id, name: p.name, price: p.price, sc };
      }
    }

    if (best) {
      const prev = seen.get(best.id) ?? 0;
      seen.set(best.id, prev + qty);
      const existing = items.find((it) => it.productId === best!.id);
      if (existing) existing.qty += qty;
      else items.push({ productId: best.id, name: best.name, unitPrice: best.price, qty });
    } else {
      unmatched.push(line);
    }
  }

  return { items, unmatched };
}
