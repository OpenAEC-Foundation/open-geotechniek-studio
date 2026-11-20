// Tekenopdrachten van de boorstaat, in millimeters. De opbouw (boorstaat.ts) levert één lijst op die
// zowel naar SVG (scherm) als naar jsPDF (rapport) gaat, zodat beide exact hetzelfde beeld geven.
import type { PatternKey } from "./nen5104";
import { PATTERNS } from "./nen5104";

export type Prim =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw?: number }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; lw: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; lw?: number }
  | { t: "poly"; points: Array<[number, number]>; fill: string }
  | { t: "text"; x: number; y: number; text: string; size: number; bold?: boolean; italic?: boolean; align?: "left" | "right" | "center"; color?: string };

export interface Scene { width: number; height: number; items: Prim[] }

const PT = 25.4 / 72;
const NARROW = new Set("iljtfrI.,:;|!'()[] -".split(""));
const WIDE = new Set("mwMW@%".split(""));

/**
 * Geschatte tekstbreedte in mm voor Helvetica. Bewust een eigen schatting en niet de maat van de
 * PDF-bibliotheek of de browser: zo breken regels op het scherm en in de PDF op dezelfde plek.
 */
export function textWidth(text: string, size: number, bold = false): number {
  let em = 0;
  for (const ch of text) em += NARROW.has(ch) ? 0.3 : WIDE.has(ch) ? 0.85 : ch >= "A" && ch <= "Z" ? 0.68 : 0.54;
  return em * size * PT * (bold ? 1.06 : 1);
}

/** Breekt tekst op woordgrenzen binnen de breedte; een te lang woord blijft heel op een eigen regel. */
export function wrapText(text: string, size: number, width: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const frac = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

/**
 * Een vlak in de kleur en arcering van een grondsoort. De arcering ligt op een vast raster ten
 * opzichte van het blad, zodat ze over laaggrenzen doorloopt, en blijft binnen het vlak.
 */
export function patternRect(key: PatternKey, x: number, y: number, w: number, h: number): Prim[] {
  const { fill, ink } = PATTERNS[key];
  const out: Prim[] = [{ t: "rect", x, y, w, h, fill }];
  const x1 = x + w, y1 = y + h;
  const dots = (dx: number, dy: number, r: number, open: boolean) => {
    let row = Math.ceil((y + r) / dy - 1e-9);
    for (let cy = row * dy; cy <= y1 - r + 1e-9; cy = ++row * dy) {
      const shift = row % 2 ? dx / 2 : 0;
      for (let cx = frac(x + r - shift, dx) + shift; cx <= x1 - r + 1e-9; cx += dx)
        out.push(open ? { t: "circle", cx, cy, r, stroke: ink, lw: 0.14 } : { t: "circle", cx, cy, r, fill: ink });
    }
  };
  const diagonal = (step: number, rising: boolean) => {
    // Stijgend: x + y = c. Dalend: x - y = c.
    const lo = rising ? x + y : x - y1, hi = rising ? x1 + y1 : x1 - y;
    for (let c = frac(lo, step); c < hi; c += step) {
      const a = Math.max(x, rising ? c - y1 : c + y), b = Math.min(x1, rising ? c - y : c + y1);
      if (b - a > 0.05) out.push({ t: "line", x1: a, y1: rising ? c - a : a - c, x2: b, y2: rising ? c - b : b - c, stroke: ink, lw: 0.16 });
    }
  };
  if (key === "Z") dots(2.4, 1.8, 0.2, false);
  else if (key === "S") dots(1.4, 1.2, 0.11, false);
  else if (key === "G") dots(3.4, 2.8, 0.75, true);
  else if (key === "K") diagonal(2.4, true);
  else if (key === "L") { diagonal(3.2, false); dots(3.2, 2.6, 0.14, false); }
  else if (key === "V") { for (let ly = frac(y + 0.2, 1.5); ly < y1 - 0.2; ly += 1.5) out.push({ t: "line", x1: x, y1: ly, x2: x1, y2: ly, stroke: ink, lw: 0.22 }); }
  else if (key === "H") {
    let row = Math.ceil((y + 0.3) / 1.4 - 1e-9);
    for (let ly = row * 1.4; ly < y1 - 0.2; ly = ++row * 1.4) {
      const shift = row % 2 ? 1.3 : 0;
      for (let lx = frac(x - shift, 2.6) + shift; lx < x1; lx += 2.6)
        out.push({ t: "line", x1: lx, y1: ly, x2: Math.min(x1, lx + 1.2), y2: ly, stroke: ink, lw: 0.2 });
    }
  }
  return out;
}
