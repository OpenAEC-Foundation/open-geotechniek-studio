// Opbouw van de boorstaat: kop, diepteschalen (maaiveld en NAP), boorkolom met kleur en arcering per
// laag, laaggrenzen, beschrijving per laag, grondwaterstand en legenda. Het resultaat is een lijst
// tekenopdrachten in mm (scene.ts) die het scherm en het rapport allebei gebruiken.
import type { Bore, BoreLayer } from "../types/bore";
import { classFromCode, classifyLayer, layerSymbol, unclassifiedWords, PATTERNS, soilName, type PatternKey, type SoilClass } from "./nen5104";
import { patternRect, textWidth, wrapText, type Prim, type Scene } from "./scene";

export interface BoorstaatLabels {
  bore: string; date: string; method: string; x: string; y: string; groundLevel: string; finalDepth: string;
  groundwater: string; scale: string; depthGround: string; depthNap: string; description: string; legend: string;
  admixtureNote: string; colour: string; unknown: string; noLayers: string; belowGround: string;
}
export const BOORSTAAT_LABELS: BoorstaatLabels = {
  bore: "Boring", date: "Datum", method: "Boormethode", x: "X (RD)", y: "Y (RD)", groundLevel: "Maaiveld",
  finalDepth: "Einddiepte", groundwater: "Grondwaterstand", scale: "Schaal", depthGround: "m -mv", depthNap: "m NAP",
  description: "Beschrijving", legend: "Legenda", admixtureNote: "Smalle strook rechts in de kolom: bijmenging, breder naarmate die sterker is.",
  colour: "kleur", unknown: "niet bekend", noLayers: "Deze boring heeft nog geen lagen.", belowGround: "m -mv",
};

export interface BoorstaatOptions { width?: number; height?: number; labels?: BoorstaatLabels }

export interface BoorstaatLayout {
  scene: Scene;
  /** Schaalgetal N van de verticale schaal 1:N. */
  scale: number;
  mmPerMeter: number;
  /** Boorkolom op het blad. */
  column: { x: number; y: number; width: number; height: number };
  /** Per laag de plek in de kolom en de tekenwijze. */
  layers: Array<{ top: number; bottom: number; soil: SoilClass; bands: Array<{ pattern: PatternKey; x: number; width: number }> }>;
  /** Maatstreepjes van de diepteschaal: diepte onder maaiveld, hoogte t.o.v. NAP als die bekend is, en de plek op het blad. */
  ticks: Array<{ depth: number; nap?: number; y: number }>;
  /** Tekenwijzen in de legenda, in vaste volgorde. */
  legend: PatternKey[];
  groundwaterY?: number;
}

const SCALES = [10, 20, 25, 40, 50, 75, 100, 125, 150, 200, 250, 400, 500, 750, 1000, 2000];
const TICK_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 50];
const INK = "#191919", LABEL = "#5F5F66", RULE = "#B9B9C0", WATER = "#1D6FD1";
const LEGEND_ORDER: PatternKey[] = ["G", "Z", "L", "K", "V", "S", "H", "X"];

export const fmt = (value: number | undefined, digits = 2) => value != null && Number.isFinite(value) ? value.toFixed(digits) : null;

/** Einddiepte van de boring: de opgegeven einddiepte, maar nooit ondieper dan de diepste laag. */
export function boreDepth(bore: Bore): number {
  return Math.max(bore.final_depth ?? 0, ...bore.layers.map((l) => l.base_depth), 0);
}

/** Kleinste gangbare schaal waarbij de boring op de beschikbare hoogte (mm) past. */
export function pickScale(depth: number, height: number): number {
  return SCALES.find((n) => depth * 1000 / n <= height + 1e-6) ?? SCALES[SCALES.length - 1];
}

/** Datum als dd-mm-jjjj wanneer hij als jjjj-mm-dd is opgeslagen; anders ongewijzigd. */
export function displayDate(value: string | undefined): string | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

/** Benaming van een laag: volgens NEN 5104 als de grondsoort is herkend, anders de tekst uit het bestand. */
export function layerTitle(layer: BoreLayer, soil = classifyLayer(layer)): string {
  if (soil.main === "X") return layer.soil_name || "Overig";
  // Een benaming die al in woorden is gegeven en meer zegt (bv. "Zand, zwak siltig, glauconiethoudend") blijft staan.
  if (/[ ,]/.test(layer.soil_name.trim()) && !classFromCode(layer.soil_name)) return layer.soil_name;
  // Aaneengeschreven benaming uit een BRO-bestand: NEN 5104-vorm, met wat daar niet in past erachter.
  const rest = layer.soil_code || classFromCode(layer.soil_name) ? "" : unclassifiedWords(layer.soil_name);
  return rest ? `${soilName(soil)}, ${rest}` : soilName(soil);
}

/** Aaneengeschreven waarden uit BRO-bestanden ("zwakKalkhoudend") als gewone woorden. */
const words = (value: string) => /^[a-zà-ÿ]+(?:[A-Z][a-zà-ÿ]+)+$/.test(value) ? value.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2").toLowerCase() : value;

/** Bijzonderheden van een laag als één regel: kleur, opmerking en nevenkenmerken. */
export function layerDetails(layer: BoreLayer, labels: BoorstaatLabels = BOORSTAAT_LABELS): string {
  const parts: string[] = [];
  // BRO-bestanden schrijven kleuren aaneen ("standaardBruin"); op de boorstaat staan het gewone woorden.
  if (layer.colour?.trim()) parts.push(`${labels.colour} ${words(layer.colour.trim()).replace(/^standaard /, "")}`);
  // De GEF-lezer zet de volledige coderegel in de beschrijving; de code zelf staat al in de benaming.
  const remark = layer.description?.split(";").map((p) => p.trim()).filter((p, i) => p && !(i === 0 && p === layer.soil_code)).join("; ");
  if (remark) parts.push(remark);
  for (const s of layer.secondary ?? []) parts.push(`${s.label.toLowerCase()}: ${words(s.value)}`);
  return parts.join("; ");
}

export function buildBoorstaat(bore: Bore, options: BoorstaatOptions = {}): BoorstaatLayout {
  const W = options.width ?? 180, H = options.height ?? 258, L = options.labels ?? BOORSTAAT_LABELS;
  const items: Prim[] = [];
  const text = (x: number, y: number, value: string, size: number, extra: Partial<Extract<Prim, { t: "text" }>> = {}) =>
    items.push({ t: "text", x, y, text: value, size, color: INK, ...extra });
  const line = (x1: number, y1: number, x2: number, y2: number, stroke = INK, lw = 0.2) => items.push({ t: "line", x1, y1, x2, y2, stroke, lw });

  const depth = boreDepth(bore), z0 = bore.position?.z_nap, hasNap = typeof z0 === "number" && Number.isFinite(z0);
  const layers = [...bore.layers].sort((a, b) => a.top_depth - b.top_depth);
  const soils = layers.map((layer) => classifyLayer(layer));
  const used = new Set<PatternKey>();
  const symbols = soils.map((soil) => layerSymbol(soil));
  symbols.forEach((symbol) => symbol.bands.forEach((band) => used.add(band.pattern)));
  const legend = LEGEND_ORDER.filter((key) => used.has(key));
  const hasWater = typeof bore.groundwater_depth === "number" && Number.isFinite(bore.groundwater_depth) && bore.groundwater_depth >= 0;

  // ── Kop: drie rijen van drie velden ───────────────────────────────
  const headH = 24, cellW = W / 3;
  items.push({ t: "rect", x: 0, y: 0, w: W, h: headH, stroke: INK, lw: 0.3 });
  const na = L.unknown;
  const gwText = hasWater ? `${fmt(bore.groundwater_depth)} ${L.belowGround}${hasNap ? ` (NAP ${fmt(z0! - bore.groundwater_depth!)} m)` : ""}` : na;
  const fields: Array<[string, string]> = [
    [L.bore, bore.id || na], [L.date, displayDate(bore.metadata.start_date ?? bore.metadata.description_date) ?? na], [L.method, bore.metadata.bore_method ?? na],
    [L.x, bore.position ? `${fmt(bore.position.x_rd)} m` : na], [L.y, bore.position ? `${fmt(bore.position.y_rd)} m` : na], [L.groundLevel, hasNap ? `NAP ${fmt(z0)} m` : na],
    [L.finalDepth, depth > 0 ? `${fmt(depth)} ${L.belowGround}` : na], [L.groundwater, gwText], [L.scale, ""],
  ];
  const legendH = legend.length ? 15 : 0;
  const colTop = headH + 11, colBottom = H - legendH - (legendH ? 5 : 0) - 1.5;
  const scale = pickScale(depth, colBottom - colTop), mm = 1000 / scale;
  fields[8][1] = depth > 0 ? `1 : ${scale}` : na;
  fields.forEach(([label, value], i) => {
    const x = (i % 3) * cellW, y = Math.floor(i / 3) * 8;
    if (i % 3) line(x, 0, x, headH, RULE, 0.15);
    if (i >= 3 && i % 3 === 0) line(0, y, W, y, RULE, 0.15);
    text(x + 2, y + 3.1, label, 6, { color: LABEL });
    const size = i === 0 ? 10 : 8.5, max = cellW - 4;
    let shown = value;
    while (shown.length > 3 && textWidth(shown, size, i === 0) > max) shown = `${shown.slice(0, -2).trimEnd()}...`;
    text(x + 2, y + 6.9, shown, size, { bold: i === 0, color: value === na ? LABEL : INK, italic: value === na });
  });

  // ── Kolommen ──────────────────────────────────────────────────────
  const mvX = 13, napX = hasNap ? 30 : mvX, colX = napX + 4, colW = 24, boundX = colX + colW + 1.5, descX = boundX + 15, descW = W - descX;
  const headY = colTop - 3.2;
  text(mvX - 2, headY, L.depthGround, 6.5, { align: "right", color: LABEL });
  if (hasNap) text(napX - 2, headY, L.depthNap, 6.5, { align: "right", color: LABEL });
  text(descX, headY, L.description, 6.5, { color: LABEL });
  line(0, colTop - 1.6, W, colTop - 1.6, RULE, 0.15);

  const yOf = (d: number) => colTop + d * mm;
  const column = { x: colX, y: colTop, width: colW, height: depth * mm };
  const outLayers: BoorstaatLayout["layers"] = [];
  const ticks: BoorstaatLayout["ticks"] = [];
  if (!layers.length || depth <= 0) {
    text(colX, colTop + 6, L.noLayers, 8.5, { italic: true, color: LABEL });
  } else {
    // Maatstreepjes: stap zo gekozen dat de getallen minstens 6 mm uit elkaar staan.
    const step = TICK_STEPS.find((s) => s * mm >= 6) ?? TICK_STEPS[TICK_STEPS.length - 1];
    const digits = step < 1 && step * 10 % 1 > 1e-9 ? 2 : step < 1 ? 1 : 0;
    for (let i = 0; i * step <= depth + 1e-9; i++) {
      const d = +(i * step).toFixed(4), y = yOf(d);
      ticks.push({ depth: d, y, ...(hasNap ? { nap: +(z0! - d).toFixed(4) } : {}) });
      line(mvX - 1.2, y, mvX, y);
      text(mvX - 2, y + 0.85, d.toFixed(digits), 7, { align: "right" });
      if (hasNap) { line(napX - 1.2, y, napX, y); text(napX - 2, y + 0.85, (z0! - d).toFixed(2), 7, { align: "right" }); }
    }
    line(mvX, colTop, mvX, yOf(depth));
    if (hasNap) line(napX, colTop, napX, yOf(depth));

    // Lagen: hoofdgrondsoort links, bijmengstroken rechts.
    layers.forEach((layer, i) => {
      const top = yOf(layer.top_depth), bottom = yOf(Math.min(layer.base_depth, depth));
      let x = colX;
      const bands = symbols[i].bands.map((band) => {
        const width = band.share * colW, placed = { pattern: band.pattern, x, width };
        items.push(...patternRect(band.pattern, x, top, width, bottom - top));
        x += width;
        return placed;
      });
      outLayers.push({ top, bottom, soil: soils[i], bands });
    });
    items.push({ t: "rect", x: colX, y: colTop, w: colW, h: depth * mm, stroke: INK, lw: 0.3 });

    // Laaggrenzen met diepte; een getal dat op het vorige zou vallen blijft weg (het staat ook in de beschrijving).
    const bounds = [...new Set(layers.flatMap((l) => [l.top_depth, Math.min(l.base_depth, depth)]).map((d) => +d.toFixed(3)))].sort((a, b) => a - b);
    let lastLabel = -Infinity;
    for (const d of bounds) {
      const y = yOf(d);
      line(colX, y, colX + colW + 1.2, y, INK, 0.25);
      if (y - lastLabel >= 2.7) { text(boundX, y + 0.85, d.toFixed(2), 7); lastLabel = y; }
    }

    // Beschrijvingen: naast de laag, naar beneden geschoven waar ze anders over elkaar vallen.
    const titleSize = 7.5, bodySize = 7, lh = 2.95;
    const makeBlocks = (maxBody: number) => layers.map((layer, i) => {
      const range = `${layer.top_depth.toFixed(2)} - ${layer.base_depth.toFixed(2)}`;
      const title = wrapText(`${range} ${layerTitle(layer, soils[i])}`, titleSize, descW - 1, true).slice(0, 2);
      title[0] = title[0].replace(`${range} `, `${range}  `);
      let body = wrapText(layerDetails(layer, L), bodySize, descW);
      if (body.length > maxBody) { body = body.slice(0, maxBody); if (maxBody) body[maxBody - 1] = `${body[maxBody - 1].replace(/[;,.]?\s*\S*$/, "")} ...`; }
      return { title, body, height: (title.length + body.length) * lh + 1.1 };
    });
    const room = colBottom - colTop + 1;
    const blocks = [Infinity, 3, 2, 1, 0].map(makeBlocks).find((b) => b.reduce((s, x) => s + x.height, 0) <= room) ?? makeBlocks(0);
    const ys: number[] = [];
    blocks.forEach((_, i) => ys.push(Math.max(yOf(layers[i].top_depth) + 0.4, i ? ys[i - 1] + blocks[i - 1].height : colTop)));
    for (let i = blocks.length - 1, limit = colBottom + 1; i >= 0; i--) { ys[i] = Math.min(ys[i], limit - blocks[i].height); limit = ys[i]; }
    blocks.forEach((block, i) => {
      const y = ys[i], mid = (outLayers[i].top + outLayers[i].bottom) / 2, anchor = y + lh * 0.75;
      // Verwijslijn wanneer de tekst niet meer op de hoogte van zijn laag staat.
      if (anchor < outLayers[i].top - 0.2 || anchor > outLayers[i].bottom + 0.2) {
        line(colX + colW, mid, boundX + 11.5, mid, RULE, 0.15);
        line(boundX + 11.5, mid, descX - 1, anchor, RULE, 0.15);
      }
      block.title.forEach((row, r) => text(descX, y + lh * (r + 1) - 0.5, row, titleSize, { bold: true }));
      block.body.forEach((row, r) => text(descX, y + lh * (block.title.length + r + 1) - 0.5, row, bodySize, { color: "#33333A" }));
    });
  }

  // ── Grondwaterstand: blauwe lijn door de kolom met het gebruikelijke driehoekje ─────────
  let groundwaterY: number | undefined;
  if (hasWater && depth > 0 && bore.groundwater_depth! <= depth) {
    const y = groundwaterY = yOf(bore.groundwater_depth!), x = colX - 2.2;
    line(colX - 3.6, y, colX + colW, y, WATER, 0.35);
    items.push({ t: "poly", points: [[x - 1.3, y - 2.1], [x + 1.3, y - 2.1], [x, y - 0.15]], fill: WATER });
  }

  // ── Legenda ───────────────────────────────────────────────────────
  if (legend.length) {
    const top = H - legendH;
    items.push({ t: "rect", x: 0, y: top, w: W, h: legendH, stroke: RULE, lw: 0.2 });
    text(2, top + 3.6, L.legend, 6.5, { bold: true, color: LABEL });
    const slot = Math.min(24, (W - 4 - (hasWater ? 30 : 0)) / legend.length);
    legend.forEach((key, i) => {
      const x = 2 + i * slot, y = top + 5.2;
      items.push(...patternRect(key, x, y, 7, 4.2), { t: "rect", x, y, w: 7, h: 4.2, stroke: INK, lw: 0.15 });
      text(x + 8.2, y + 3.1, PATTERNS[key].name, 7);
    });
    if (hasWater) {
      const x = W - 30, y = top + 8.6;
      line(x, y, x + 7, y, WATER, 0.35);
      items.push({ t: "poly", points: [[x + 2.2, y - 2.1], [x + 4.8, y - 2.1], [x + 3.5, y - 0.15]], fill: WATER });
      text(x + 8.2, y + 0.7, L.groundwater, 7);
    }
    text(2, top + 13.2, L.admixtureNote, 6, { italic: true, color: LABEL });
  }
  return { scene: { width: W, height: H, items }, scale, mmPerMeter: mm, column, layers: outLayers, ticks, legend, ...(groundwaterY != null ? { groundwaterY } : {}) };
}
