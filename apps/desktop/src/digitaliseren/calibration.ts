// IJking van een onderlegger: van een pixel op de scan naar diepte en meetwaarde.
//
// De gebruiker klikt twee punten op de diepte-as en twee op de waarde-as, elk met hun waarde. De
// afbeelding is affien: de diepte verandert niet langs de richting van de waarde-as en de waarde
// verandert niet langs de richting van de diepte-as. Daardoor klopt de ijking ook als de scan
// scheef ligt of de assen niet precies haaks staan; de assen worden los van elkaar geijkt.

export interface Px { x: number; y: number }

/** Twee punten op één as met hun waarde. */
export interface AxisRef { a: Px; b: Px; va: number; vb: number }

export interface Calibration {
  /** Diepte-as: waarden in m onder maaiveld of in m NAP. */
  depth: AxisRef;
  /** Waarde-as: qc of fs in MPa, of Rf in %. */
  value: AxisRef;
}

/** waarde = vx·x + vy·y + v0 en diepte = dx·x + dy·y + d0. */
export interface Affine { vx: number; vy: number; v0: number; dx: number; dy: number; d0: number }

export type CalibrationProblem = "depthPoints" | "valuePoints" | "depthValues" | "valueValues" | "parallel";

const cross = (a: Px, b: Px) => a.x * b.y - a.y * b.x;
const sub = (a: Px, b: Px): Px => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Px) => Math.hypot(a.x, a.y);

/** Kleinste hoek tussen de twee assen waarbij de ijking nog betrouwbaar is (sinus; ongeveer 6 graden). */
const MIN_SIN = 0.1;
/** Twee ijkpunten op één as moeten uit elkaar liggen (pixels). */
const MIN_DISTANCE = 2;

/** Waarom de ijking niet bruikbaar is, of `null` als zij klopt. */
export function calibrationProblem(c: Calibration): CalibrationProblem | null {
  const uD = sub(c.depth.b, c.depth.a), uV = sub(c.value.b, c.value.a);
  // Een ontbrekend punt geeft hier NaN en valt dus ook af.
  if (!(len(uD) >= MIN_DISTANCE)) return "depthPoints";
  if (!(len(uV) >= MIN_DISTANCE)) return "valuePoints";
  if (!Number.isFinite(c.depth.va) || !Number.isFinite(c.depth.vb) || c.depth.va === c.depth.vb) return "depthValues";
  if (!Number.isFinite(c.value.va) || !Number.isFinite(c.value.vb) || c.value.va === c.value.vb) return "valueValues";
  if (Math.abs(cross(uD, uV)) / (len(uD) * len(uV)) < MIN_SIN) return "parallel";
  return null;
}

/** De affiene afbeelding uit de vier ijkpunten; `null` als de ijking niet bruikbaar is. */
export function solveCalibration(c: Calibration): Affine | null {
  if (calibrationProblem(c)) return null;
  const uD = sub(c.depth.b, c.depth.a), uV = sub(c.value.b, c.value.a);
  // diepte(p) = va + (vb - va) · cross(p - Da, uV) / cross(uD, uV): constant langs de waarde-as.
  const kd = (c.depth.vb - c.depth.va) / cross(uD, uV);
  // waarde(p) = va + (vb - va) · cross(p - Va, uD) / cross(uV, uD): constant langs de diepte-as.
  const kv = (c.value.vb - c.value.va) / cross(uV, uD);
  return {
    dx: kd * uV.y, dy: -kd * uV.x, d0: c.depth.va - kd * cross(c.depth.a, uV),
    vx: kv * uD.y, vy: -kv * uD.x, v0: c.value.va - kv * cross(c.value.a, uD),
  };
}

/** Pixel naar waarde en diepte (de diepte in de eenheid van de as: m onder maaiveld of m NAP). */
export function toValues(m: Affine, p: Px): { value: number; depth: number } {
  return { value: m.vx * p.x + m.vy * p.y + m.v0, depth: m.dx * p.x + m.dy * p.y + m.d0 };
}

/** Waarde en diepte terug naar een pixel, voor het tekenen van het raster en de lijn. */
export function toPixel(m: Affine, value: number, depth: number): Px {
  const det = m.vx * m.dy - m.vy * m.dx;
  const v = value - m.v0, d = depth - m.d0;
  return { x: (v * m.dy - m.vy * d) / det, y: (m.vx * d - v * m.dx) / det };
}

/** Ronde stap (1, 2 of 5 maal een macht van tien) waarmee een bereik in hooguit `maxLines` delen valt. */
export function niceStep(range: number, maxLines: number): number {
  if (!(range > 0) || maxLines < 1) return 1;
  const raw = range / maxLines, pow = 10 ** Math.floor(Math.log10(raw));
  for (const f of [1, 2, 5, 10]) if (f * pow >= raw * (1 - 1e-9)) return f * pow;
  return 10 * pow;
}

export interface GridLine { from: Px; to: Px; label: string; at: Px }
export interface Grid { depth: GridLine[]; value: GridLine[] }

const tidy = (v: number, step: number) => {
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(decimals, 4)).replace(".", ",");
};

/**
 * Rasterlijnen over de hele onderlegger: lijnen van gelijke diepte en van gelijke waarde, met het
 * getal op de plek waar de lijn de bijbehorende as snijdt. Zo is te zien of de ijking klopt.
 */
export function calibrationGrid(m: Affine, c: Calibration, width: number, height: number, maxLines = 24): Grid {
  const corners = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: 0, y: height }, { x: width, y: height }].map((p) => toValues(m, p));
  const range = (pick: (r: { value: number; depth: number }) => number) => {
    const values = corners.map(pick);
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const [d0, d1] = range((r) => r.depth), [v0, v1] = range((r) => r.value);
  const dStep = niceStep(d1 - d0, maxLines), vStep = niceStep(v1 - v0, maxLines);
  // De assen zelf: de waarde op de diepte-as en de diepte op de waarde-as.
  const axisValue = toValues(m, c.depth.a).value, axisDepth = toValues(m, c.value.a).depth;
  const lines = (lo: number, hi: number, step: number, make: (v: number) => GridLine): GridLine[] => {
    const out: GridLine[] = [];
    for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + step * 1e-9 && out.length < maxLines * 2; i++) out.push(make(i * step));
    return out;
  };
  return {
    depth: lines(d0, d1, dStep, (d) => ({ from: toPixel(m, v0, d), to: toPixel(m, v1, d), label: tidy(d, dStep), at: toPixel(m, axisValue, d) })),
    value: lines(v0, v1, vStep, (v) => ({ from: toPixel(m, v, d0), to: toPixel(m, v, d1), label: tidy(v, vStep), at: toPixel(m, v, axisDepth) })),
  };
}
