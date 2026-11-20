// Geometrie van het bezwijkvlak onder een fundering op staal: het glijlijnenveld van de
// plasticiteitstheorie voor een strook op gewichtsloze grond (Prandtl 1920), uitgebreid naar
// een hellende belasting (Sokolovskii 1960, "Statics of soil media"; Brinch Hansen 1961,
// "A general formula for bearing capacity"; op deze oplossing gaan de hellingfactoren terug).
//
// Onder de voet heerst een gelijkmatige spanningstoestand. Werkt op het funderingsvlak een
// schuifspanning, dan staat de grootste hoofdspanning niet meer verticaal maar is hij over
// een hoek α naar de belasting toe gedraaid. Uit de cirkel van Mohr volgt
//
//   gedraineerd    sin Δ = sin δ / sin φ',  α = (Δ + δ)/2,  met tan δ = Hd / (Vd + A'·c'·cot φ')
//   ongedraineerd  sin 2α = Hd / (A'·cu)
//
// De glijlijnen maken een hoek 45° − φ'/2 met de grootste hoofdspanning. Daarmee ligt het
// mechanisme vast, met μ = 45° + φ'/2:
//
//   actieve wig     basishoek μ − α aan de kant waar de belasting vandaan komt en μ + α aan de
//                   kant waarheen hij wijst; tophoek 90° − φ'
//   overgangszone   logaritmische spiraal r = r0·e^(θ·tan φ') om de rand van b', met
//                   r0 = b'·sin(μ − α)/cos φ' en openingshoek 90° − α (bij φ' = 0 een cirkelboog)
//   passieve wig    basishoeken 45° − φ'/2, aan de kant waarheen de belasting wijst
//
// Bij α = 0 is dit het symmetrische vlak van Prandtl; bij δ = φ' (α = μ) verdwijnt het
// mechanisme en schuift de voet af. Het bijbehorende draagvermogen is
// Nq(δ) = (1 + sin φ'·cos(Δ + δ)) / (1 − sin φ') · e^((π − Δ − δ)·tan φ'). Zie VERIFICATIE.md.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

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
  /** Verdraaiing α van de grootste hoofdspanning onder de voet [°]; 0 bij verticale belasting. */
  rotationDeg: number;
  /** Basishoeken van de actieve wig [°]: aan de kant waar de belasting vandaan komt en waarheen hij wijst. */
  wedgeAnglesDeg: [far: number, near: number];
  /** Openingshoek van de overgangszone [°]. */
  fanDeg: number;
  /** Basishoek van de passieve wig [°]. */
  passiveDeg: number;
}

/**
 * Verdraaiing α [rad] van de grootste hoofdspanning onder de voet.
 * `obliquity` is gedraineerd tan δ = Hd / (Vd + A'·c'·cot φ') en bij φ' = 0 de verhouding Hd / (A'·cu).
 */
export function loadRotation(phiDeg: number, obliquity: number): number {
  const x = Math.max(0, obliquity);
  if (phiDeg < 1e-6) return Math.asin(clamp01(x)) / 2;
  const delta = Math.atan(x), bigDelta = Math.asin(clamp01(Math.sin(delta) / Math.sin(rad(phiDeg))));
  return (bigDelta + Math.min(delta, rad(phiDeg))) / 2;
}

/** Diepte en reikwijdte van het mechanisme als veelvoud van b', bij een verdraaiing α [rad]. */
export function mechanismRatios(phiDeg: number, alphaRad = 0): { ze: number; ae: number } {
  const phi = rad(phiDeg), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi), a = Math.min(Math.max(0, alphaRad), mu);
  // Diepste punt: waar de raaklijn aan de spiraal horizontaal is, op een hoek μ − α vanaf de punt van de wig.
  return { ze: Math.sin(mu - a) * Math.exp((mu - a) * t), ae: (2 * Math.sin(mu) * Math.sin(mu - a) / Math.cos(phi)) * Math.exp((Math.PI / 2 - a) * t) };
}

/** Diepte en reikwijdte van het vlak van Prandtl als veelvoud van b', bij verticale belasting. */
export const prandtlRatios = (phiDeg: number) => mechanismRatios(phiDeg, 0);

/** Nq van de strook op gewichtsloze grond bij een hellende belasting (exacte oplossing); bij tan δ = 0 de Nq van Prandtl. */
export function inclinedNq(phiDeg: number, tanDelta: number): number {
  const phi = rad(phiDeg), twoAlpha = 2 * loadRotation(phiDeg, tanDelta);
  return ((1 + Math.sin(phi) * Math.cos(twoAlpha)) / (1 - Math.sin(phi))) * Math.exp((Math.PI - twoAlpha) * Math.tan(phi));
}

export interface SlipParams {
  bEffM: number;
  /** Hoek waarmee het vlak wordt getekend [°]; 0 = ongedraineerd. */
  phiDeg: number;
  /** Helling van de belasting: tan δ = Hd / (Vd + A'·c'·cot φ'), bij φ' = 0 Hd / (A'·cu). Ontbrekend = verticaal. */
  obliquity?: number;
  /** Eén kant (horizontale belasting, excentriciteit of helling) of beide kanten. Bij een hellende belasting altijd één kant. */
  oneSided: boolean;
  /** Aantal punten op de overgangszone. */
  points?: number;
}

export function slipSurface(p: SlipParams): SlipSurface {
  const b = p.bEffM, phiDeg = Math.min(45, Math.max(0, p.phiDeg)), phi = rad(phiDeg), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi);
  const alpha = Math.min(loadRotation(phiDeg, p.obliquity ?? 0), mu), fan = Math.PI / 2 - alpha, eps = Math.PI / 4 - phi / 2;
  const r0 = (b * Math.sin(mu - alpha)) / Math.cos(phi), count = Math.max(8, p.points ?? 32), edge = b / 2;
  // Pool van de spiraal: de rand van b' aan de kant waarheen de grond uitwijkt. ψ is de hoek onder de horizontaal.
  const transition: Pt[] = [];
  for (let k = 0; k <= count; k++) {
    const theta = (k / count) * fan, psi = Math.PI - mu - alpha - theta, r = r0 * Math.exp(theta * t);
    transition.push({ x: edge + r * Math.cos(psi), z: r * Math.sin(psi) });
  }
  const r1 = r0 * Math.exp(fan * t), exit: Pt = { x: edge + 2 * r1 * Math.cos(eps), z: 0 }, apex = transition[0];
  const side = (dir: 1 | -1): SlipSide => {
    const m = (q: Pt): Pt => ({ x: dir * q.x, z: q.z });
    return { dir, wedge: [m({ x: -edge, z: 0 }), m(apex), m({ x: edge, z: 0 })], transition: transition.map(m), passive: [m(transition[count]), m(exit), m({ x: edge, z: 0 })] };
  };
  const nat = mechanismRatios(phiDeg, alpha);
  return {
    kind: phiDeg < 1e-6 ? "circle" : "logspiral", sides: p.oneSided || alpha > 1e-9 ? [side(1)] : [side(1), side(-1)],
    maxDepthM: nat.ze * b, reachM: exit.x - edge, rotationDeg: deg(alpha), wedgeAnglesDeg: [deg(mu - alpha), deg(mu + alpha)], fanDeg: deg(fan), passiveDeg: deg(eps),
  };
}
