// Text for the PDF reports with real sub- and superscripts and real Greek
// letters and mathematical signs, always as vector text.
//
// Ordinary characters are set in the standard PDF sans. Characters that font
// does not have (Greek, minus, root, arrows, ...) come from an embedded subset
// of Inter; see scripts/build-report-symbol-font.py. The symbol font is only
// added to a document once a text needs it, one time per weight.
//
// Markup understood in a text:
//   R_c;cal;max   subscript after a symbol of one or two letters (with an optional
//                 prime, as in σ'_v) or after ) ] or |; runs over letters,
//                 digits and ; or , between them
//   σ_{v;i-1}     subscript with explicit braces
//   10^-3  m^{2}  superscript: a signed number, or anything between braces
import type { jsPDF } from "jspdf";
import { SYMBOL_BOLD_TTF, SYMBOL_CHARS, SYMBOL_REGULAR_TTF } from "./reportSymbolFont";

export const BASE_FONT = "helvetica";
export const SYMBOL_FONT = "report-symbols";

export interface RichStyle {
  /** Font size in points. */
  size: number;
  bold?: boolean;
  italic?: boolean;
}

const PT = 25.4 / 72;
const SCRIPT_SCALE = 0.72;
const SUB_SHIFT = 0.17;
const SUP_SHIFT = -0.36;

const SYMBOLS = new Set(SYMBOL_CHARS);
/** Characters of code page 1252 above U+00FF, which the standard font also has. */
const CP1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
/** Stand-ins for characters that neither font has. */
const FALLBACK: Record<string, string> = { "\u2300": "Ø", "\u2219": "·", "\u22c5": "·", "\u2011": "-", "\u00a0": " ", "\u202f": " ", "\u2009": " ", "\t": " " };

/** Real widths (per 1000 units) of characters for which jsPDF only has a rough default;
 *  without them the text after such a character in a mixed line starts too early. */
const TRUE_WIDTH: Record<string, number> = { "½": 834, "¼": 834, "¾": 834, "¹": 333, "²": 333, "³": 333, "×": 584, "\u00a0": 278 };

const isBase = (ch: string) => { const c = ch.charCodeAt(0); return (c >= 0x20 && c <= 0xff && !(c >= 0x7f && c <= 0x9f)) || CP1252_EXTRA.has(ch); };

const LETTER = "A-Za-z\\u0391-\\u03C9";
const SCRIPT = new RegExp(`([${LETTER}]{1,2}'?|[)\\]|])_(\\{[^}]*\\}|[${LETTER}0-9']+(?:[;,][${LETTER}0-9']+)*)|\\^(\\{[^}]*\\}|[-+\\u2212]?\\d+)`, "g");
const WORD_CHAR = new RegExp(`[${LETTER}0-9_]`);

interface Segment { text: string; level: -1 | 0 | 1 }
interface Run { text: string; symbol: boolean; level: -1 | 0 | 1 }

const unbrace = (s: string) => (s.startsWith("{") ? s.slice(1, -1) : s);

function segments(text: string): Segment[] {
  const out: Segment[] = [];
  const push = (t: string, level: Segment["level"]) => { if (t) out.push({ text: t, level }); };
  let last = 0;
  for (const m of text.matchAll(SCRIPT)) {
    const at = m.index ?? 0;
    if (m[3] !== undefined) {
      push(text.slice(last, at), 0);
      push(unbrace(m[3]).replace(/^-/, "\u2212"), 1);
    } else {
      // A subscript belongs to a symbol, not to the tail of a longer word or name.
      if (!")]|".includes(m[1]) && at > 0 && WORD_CHAR.test(text[at - 1])) continue;
      push(text.slice(last, at + m[1].length), 0);
      push(unbrace(m[2]), -1);
    }
    last = at + m[0].length;
  }
  push(text.slice(last), 0);
  return out;
}

function runs(text: string): Run[] {
  const out: Run[] = [];
  for (const seg of segments(text)) {
    let cur: Run | null = null;
    for (const raw of seg.text) {
      const ch = isBase(raw) || SYMBOLS.has(raw) ? raw : FALLBACK[raw] ?? "?";
      const symbol = !isBase(ch);
      if (!cur || cur.symbol !== symbol) { cur = { text: "", symbol, level: seg.level }; out.push(cur); }
      cur.text += ch;
    }
  }
  return out;
}

/** True when a text has no markup and no symbols, so it can go to jsPDF as it is. */
function isPlain(text: string): boolean {
  for (const ch of text) if (!isBase(ch)) return false;
  return segments(text).every((s) => s.level === 0);
}

function useSymbolFont(doc: jsPDF, bold: boolean): void {
  const style = bold ? "bold" : "normal";
  if (!doc.getFontList()[SYMBOL_FONT]?.includes(style)) {
    const file = `${SYMBOL_FONT}-${style}.ttf`;
    doc.addFileToVFS(file, bold ? SYMBOL_BOLD_TTF : SYMBOL_REGULAR_TTF);
    doc.addFont(file, SYMBOL_FONT, style, undefined, "Identity-H");
  }
  doc.setFont(SYMBOL_FONT, style);
}

function useBaseFont(doc: jsPDF, style: RichStyle): void {
  doc.setFont(BASE_FONT, style.bold ? (style.italic ? "bolditalic" : "bold") : style.italic ? "italic" : "normal");
}

function selectFont(doc: jsPDF, run: Run, style: RichStyle): void {
  if (run.symbol) useSymbolFont(doc, !!style.bold); else useBaseFont(doc, style);
  doc.setFontSize(run.level === 0 ? style.size : style.size * SCRIPT_SCALE);
}

function restore(doc: jsPDF, style: RichStyle): void {
  useBaseFont(doc, style);
  doc.setFontSize(style.size);
}

/** Width of a text in the standard font at the current size. */
function baseWidth(doc: jsPDF, text: string): number {
  let w = doc.getTextWidth(text);
  for (const ch of text) {
    const real = TRUE_WIDTH[ch];
    if (real !== undefined) w += (real / 1000) * doc.getFontSize() / doc.internal.scaleFactor - doc.getTextWidth(ch);
  }
  return w;
}

const runWidth = (doc: jsPDF, run: Run) => (run.symbol ? doc.getTextWidth(run.text) : baseWidth(doc, run.text));

/** Width of a text in the unit of the document. */
export function richWidth(doc: jsPDF, text: string, style: RichStyle): number {
  restore(doc, style);
  if (isPlain(text)) return baseWidth(doc, text);
  let w = 0;
  for (const run of runs(text)) { selectFont(doc, run, style); w += runWidth(doc, run); }
  restore(doc, style);
  return w;
}

/** Breaks a text into lines that fit `maxWidth`; markup stays intact. */
export function richWrap(doc: jsPDF, text: string, maxWidth: number, style: RichStyle): string[] {
  restore(doc, style);
  if (isPlain(text)) return doc.splitTextToSize(text, maxWidth) as string[];
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const token of paragraph.split(/(\s+)/)) {
      if (!token) continue;
      if (line && richWidth(doc, (line + token).trimEnd(), style) > maxWidth) {
        lines.push(line.trimEnd());
        line = /^\s+$/.test(token) ? "" : token;
      } else line += token;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/** Draws one line of text; returns its width. The text colour is the caller's. */
export function richText(doc: jsPDF, text: string, x: number, y: number, style: RichStyle & { align?: "left" | "right" | "center" }): number {
  const align = style.align ?? "left";
  restore(doc, style);
  if (isPlain(text)) {
    const w = baseWidth(doc, text);
    doc.text(text, align === "right" ? x - w : align === "center" ? x - w / 2 : x, y);
    return w;
  }
  const width = richWidth(doc, text, style);
  let cx = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  for (const run of runs(text)) {
    selectFont(doc, run, style);
    const shift = run.level === 0 ? 0 : (run.level < 0 ? SUB_SHIFT : SUP_SHIFT) * style.size * PT;
    doc.text(run.text, cx, y + shift);
    cx += runWidth(doc, run);
  }
  restore(doc, style);
  return width;
}
