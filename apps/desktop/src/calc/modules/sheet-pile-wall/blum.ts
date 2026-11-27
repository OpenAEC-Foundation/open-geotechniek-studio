// Klassieke evenwichtsberekening volgens Blum, als controle naast het verenmodel.
//
// Uitgangspunt is de resulterende belasting op de wand als de hoge zijde overal actief is en de lage zijde
// overal passief: p(z) = σ'a;hoog + u;hoog − σ'p;laag − u;laag. Die lijn wordt numeriek geïntegreerd, zodat
// gelaagde grond, water en cohesie zonder aparte formules meedoen.
//
//  - Onverankerd: de wand is ingeklemd in de grond. Het theoretische voetpunt ligt waar het moment van alle
//    belasting erboven nul is; de vervangende kracht van Blum grijpt daar aan.
//  - Verankerd, vrij opgelegde voet: momentenevenwicht om het anker geeft de inheidiepte, horizontaal evenwicht
//    de ankerkracht.
//  - Verankerd, ingeklemde voet (Blum): de wand is ingeklemd in het theoretische voetpunt en verplaatst niet
//    bij het anker; het voetpunt ligt waar het moment nul is.
// Bij een ingeklemde voet komt er 20 % bij de lengte onder het belastingnulpunt (t = u + 1,2·x).
//
// z omlaag vanaf de bovenkant van de wand, alles per strekkende meter wand.

export interface BlumCase {
  /** Diepte van het belastingnulpunt onder de bovenkant van de wand [m]. */
  zeroLoadM: number;
  /** Theoretisch voetpunt [m]. */
  theoreticalToeM: number;
  /** Benodigde teendiepte [m], inclusief de toeslag bij een ingeklemde voet. */
  requiredToeM: number;
  maxMomentKnM: number;
  maxMomentAtM: number;
  maxShearKn: number;
  /** Horizontale ankerkracht [kN/m]; 0 zonder anker. */
  anchorKn: number;
  /** Vervangende kracht in het voetpunt [kN/m]; 0 bij een vrij opgelegde voet. */
  toeForceKn: number;
}

export interface BlumResult {
  /** Stap van het rekenraster [m]. */
  stepM: number;
  cantilever: BlumCase | null;
  free: BlumCase | null;
  fixed: BlumCase | null;
}

/**
 * @param net resulterende belasting op diepte z [kPa], positief naar de lage zijde
 * @param excavationM diepte van de ontgraving onder de bovenkant van de wand
 * @param anchorM diepte van het anker, of null zonder anker
 * @param maxDepthM tot hoe diep een voetpunt wordt gezocht
 */
export function blum(net: (zM: number) => number, excavationM: number, anchorM: number | null, maxDepthM: number, stepM = 0.01): BlumResult {
  const n = Math.max(2, Math.ceil(maxDepthM / stepM)), dz = maxDepthM / n;
  const z = Array.from({ length: n + 1 }, (_, i) => i * dz), p = z.map(net);
  // Q = ∫p dz en M = ∫Q dz met de trapeziumregel; M(z) is het moment in de doorsnede van alle belasting erboven.
  const q = new Float64Array(n + 1), m = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { q[i] = q[i - 1] + ((p[i - 1] + p[i]) / 2) * dz; m[i] = m[i - 1] + ((q[i - 1] + q[i]) / 2) * dz + ((p[i - 1] - p[i]) * dz * dz) / 12; }
  const start = Math.min(n, Math.max(1, Math.ceil(excavationM / dz - 1e-9)));
  let zero = start;
  while (zero < n && p[zero] > 0) zero++;
  // Lineair geïnterpoleerd nulpunt van f tussen i−1 en i.
  const crossing = (f: (i: number) => number, from: number): { i: number; t: number } | null => {
    let prev = f(from);
    for (let i = from + 1; i <= n; i++) { const cur = f(i); if (prev > 0 && cur <= 0) return { i, t: prev / (prev - cur) }; prev = cur; }
    return null;
  };
  const at = (arr: ArrayLike<number>, c: { i: number; t: number }) => arr[c.i - 1] + c.t * (arr[c.i] - arr[c.i - 1]);
  const zeroLoadM = zero > start && p[zero - 1] > 0 ? z[zero - 1] + (p[zero - 1] / (p[zero - 1] - p[zero])) * dz : z[zero];
  const extremes = (moment: (i: number) => number, shear: (i: number) => number, to: number) => {
    let mMax = 0, mAt = 0, vMax = 0;
    for (let i = 0; i <= to; i++) { const mv = Math.abs(moment(i)); if (mv > mMax) { mMax = mv; mAt = z[i]; } vMax = Math.max(vMax, Math.abs(shear(i))); }
    return { maxMomentKnM: mMax, maxMomentAtM: mAt, maxShearKn: vMax };
  };
  const withMargin = (toe: number) => zeroLoadM + 1.2 * Math.max(0, toe - zeroLoadM);

  let cantilever: BlumCase | null = null, free: BlumCase | null = null, fixed: BlumCase | null = null;
  const c0 = crossing((i) => m[i], zero);
  if (c0 && anchorM === null) {
    const toe = z[c0.i - 1] + c0.t * dz;
    cantilever = { zeroLoadM, theoreticalToeM: toe, requiredToeM: withMargin(toe), anchorKn: 0, toeForceKn: Math.abs(at(q, c0)), ...extremes((i) => m[i], (i) => q[i], c0.i) };
  }
  if (anchorM !== null) {
    const a = anchorM, lever = (i: number) => Math.max(0, z[i] - a);
    // Vrij opgelegd: G(z) = ∫p·(s − a) ds = M(z) − Q(z)·(a − z) ... uitgeschreven: moment om het anker van alle belasting boven z.
    const g = (i: number) => q[i] * (z[i] - a) - m[i];
    const cf = crossing(g, zero);
    if (cf) {
      const toe = z[cf.i - 1] + cf.t * dz, force = at(q, cf);
      free = { zeroLoadM, theoreticalToeM: toe, requiredToeM: toe, anchorKn: force, toeForceKn: 0, ...extremes((i) => m[i] - force * lever(i), (i) => q[i] - (z[i] >= a ? force : 0), cf.i) };
    }
    // Ingeklemd: zakking bij het anker nul ten opzichte van de inklemming in het voetpunt.
    // A(z0) = 3·∫ M(s)·(s − a) ds / (z0 − a)³ over a..z0; daarna M(z0) − A·(z0 − a) = 0.
    const w = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) w[i] = w[i - 1] + ((m[i - 1] * lever(i - 1) + m[i] * lever(i)) / 2) * dz;
    const force = (i: number) => (lever(i) > 0 ? (3 * w[i]) / lever(i) ** 3 : 0);
    const cx = crossing((i) => m[i] - force(i) * lever(i), Math.max(zero, Math.ceil(a / dz) + 1));
    if (cx) {
      const toe = z[cx.i - 1] + cx.t * dz, f = force(cx.i - 1) + cx.t * (force(cx.i) - force(cx.i - 1));
      fixed = { zeroLoadM, theoreticalToeM: toe, requiredToeM: withMargin(toe), anchorKn: f, toeForceKn: Math.abs(at(q, cx) - f), ...extremes((i) => m[i] - f * lever(i), (i) => q[i] - (z[i] >= a ? f : 0), cx.i) };
    }
  }
  return { stepM: dz, cantilever, free, fixed };
}
