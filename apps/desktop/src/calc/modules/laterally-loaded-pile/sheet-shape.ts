// Hartlijn van een damwandprofiel voor de doorsnedetekening en het 3D-beeld.
// De bibliotheek geeft de plankbreedte b en de wandhoogte h, niet de flensbreedte
// en de lijfhoek: de vorm is daarom schematisch, met de juiste breedte, hoogte en de
// plaats van de sloten per profielvorm. De flensbreedte komt uit de gedeelde contour
// (library/sheetPileContour.ts): afgeleid uit A en I van de tabel als die er zijn,
// anders 40 % van de plankbreedte. Zo is het profiel overal hetzelfde.
// Heeft de bibliotheek de exacte contour uit de CAD-tekening van de fabrikant, dan komen daar ook de
// omtrekken van de planken bij (`plates`), op dezelfde plaats als de hartlijn.
import type { SheetPileProfile } from '../../library/sheetPiles';
import { sheetContour, sheetGeometry, type ContourBasis } from '../../library/sheetPileContour';

export interface SheetOutline {
  /** Hartlijn in mm: x langs de wand, y in de buigrichting; gecentreerd op 0. */
  points: Array<{ x: number; y: number }>;
  /** Plaats van de sloten. */
  locks: Array<{ x: number; y: number }>;
  widthMm: number; heightMm: number; planks: number;
  /** Waar de vorm vandaan komt; bij "drawing" de omtrekken van de planken uit de fabriekstekening [mm]. */
  basis: ContourBasis;
  plates: Array<Array<{ x: number; y: number }>>;
}

export function sheetOutline(p: Pick<SheetPileProfile, 'shape' | 'widthMm' | 'wallHeightMm'> & Partial<Pick<SheetPileProfile, 'id' | 'manufacturer' | 'flangeMm' | 'webMm' | 'areaCm2PerM' | 'iCm4PerM' | 'flangeWidthMm'>>, mode: 'wall' | 'single'): SheetOutline {
  // Aandeel van de flens in de plankbreedte: bij Z de twee halve flenzen samen.
  const fl = sheetGeometry(p).flangeMm / (p.widthMm ?? 500);
  const b = p.widthMm ?? 500, h = p.shape === 'straight' ? 0 : p.wallHeightMm ?? 0, a = h / 2;
  // Per m wand: twee planken, zodat het golfpatroon van de wand zichtbaar is.
  const planks = mode === 'single' ? 1 : 2, pts: SheetOutline['points'] = [], locks: SheetOutline['locks'] = [];
  const add = (x: number, y: number) => { const last = pts[pts.length - 1]; if (!last || Math.abs(last.x - x) > 1e-9 || Math.abs(last.y - y) > 1e-9) pts.push({ x, y }); };
  for (let k = 0; k < planks; k++) {
    const x0 = k * b, s = k % 2 ? -1 : 1;
    if (p.shape === 'Z') {
      // Z-plank: van het midden van de ene flens via het schuine lijf naar het midden van de andere; sloten in de flenzen.
      add(x0, s * a); add(x0 + fl / 2 * b, s * a); add(x0 + (1 - fl / 2) * b, -s * a); add(x0 + b, -s * a);
      locks.push({ x: x0, y: s * a }); if (k === planks - 1) locks.push({ x: x0 + b, y: -s * a });
    } else if (p.shape === 'hat') {
      add(x0, -a); add(x0 + .15 * b, -a); add(x0 + .3 * b, a); add(x0 + .7 * b, a); add(x0 + .85 * b, -a); add(x0 + b, -a);
      locks.push({ x: x0, y: -a }); if (k === planks - 1) locks.push({ x: x0 + b, y: -a });
    } else {
      // U-plank (en vlak profiel met a = 0): sloten op de neutrale lijn van de wand, de flens om en om aan weerszijden.
      add(x0, 0); add(x0 + (1 - fl) / 2 * b, s * a); add(x0 + (1 + fl) / 2 * b, s * a); add(x0 + b, 0);
      locks.push({ x: x0, y: 0 }); if (k === planks - 1) locks.push({ x: x0 + b, y: 0 });
    }
  }
  const width = planks * b, ys = pts.map((q) => q.y), yMid = (Math.max(...ys) + Math.min(...ys)) / 2;
  const centre = (q: { x: number; y: number }) => ({ x: q.x - width / 2, y: q.y - yMid });
  const base = { points: pts.map(centre), locks: locks.map(centre), widthMm: width, heightMm: Math.max(...ys) - Math.min(...ys), planks };
  const exact = sheetContour(p, planks);
  if (exact.geometry.basis !== 'drawing') return { ...base, basis: exact.geometry.basis, plates: [] };
  // Exacte contour: zo gespiegeld dat hij bij de hartlijn hierboven past, en net zo om het midden gelegd.
  const plain = sheetContour(p, planks, { exact: false }), agree = plain.centerlines.flat().reduce((sum, q, k) => sum + q.y * exact.centerlines.flat()[k].y, 0);
  const flip = agree < 0 ? -1 : 1, py = exact.plates.flat().map((q) => flip * q.y), mid = (Math.max(...py) + Math.min(...py)) / 2;
  return { ...base, heightMm: Math.max(...py) - Math.min(...py), basis: 'drawing', plates: exact.plates.map((poly) => poly.map((q) => ({ x: q.x - width / 2, y: flip * q.y - mid }))) };
}

