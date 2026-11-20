// Geometrie van het bezwijkvlak onder een fundering op staal (Prandtl): de actieve wig
// onder de voet, de overgangszone (logaritmische spiraal; bij φ' = 0 een cirkelboog) en de
// passieve wig naar het funderingsniveau. Zonder horizontale belasting volgen de diepte en
// de reikwijdte van dit vlak uit φ' alleen; de tekening schaalt het vlak naar de
// invloedsdiepte ze en de invloedsbreedte ae uit de berekening, zodat het vlak laat zien
// over welke lagen is gemiddeld. Zie VERIFICATIE.md.

const rad = (d: number) => (d * Math.PI) / 180;

/** Punt in de doorsnede: x [m] vanaf het midden van b', z [m] onder het funderingsvlak. */
export interface Pt { x: number; z: number }

export interface SlipSide {
  /** Kant waarheen de grond uitwijkt: +1 in de richting van H, −1 ertegenin. */
  dir: 1 | -1;
  /** Actieve wig: rand, punt, rand. */
  wedge: Pt[];
  /** Overgangszone van de punt van de wig naar de passieve wig. */
  transition: Pt[];
  /** Passieve wig: einde van de overgangszone, uittredepunt, rand van de voet. */
  passive: Pt[];
}

export interface SlipSurface {
  kind: "logspiral" | "circle";
  sides: SlipSide[];
  /** Grootste diepte onder het funderingsvlak [m]. */
  maxDepthM: number;
  /** Afstand van de rand van b' tot het uittredepunt [m]. */
  reachM: number;
}

/** Diepte en reikwijdte van het vlak van Prandtl als veelvoud van b', bij verticale belasting. */
export function prandtlRatios(phiDeg: number): { ze: number; ae: number } {
  const phi = rad(phiDeg), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi);
  return { ze: (Math.cos(phi) / (2 * Math.cos(mu))) * Math.exp(mu * t), ae: Math.tan(mu) * Math.exp((Math.PI / 2) * t) };
}

export interface SlipParams {
  bEffM: number;
  /** Hoek waarmee het vlak wordt getekend [°]; 0 = ongedraineerd. */
  phiDeg: number;
  /** Invloedsdiepte en invloedsbreedte uit de berekening [m]. */
  zeM: number;
  aeM: number;
  /** Eén kant (horizontale belasting, excentriciteit of helling) of beide kanten. */
  oneSided: boolean;
  /** Aantal punten op de overgangszone. */
  points?: number;
}

export function slipSurface(p: SlipParams): SlipSurface {
  const b = p.bEffM, phi = rad(Math.min(45, Math.max(0, p.phiDeg))), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi);
  const nat = prandtlRatios(p.phiDeg), kz = p.zeM / (nat.ze * b), kx = p.aeM / (nat.ae * b);
  const r0 = b / (2 * Math.cos(mu)), count = Math.max(8, p.points ?? 32);
  // Pool van de spiraal: de rand van b' aan de kant waarheen de grond uitwijkt.
  const edge = b / 2, scale = (x: number, z: number): Pt => ({ x: x > edge ? edge + (x - edge) * kx : x, z: z * kz });
  const transition: Pt[] = [];
  for (let k = 0; k <= count; k++) {
    const theta = (k / count) * (Math.PI / 2), psi = Math.PI - mu - theta, r = r0 * Math.exp(theta * t);
    transition.push(scale(edge + r * Math.cos(psi), r * Math.sin(psi)));
  }
  const r1 = r0 * Math.exp((Math.PI / 2) * t), exit = scale(edge + 2 * r1 * Math.cos(Math.PI / 4 - phi / 2), 0);
  const apex = transition[0];
  const side = (dir: 1 | -1): SlipSide => {
    const m = (q: Pt): Pt => ({ x: dir * q.x, z: q.z });
    return { dir, wedge: [m({ x: -edge, z: 0 }), m(apex), m({ x: edge, z: 0 })], transition: transition.map(m), passive: [m(transition[count]), m(exit), m({ x: edge, z: 0 })] };
  };
  // De grootste diepte ligt op de spiraal waar de raaklijn horizontaal is; neem hem uit de punten en de formule.
  const maxDepthM = Math.max(nat.ze * b * kz, ...transition.map((q) => q.z));
  return { kind: p.phiDeg < 1e-6 ? "circle" : "logspiral", sides: p.oneSided ? [side(1)] : [side(1), side(-1)], maxDepthM, reachM: exit.x - edge };
}
