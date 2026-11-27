// Eerste pagina van het PDF-rapport horizontale paal: het rekenconcept in
// gewone taal. Een volle pagina als de berekening niet-lineair rekent of de
// laagcorrectie gebruikt; bij een zuiver lineaire berekening één alinea.
// Hier staat alleen wat de rekenkern werkelijk doet (nonlinear-beam.ts,
// nonlinear-soil.ts; zie NONLINEAR-SOIL.md).
import type { LateralInput, LateralResult } from './compute';
import { soilColor } from './report-data';
import { M, formula, kv, nl, paragraph, sectionTitle, winAnsi, type Cursor } from '../pile-bearing-capacity/parts/pile-report-pdf';

type Ok = Extract<LateralResult, { ok: true }>;

/** Volle pagina nodig: niet-lineaire veren of laagcorrectie. */
export const needsMethodPage = (input: LateralInput, r: Ok) => r.analysisMode === 'nonlinear' || input.layerCorrection === 'georgiadis';

const BEAM_TEXT = 'De paal is een buigligger op veren haaks op de paal. Elke grondlaag heeft een veer met stijfheid k0 = kh x werkende breedte. Uit het evenwicht volgen verplaatsing, moment, dwarskracht en grondreactie; de normaalkracht telt alleen mee in de toets van de doorsnede.';
const SIZE = 7.8;

function label(c: Cursor, text: string, x: number, y: number, align: 'left' | 'right' | 'center' = 'left', size = 7) {
  c.doc.setFont('helvetica', 'normal'); c.doc.setFontSize(size); c.doc.setTextColor(60);
  c.doc.text(winAnsi(text), x, y, { align }); c.doc.setTextColor(0);
}
/** Regels rechts naast een figuur: het eerste deel vet als naam, de formule erachter. */
function notes(c: Cursor, x: number, y: number, rows: Array<[string, string]>) {
  rows.forEach(([name, text], i) => {
    c.doc.setFont('helvetica', 'bold'); c.doc.setFontSize(7.5); c.doc.setTextColor(0); c.doc.text(winAnsi(name), x, y + i * 4.4);
    c.doc.setFont('helvetica', 'normal'); c.doc.text(winAnsi(text), x + 27, y + i * 4.4);
  });
}
const dashed = (c: Cursor, on: boolean) => c.doc.setLineDashPattern(on ? [1.2, 1] : [], 0);

/** p-y-curve van één veer als vectorfiguur: beginstijfheid k0 en grenswaarde pu. */
function pyFigure(c: Cursor) {
  const h = 31; c.reserve(h + 2);
  const x0 = M.left + 12, y0 = c.y + h - 6, w = 56, ph = 18, doc = c.doc;
  doc.setDrawColor(90); doc.setLineWidth(0.25); dashed(c, false);
  doc.line(x0, y0, x0 + w + 4, y0); doc.line(x0, y0, x0, y0 - ph - 5);
  // Grenswaarde pu en de raaklijn k0 in de oorsprong (bereikt pu bij y = pu / k0).
  dashed(c, true); doc.setDrawColor(130);
  doc.line(x0, y0 - ph, x0 + w, y0 - ph); doc.line(x0, y0, x0 + w / 3 * 1.15, y0 - ph * 1.15); doc.line(x0 + w / 3, y0, x0 + w / 3, y0 - ph);
  dashed(c, false); doc.setDrawColor(180, 83, 9); doc.setLineWidth(0.55);
  let px = x0, py = y0;
  for (let i = 1; i <= 60; i++) { const t = 3 * i / 60, nx = x0 + w * t / 3, ny = y0 - ph * Math.tanh(t); doc.line(px, py, nx, ny); px = nx; py = ny; }
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  label(c, 'grondreactie p', x0 - 2, y0 - ph - 6);
  label(c, 'verplaatsing y', x0 + w + 4, y0 + 3.3, 'right');
  label(c, 'pu', x0 - 1.5, y0 - ph + 1, 'right');
  label(c, 'grenswaarde pu', x0 + w, y0 - ph - 1.1, 'right');
  label(c, 'helling in de oorsprong =', x0 + w * .34, y0 - ph * .36);
  label(c, 'beginstijfheid k0', x0 + w * .34, y0 - ph * .36 + 3);
  label(c, 'pu / k0', x0 + w / 3, y0 + 3.3, 'center');
  notes(c, x0 + w + 12, y0 - ph - 1, [
    ['Figuur', 'p-y-curve van een veer, gelijk in beide richtingen'],
    ['Veerwet', 'p = pu x tanh(k0 x y / pu)   [kN/m]'],
    ['Beginstijfheid', 'k0 = kh x werkende breedte   [kN/m2]'],
    ['Grenswaarde', 'pu(z) = min(pu,max ; pu,0 + g x z)   [kN/m]'],
    ['Klein / groot', 'p = k0 x y bij kleine y; p nadert pu bij grote y'],
  ]);
  c.y += h + 1;
}

/** Schets van twee lagen: links de werkelijke opbouw, rechts de onderste laag als homogeen profiel. */
function layerFigure(c: Cursor, input: LateralInput) {
  const h = 34; c.reserve(h + 2);
  const doc = c.doc, top = c.y + 6, colW = 26, x1 = M.left + 4, x2 = x1 + colW + 8, h1 = 10, h2 = 15, zeq = 6;
  const sorted = [...input.layers].sort((a, b) => a.topM - b.topM), ca = soilColor(sorted[0].springId).rgb, cb = soilColor((sorted[1] ?? sorted[0]).springId).rgb;
  doc.setLineWidth(0.25); doc.setDrawColor(90); dashed(c, false);
  doc.setFillColor(ca[0], ca[1], ca[2]); doc.rect(x1, top, colW, h1, 'FD');
  doc.setFillColor(cb[0], cb[1], cb[2]); doc.rect(x1, top + h1, colW, h2, 'FD');
  // Rechts: het profiel van laag 2 vanaf zijn eigen oorsprong; het bovenste stuk vervangt laag 1.
  doc.rect(x2, top + h1 - zeq, colW, zeq + h2, 'FD');
  dashed(c, true); doc.line(x1 + colW, top + h1, x2 + colW, top + h1); dashed(c, false);
  doc.setFillColor(120, 120, 120); doc.rect(x1 + colW - 5, top - 2, 1.6, h1 + h2 + 2, 'F'); doc.rect(x2 + colW - 5, top + h1 - zeq - 2, 1.6, zeq + h2 + 2, 'F');
  doc.setDrawColor(0); doc.setLineWidth(0.2);
  label(c, 'werkelijk', x1 + colW / 2, top - 3.2, 'center');
  label(c, 'laag 2 homogeen', x2 + colW / 2, top + h1 - zeq - 3.2, 'center');
  label(c, 'laag 1: F1', x1 + 1.5, top + 4);
  label(c, 'laag 2', x1 + 1.5, top + h1 + 4);
  label(c, 'zelfde F1', x2 + 1.5, top + h1 - zeq + 3.8);
  label(c, 'laag 2', x2 + 1.5, top + h1 + 4);
  // Maatlijn van de equivalente diepte.
  const xm = x2 + colW + 2.5; doc.line(xm, top + h1 - zeq, xm, top + h1); doc.line(xm - 1, top + h1 - zeq, xm + 1, top + h1 - zeq); doc.line(xm - 1, top + h1, xm + 1, top + h1);
  label(c, 'zeq,top', xm + 1.5, top + h1 - zeq / 2 + 1);
  notes(c, xm + 14, top + 1, [
    ['Figuur', 'equivalente diepte: het bovenste stuk van het homogene'],
    ['', 'profiel levert dezelfde grensweerstand F1 als de bovenlaag'],
    ['Bovenkant laag i', 'integraal van 0 tot zeq,top,i van pu,i(z) dz = F(i-1)'],
    ['F(i-1)', 'som van de integralen van pu over de lagen erboven,'],
    ['', 'elk over zijn eigen equivalente diepten'],
    ['Binnen laag i', 'zeq = zeq,top,i + (z - bovenkant laag i);  pu = pu,i(zeq)'],
  ]);
  c.y += h;
}

/**
 * Rekenconcept vooraan in het rapport. Geeft true als er een volle pagina is
 * gemaakt (de berekening begint dan op een nieuwe pagina).
 */
export function renderMethod(c: Cursor, input: LateralInput, r: Ok): boolean {
  if (!needsMethodPage(input, r)) {
    sectionTitle(c, 'Rekenconcept: ligger op veren');
    paragraph(c, `${BEAM_TEXT} De veren zijn lineair: p = k0 x y, zonder grenswaarde.`);
    c.y += 2;
    return false;
  }
  const nonlinear = r.analysisMode === 'nonlinear', georgiadis = input.layerCorrection === 'georgiadis';
  const text = (value: string) => paragraph(c, value, { size: SIZE });
  sectionTitle(c, 'Rekenconcept', nonlinear ? 'Ligger op niet-lineaire grondveren' : 'Ligger op grondveren met laagcorrectie');

  sectionTitle(c, 'Paal als ligger op veren');
  text(BEAM_TEXT);

  if (nonlinear) {
    sectionTitle(c, 'Waarom de veer niet-lineair is');
    text('De grondreactie p loopt bij toenemende verplaatsing steeds langzamer op en nadert de grenswaarde pu van de laag. De kracht verhuist dan naar dieper gelegen veren; verplaatsing en moment worden groter dan bij lineaire veren.');
    pyFigure(c);

    sectionTitle(c, 'Hoe het evenwicht wordt gevonden');
    text(`De belasting wordt in stappen opgebracht; per stap Newton-Raphson met de raaklijnstijfheid van elke veer, tot de onbalans kleiner is dan een tienmiljoenste van de belasting. Zonder evenwicht volgt een foutmelding. Deze berekening: ${r.convergence.loadSteps} belastingstappen, ${r.convergence.iterations} iteraties, ${r.beam.elements.length} elementen met elk vier veerpunten, resterende onbalans ${r.convergence.residualKn.toExponential(1)} kN.`);
  }

  sectionTitle(c, 'Gelaagde grond: equivalente diepte');
  if (georgiadis) {
    text(`De grenswaarde pu van een laag is ingevoerd als profiel vanaf maaiveld. Onder een andere laag rekent de laagcorrectie (Georgiadis) met een equivalente diepte: de diepte waarbij het homogene profiel van die laag dezelfde grensweerstand F geeft als alle lagen erboven samen. De beginstijfheid k0 wordt niet aangepast.${nonlinear ? '' : ' Deze berekening is lineair: de laagcorrectie verandert de uitkomst niet.'}`);
    layerFigure(c, input);
    const order = input.layers.map((l, k) => ({ l, k })).sort((a, b) => a.l.topM - b.l.topM);
    if (order.length > 1) {
      const above = r.layering[order[0].k], own = r.layering[order[1].k], n = order[1].k + 1;
      formula(c, `zeq,top laag ${n}`, `oplossing van  int(0..zeq) pu,${n}(z) dz = F`, `F = ${nl(above.cumulativeUltimateKn, 1)} kN`, `${nl(own.topEquivalentM, 2)} m`);
    } else kv(c, 'Deze berekening', 'een laag: de equivalente diepte is gelijk aan de werkelijke diepte');
  } else {
    text('Er is geen laagcorrectie toegepast: pu volgt uit de werkelijke diepte vanaf de bovenkant van de eerste grondlaag.');
  }

  sectionTitle(c, 'Controle en bronnen');
  text('Het rekenhart is nagerekend tegen gesloten oplossingen, een onafhankelijke differentieoplossing en gepubliceerde voorbeelden; zie VERIFICATIE.md bij de module.');
  for (const source of [
    'Hetenyi, M. (1946). Beams on Elastic Foundation. University of Michigan Press. (ligger op veren)',
    'CUR (2008). CUR-publicatie 166, Damwandconstructies, deel 1, tabel 3.3. (beddingsconstanten kh)',
    'Georgiadis, M. (1983). Development of p-y Curves for Layered Soils. Geotechnical Practice in Offshore Engineering, ASCE, 536-545.',
    'Matlock, H. en Reese, L.C. (1960). Generalized Solutions for Laterally Loaded Piles. J. Soil Mech. Found. Div., ASCE, 86(SM5). (controle)',
    'Broms, B.B. (1964). Lateral Resistance of Piles in Cohesive Soils; idem in Cohesionless Soils. J. Soil Mech. Found. Div., ASCE, 90(SM2), 90(SM3). (controle)',
  ]) paragraph(c, source, { size: 7, indent: 2 });
  paragraph(c, 'De veerwet met hyperbolische tangens en het afgetopte lineaire pu-profiel zijn projectaannames, statisch en zonder wisselbelasting; de parameters vragen een onderbouwing per project.', { italic: true, size: 7 });
  c.newPage();
  return true;
}
