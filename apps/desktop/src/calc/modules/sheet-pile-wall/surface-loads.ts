// Belastingen op afstand van de wand en een maaiveld dat niet vlak is, als extra verticale spanning langs de wand.
//
// Gangbare benadering: de verticale spanning onder een strook- of lijnlast volgt uit de elastische oplossing van
// Boussinesq voor een halfruimte (strook: Jürgenson 1934; lijnlast: Flamant 1892; beide in Poulos en Davis 1974,
// "Elastic solutions for soil and rock mechanics"). De wand is een starre, gladde rand: de last wordt gespiegeld in het
// vlak van de wand, zodat een last die tot aan de wand en oneindig ver doorloopt precies de gelijkmatige bovenbelasting
// geeft. De extra verticale spanning telt in σ′v, en daarmee in de actieve, neutrale en passieve gronddruk.
//
// Een talud of hellend maaiveld is de grond boven (of het ontbreken van grond onder) het maaiveld bij de wand: per stuk
// een strooklast γ·Δh, met γ van de bovenste laag (boven water γ, eronder γsat − γw). Dat is een schematisering; een
// glijvlakberekening met het werkelijke maaiveld (zoals Culmann) zit niet in dit rekenblad. Voor een talud dat
// onbeperkt doorloopt is deze benadering niet bedoeld: het profiel eindigt op een vast niveau.

/** Punt van het maaiveld: afstand tot de wand [m] en hoogte ten opzichte van het maaiveld bij de wand [m, omhoog positief]. */
export interface SurfacePoint { xM: number; dzM: number }

/** Strooklast q [kPa] van `fromM` tot `toM` uit de wand (toM = Infinity: onbeperkt), of lijnlast evenwijdig aan de wand P [kN/m] op `fromM`. */
export interface SurfaceLoad {
  id?: string;
  name?: string;
  side: "high" | "low";
  kind: "strip" | "line";
  /** Strook: q [kPa]; lijnlast: P [kN/m]. Representatief; de factor op de bovenbelasting geldt ook hiervoor. */
  value: number;
  fromM: number;
  toM: number;
}

/** Strook met een gelijkmatige last, als bijdrage aan de verticale spanning. */
export interface Strip { q: number; x1: number; x2: number }
export interface LineLoad { p: number; x: number }

/** Verticale spanning op diepte z recht onder de rand van de halfruimte (x = 0) door een strook van x1 tot x2, zonder spiegeling. */
export function stripStress(q: number, x1: number, x2: number, z: number): number {
  if (!(z > 0)) return x1 <= 1e-12 && x2 > 0 ? q / 2 : 0;
  const t = (x: number) => (Number.isFinite(x) ? Math.atan(x / z) : Math.PI / 2);
  const a = t(x1), b = t(x2);
  return (q / Math.PI) * (b - a + Math.sin(b) * Math.cos(b) - Math.sin(a) * Math.cos(a));
}

/** Verticale spanning op diepte z onder x = 0 door een lijnlast P op afstand x, zonder spiegeling: 2·P·z³ / (π·(x² + z²)²). */
export function lineStress(p: number, x: number, z: number): number {
  if (!(z > 0)) return 0;
  return (2 * p * z ** 3) / (Math.PI * (x * x + z * z) ** 2);
}

/** Extra verticale spanning langs de wand op diepte z onder het maaiveld bij de wand, met de last gespiegeld in de wand. */
export function extraVerticalStress(strips: Strip[], lines: LineLoad[], z: number): number {
  return 2 * strips.reduce((sum, s) => sum + stripStress(s.q, s.x1, s.x2, z), 0) + 2 * lines.reduce((sum, l) => sum + lineStress(l.p, l.x, z), 0);
}

/**
 * Het maaiveld als strooklasten: stukjes van hooguit `step` m met de gemiddelde hoogte, en voorbij het laatste punt een
 * strook tot oneindig met de laatste hoogte. `gammaAt(dz)` geeft het volumegewicht voor de grond op hoogte dz.
 */
export function profileStrips(points: SurfacePoint[], gammaAt: (dzM: number) => number, step = 0.25): Strip[] {
  const pts = [{ xM: 0, dzM: 0 }, ...points.filter((p) => p.xM > 1e-9 && Number.isFinite(p.xM) && Number.isFinite(p.dzM)).sort((a, b) => a.xM - b.xM)];
  if (pts.length < 2) return [];
  const out: Strip[] = [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], parts = Math.max(1, Math.ceil((b.xM - a.xM) / step - 1e-9));
    for (let j = 0; j < parts; j++) {
      const x1 = a.xM + ((b.xM - a.xM) * j) / parts, x2 = a.xM + ((b.xM - a.xM) * (j + 1)) / parts, dz = a.dzM + ((b.dzM - a.dzM) * (j + 0.5)) / parts;
      if (Math.abs(dz) > 1e-9) out.push({ q: gammaAt(dz) * dz, x1, x2 });
    }
  }
  const last = pts[pts.length - 1];
  if (Math.abs(last.dzM) > 1e-9) out.push({ q: gammaAt(last.dzM) * last.dzM, x1: last.xM, x2: Infinity });
  return out;
}
