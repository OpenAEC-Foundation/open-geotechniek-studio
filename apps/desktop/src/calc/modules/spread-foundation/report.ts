// PDF-uitdraai fundering op staal, met dezelfde kop, voet en opmaak als de andere rekenbladen.
import { jsPDF } from "jspdf";
import type { ProjectContext } from "../../framework/types";
import { CONTENT_W, M, TOTAL_PAGES_TOKEN, type Cursor, formula, kv, makeCursor, nl, paragraph, sectionTitle, table } from "../pile-bearing-capacity/parts/pile-report-pdf";
import { DEFAULT_FACTORS } from "./catalog";
import type { SpreadInput, SpreadResult } from "./compute";
import { groundHeight, layerPolygon, slipExplanation, spreadScene, type ScenePoint, type SpreadScene } from "./scene";

const NORM = "NEN 9997-1 art. 6.5";
const reportDate = (iso: string | undefined) => (iso || new Date().toISOString().slice(0, 10)).slice(0, 10).split("-").reverse().join("-");
const nap = (v: number) => nl(v, 2);
/** Tekens die de standaardletters van de PDF niet kennen. */
const plain = (s: string) => s.replace(/π/g, "pi").replace(/⅔/g, "2/3").replace(/′/g, "'").replace(/½/g, "0,5");

export function spreadReportFileName(input: SpreadInput): string {
  return `fundering-op-staal-${input.shape === "strip" ? "strook" : "poer"}`;
}

/** De doorsnede als figuur, op ware schaal: lagen, hellend maaiveld, voet, beide bezwijkvlakken en de invloedsdiepte. */
function sectionFigure(c: Cursor, s: SpreadScene): void {
  const doc = c.doc, hw = s.halfWidthM, top = Math.max(s.groundZ, s.footingProfile[2].z) + 0.12 * hw, bottom = -s.depthM;
  const k = Math.min((CONTENT_W - 30) / (2 * hw), 70 / (top - bottom)), h = (top - bottom) * k;
  c.reserve(h + 6);
  const x0 = M.left + 22 + hw * k, y0 = c.y + 2 + top * k, X = (x: number) => x0 + x * k, Y = (z: number) => y0 - z * k;
  const poly = (pts: ScenePoint[], style: "S" | "F" | "FD", closed = true) => doc.lines(pts.slice(1).map((q, j) => [(q.x - pts[j].x) * k, -(q.z - pts[j].z) * k]), X(pts[0].x), Y(pts[0].z), [1, 1], style, closed);
  const rgb = (hex: string, mix: number) => [1, 3, 5].map((o) => Math.round(parseInt(hex.slice(o, o + 2), 16) * (1 - mix) + 255 * mix)) as [number, number, number];
  const clip = (q: { x: number; depth: number }): ScenePoint => ({ x: Math.max(-hw, Math.min(hw, q.x)), z: -Math.min(s.depthM, q.depth) });
  doc.setLineWidth(0.15); doc.setDrawColor(150);
  for (const layer of s.layers) { doc.setFillColor(...rgb(layer.color, 0.6)); poly(layerPolygon(s, layer), "FD"); }
  doc.setFontSize(6); doc.setTextColor(70);
  for (const layer of s.layers) doc.text(plain(layer.name), X(hw) - 1, Y(Math.min(layer.topZ, groundHeight(s, hw))) + 2.4, { align: "right" });
  const level = (z: number, text: string, color: [number, number, number], dash: number[]) => {
    if (z > top || z < bottom) return;
    doc.setDrawColor(...color); doc.setLineDashPattern(dash, 0); doc.line(X(-hw), Y(z), X(hw), Y(z)); doc.setLineDashPattern([], 0);
    doc.setTextColor(...color); doc.text(text, X(-hw) - 1, Y(z) + 0.7, { align: "right" });
  };
  level(s.groundZ, `mv ${nl(s.foundationNap + s.groundZ, 2)}`, [60, 60, 60], [0.2, 400]);
  if (Math.abs(s.groundZ) > 0.03 * hw) level(0, `aanleg ${nl(s.foundationNap, 2)}`, [60, 60, 60], [1.2, 0.8]);
  if (s.waterZ < s.groundZ) level(s.waterZ, `gws ${nl(s.foundationNap + s.waterZ, 2)}`, [37, 99, 235], [1.2, 0.8]);
  level(-s.zeM, `ze ${nl(s.foundationNap - s.zeM, 2)}`, [185, 28, 28], [0.4, 0.8]);
  // Maaiveld: horizontaal tot de rand van de voet, daarna aflopend onder beta.
  doc.setDrawColor(30); doc.setLineWidth(0.35);
  poly([{ x: -hw, z: s.groundZ }, { x: s.footing.size[0] / 2, z: s.groundZ }, { x: hw, z: groundHeight(s, hw) }], "S", false);
  // Bezwijkvlak: het maatgevende doorgetrokken, het andere dun en gestreept.
  doc.setDrawColor(185, 28, 28);
  for (const side of [...s.slip].sort((a, b) => Number(a.governing) - Number(b.governing))) {
    doc.setLineWidth(side.governing ? 0.4 : 0.2); doc.setLineDashPattern(side.governing ? [] : [1.4, 0.9], 0);
    poly(side.outline.map(clip), "S");
    if (side.daylight[1].depth < side.daylight[0].depth - 1e-9 && Math.abs(side.daylight[0].x) < hw) { doc.setLineWidth(0.2); doc.setLineDashPattern([0.6, 0.6], 0); poly(side.daylight.map(clip), "S", false); }
  }
  doc.setLineDashPattern([], 0); doc.setLineWidth(0.25); doc.setDrawColor(75, 85, 99); doc.setFillColor(205, 208, 214);
  poly(s.footingProfile, "FD");
  for (const a of s.arrows) {
    if (a.from[1] !== a.to[1]) continue; // een belasting evenwijdig aan L staat loodrecht op de doorsnede
    const color: [number, number, number] = a.kind === "V" ? [29, 78, 216] : a.kind === "H" ? [185, 28, 28] : [17, 24, 39];
    doc.setDrawColor(...color); doc.setFillColor(...color); doc.setTextColor(...color); doc.setLineWidth(0.35);
    const fx = X(a.from[0]), fy = Y(a.from[2]), tx = X(a.to[0]), ty = Y(a.to[2]), len = Math.hypot(tx - fx, ty - fy) || 1, ux = (tx - fx) / len, uy = (ty - fy) / len;
    doc.line(fx, fy, tx - ux * 1.6, ty - uy * 1.6);
    doc.triangle(tx, ty, tx - ux * 1.8 - uy * 0.7, ty - uy * 1.8 + ux * 0.7, tx - ux * 1.8 + uy * 0.7, ty - uy * 1.8 - ux * 0.7, "F");
    doc.text(a.label, fx + (a.kind === "R" ? -1 : 1), fy + (a.kind === "H" ? -0.8 : 1.5), { align: a.kind === "R" ? "right" : "left" });
  }
  doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.2);
  c.y += h + 6;
}

export function buildSpreadReport(i: SpreadInput, r: SpreadResult, ctx: ProjectContext): Uint8Array {
  if (!r.ok) throw new Error(r.error);
  const meta = ctx.projectMeta, f = { ...DEFAULT_FACTORS, ...i.factors }, unit = r.unit, mUnit = r.strip ? "kNm/m" : "kNm";
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = makeCursor(doc, {
    number: meta.project_number || "-", description: meta.title || "Fundering op staal", norm: NORM, date: reportDate(meta.date),
    author: meta.author || "Open Geotechniek Studio", onderdeel: "Fundering op staal",
  });

  sectionTitle(c, `Fundering op staal: ${r.strip ? "strook" : "poer"}`, NORM);
  kv(c, "Afmetingen", r.strip ? `B = ${nl(i.widthM)} m, per strekkende meter` : `B x L = ${nl(i.widthM)} x ${nl(i.lengthM)} m`);
  kv(c, "Niveaus", `aanleg NAP ${nap(i.foundationNap)} m; maaiveld lage zijde NAP ${nap(i.groundNap)} m; grondwater NAP ${nap(i.waterNap)} m`);
  kv(c, "Dekking", `${nl(r.coverM)} m; sigma'v;z;d = ${nl(r.qKpa, 1)} kPa`);
  if (i.slopeDeg > 0 || i.baseTiltDeg > 0) kv(c, "Hellingen", `maaiveld beta = ${nl(i.slopeDeg, 1)} graden; onderkant fundering alpha = ${nl(i.baseTiltDeg, 1)} graden`);
  kv(c, "Belasting (rekenwaarden)", `Vd = ${nl(i.vDKn, 1)} ${unit}; Hd = ${nl(i.hDKn, 1)} ${unit}${r.strip ? "" : ` evenwijdig aan ${i.hDirection}`}, ${nl(i.hArmM)} m boven het funderingsvlak; Md = ${nl(i.momentDKnm, 1)} ${mUnit}`);
  kv(c, "Excentriciteit van Vd", r.strip ? `${nl(i.eccBM, 3)} m` : `${nl(i.eccBM, 3)} m in B en ${nl(i.eccLM, 3)} m in L`);
  kv(c, "Effectief draagvlak", r.strip ? `b' = ${nl(r.dims.bRawM)} m (eB = ${nl(r.dims.eccBM, 3)} m)` : `b' x l' = ${nl(r.dims.bRawM)} x ${nl(r.dims.lRawM)} m (eB = ${nl(r.dims.eccBM, 3)} m, eL = ${nl(r.dims.eccLM, 3)} m)`);
  kv(c, "Afschuiven", `Vd;min = ${nl(i.vMinDKn ?? i.vDKn, 1)} ${unit}; ${i.castInPlace ? "in het werk gestort, delta = phi'd" : "glad of prefab, delta = 2/3 phi'd"}; Rp;d = ${nl(i.passiveDKn, 1)} ${unit}`);
  kv(c, "Materiaalfactoren", `gamma_phi' = ${nl(f.gammaPhi)} (op tan phi'); gamma_c' = ${nl(f.gammaC)}; gamma_cu = ${nl(f.gammaCu)}; gamma_gamma = ${nl(f.gammaGamma)} (tabel A.4a); grondgewicht bij doorponsen ${nl(f.gammaGPunch)}`);

  sectionTitle(c, "Grondlagen (representatieve waarden)");
  table(c, [{ label: "Bovenkant [m NAP]", width: 16, align: "right" }, { label: "Grondsoort", width: 30 }, { label: "gamma [kN/m3]", width: 13, align: "right" }, { label: "gamma;sat [kN/m3]", width: 14, align: "right" },
    { label: "phi' [gr]", width: 11, align: "right" }, { label: "c' [kPa]", width: 11, align: "right" }, { label: "cu [kPa]", width: 11, align: "right" }],
  r.layers.map((l) => [nap(l.topNap), l.name, nl(l.gamma, 1), nl(l.gammaSat, 1), nl(l.phi, 1), nl(l.c, 1), nl(l.cu, 1)]), { size: 7.5 });

  sectionTitle(c, "Overzicht van de toetsen");
  table(c, [{ label: "Toets", width: 60 }, { label: "Belasting", width: 20, align: "right" }, { label: "Weerstand", width: 20, align: "right" }, { label: "u.c.", width: 10, align: "right" }, { label: "Oordeel", width: 16 }],
    r.checks.map((k) => [k.title, `${nl(k.loadKn, k.unit === "m" ? 3 : 1)} ${k.unit}`, `${nl(k.resistanceKn, k.unit === "m" ? 3 : 1)} ${k.unit}`, nl(k.uc, 2), k.passes ? "voldoet" : "voldoet niet"]), { size: 7.5 });
  paragraph(c, `Maatgevend: ${r.governing.title.toLowerCase()}, u.c. ${nl(r.governing.uc, 2)}.${r.overturning ? "" : " De kanteltoets (EQU) is niet uitgevoerd: de representatieve belastingen daarvoor zijn niet ingevuld."}`);
  for (const w of r.warnings) paragraph(c, `Let op: ${plain(w)}`, { italic: true, size: 7.5 });

  const d = r.drained;
  sectionTitle(c, "Invloedsdiepte", "art. 6.5.2.2");
  paragraph(c, d.zeManual ? `De invloedsdiepte is met de hand vastgezet op ze = ${nl(d.zeM)} m.` : `De invloedsdiepte hangt af van phi'gem;rep en Hd/Vd, en het gemiddelde weer van de invloedsdiepte. Begonnen is met ze = 1,5 b'; ${d.converged ? `na ${d.iterations.length} stappen verandert ze niet meer` : `na ${d.iterations.length} stappen is de iteratie NIET geconvergeerd`}: ze = ${nl(d.zeM)} m, tot NAP ${nap(i.foundationNap - d.zeM)} m.`);
  table(c, [{ label: "Stap", width: 8, align: "right" }, { label: "ze aangenomen [m]", width: 18, align: "right" }, { label: "phi'gem;rep [gr]", width: 16, align: "right" }, { label: "phi'gem;d [gr]", width: 16, align: "right" },
    { label: "c'gem;d [kPa]", width: 16, align: "right" }, { label: "gamma'gem;d [kN/m3]", width: 18, align: "right" }, { label: "ze uit tabel [m]", width: 18, align: "right" }],
  d.iterations.map((s) => [String(s.step), nl(s.zeM, 3), nl(s.phiRepDeg, 2), nl(s.phiD, 2), nl(s.cD, 2), nl(s.gammaD, 2), nl(s.zeNextM, 3)]), { size: 7.5 });
  paragraph(c, "Gewogen gemiddelde: het gewicht van een laag is de laagdikte maal de afstand van het laagmidden tot de invloedsdiepte.", { italic: true, size: 7.5 });

  // Het bezwijkmechanisme zoals de doorsnede en de 3D-weergave het tekenen, met dezelfde figuur.
  const scene = spreadScene(i, r), slip = scene.mechanism, m = slip.drained, [near, far] = m.sides;
  sectionTitle(c, "Bezwijkvlak in de tekening", "Prandtl (1920); hellende belasting: Sokolovskii (1960), Brinch Hansen (1961)");
  sectionFigure(c, scene);
  kv(c, "Hoek", `phi'gem;rep = ${nl(slip.phiDeg, 1)} graden; ${m.kind === "circle" ? "cirkelboog" : "logaritmische spiraal r = r0 e^(theta tan phi')"}`);
  if (m.rotationDeg > 0) {
    formula(c, "tan delta", "Hd / (Vd + A' c' cot phi')", null, nl(slip.obliquity, 3));
    formula(c, "alpha", "(Delta + delta) / 2, met sin Delta = sin delta / sin phi'", null, `${nl(m.rotationDeg, 1)} graden`);
  }
  kv(c, "Actieve wig", m.rotationDeg > 0 ? `basishoeken 45 + phi'/2 - alpha = ${nl(m.wedgeAnglesDeg[0], 1)} graden en 45 + phi'/2 + alpha = ${nl(m.wedgeAnglesDeg[1], 1)} graden` : `basishoeken 45 + phi'/2 = ${nl(m.wedgeAnglesDeg[0], 1)} graden`);
  kv(c, "Overgangszone", m.symmetric ? `openingshoek ${nl(near.fanDeg, 1)} graden aan beide kanten` : `openingshoek 90 - alpha - alpha;onderkant - beta = ${nl(near.fanDeg, 1)} graden (maatgevend) en 90 + alpha + alpha;onderkant = ${nl(far.fanDeg, 1)} graden (andere kant)`);
  kv(c, "Passieve wig", `basishoeken 45 - phi'/2 = ${nl(m.passiveDeg, 1)} graden met het maaiveld${i.slopeDeg > 0 ? `; aan de lage zijde ligt hij onder het hellende maaiveld (beta = ${nl(i.slopeDeg, 1)} graden)` : ""}`);
  kv(c, "Afmetingen", m.symmetric ? `${nl(near.maxDepthM)} m diep en ${nl(near.reachM)} m naast b' aan beide kanten` : `maatgevend ${nl(near.maxDepthM)} m diep en ${nl(near.reachM)} m naast b'; andere kant ${nl(far.maxDepthM)} m diep en ${nl(far.reachM)} m naast b'`);
  kv(c, "In de berekening", `invloedsdiepte ze = ${nl(d.zeM)} m en invloedsbreedte ae = ${nl(d.aeM)} m, uit de tabel`);
  if (slip.undrained) kv(c, "Ongedraineerd", `cirkelboog${slip.undrained.rotationDeg > 0 ? `, alpha = ${nl(slip.undrained.rotationDeg, 1)} graden uit sin 2 alpha = Hd / (A' cu;d) = ${nl(slip.undrainedRatio, 3)}` : ""}; ${nl(slip.undrained.maxDepthM)} m diep en ${nl(slip.undrained.reachM)} m naast b'`);
  paragraph(c, plain(slipExplanation(i, m)).replace(/°/g, " graden"), { size: 7.5 });
  paragraph(c, m.symmetric
    ? "Het vlak is het glijlijnenveld van Prandtl voor een strook op gewichtsloze grond; bij verticale belasting valt het samen met de invloedsdiepte en -breedte uit de tabel."
    : "Het vlak is het glijlijnenveld van de strook op gewichtsloze grond; een hellende belasting, een hellend maaiveld en een hellende onderkant verkleinen de openingshoek van de overgangszone aan de maatgevende kant. De invloedsdiepte ze waarover de grondparameters zijn gemiddeld, komt uit de tabel van de norm (lineair in Hd/Vd) en hoeft niet gelijk te zijn aan de diepte van dit vlak.", { italic: true, size: 7.5 });

  for (const k of r.checks) {
    sectionTitle(c, k.title, k.article.startsWith("art.") ? `NEN 9997-1 ${k.article}` : k.article);
    if (k.rows) table(c, [{ label: "Van [m NAP]", width: 13, align: "right" }, { label: "Tot [m NAP]", width: 13, align: "right" }, { label: "Laag", width: 30 }, { label: "h [m]", width: 9, align: "right" }, { label: "z [m]", width: 9, align: "right" },
      { label: "phi'd [gr]", width: 11, align: "right" }, { label: "c'd [kPa]", width: 11, align: "right" }, { label: "gamma'd [kN/m3]", width: 14, align: "right" }],
    k.rows.map((w) => [nap(w.topNap), nap(w.bottomNap), `${w.name}${w.submerged ? " (nat)" : ""}`, nl(w.thicknessM, 2), nl(w.zM, 2), nl(w.phiD, 2), nl(w.cD, 2), nl(w.gammaD, 2)]), { size: 7 });
    for (const s of k.steps) formula(c, plain(s.symbol), plain(s.formula), s.filled ? plain(s.filled) : null, plain(s.result));
  }
  paragraph(c, "Zettingen, algehele stabiliteit, zijdelings wegpersen en het ontwerp van de betonvoet zijn geen onderdeel van deze berekening.", { italic: true, size: 7.5 });

  if (typeof doc.putTotalPages === "function") doc.putTotalPages(TOTAL_PAGES_TOKEN);
  return new Uint8Array(doc.output("arraybuffer"));
}
