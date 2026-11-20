// Geometrie van het bezwijkvlak onder een fundering op staal: het glijlijnenveld van de
// plasticiteitstheorie voor een strook op gewichtsloze grond (Prandtl 1920), uitgebreid naar
// een hellende belasting (Sokolovskii 1960, "Statics of soil media"; Brinch Hansen 1961,
// "A general formula for bearing capacity"; op deze oplossing gaan de hellingfactoren terug).
//
// Onder de voet heerst een gelijkmatige spanningstoestand. Werkt op het funderingsvlak een
// schuifspanning, dan staat de grootste hoofdspanning niet meer loodrecht op dat vlak maar is
// hij over een hoek α naar de belasting toe gedraaid. Uit de cirkel van Mohr volgt
//
//   gedraineerd    sin Δ = sin δ / sin φ',  α = (Δ + δ)/2,  met tan δ = Hd / (Vd + A'·c'·cot φ')
//   ongedraineerd  sin 2α = Hd / (A'·cu)
//
// De glijlijnen maken een hoek 45° − φ'/2 met de grootste hoofdspanning. Daarmee ligt het
// mechanisme vast, met μ = 45° + φ'/2:
//
//   actieve wig     basishoek μ − α aan de kant waar de belasting vandaan komt en μ + α aan de
//                   kant waarheen hij wijst; tophoek 90° − φ'
//   overgangszone   logaritmische spiraal r = r0·e^(θ·tan φ') om de rand van b' (bij φ' = 0 een
//                   cirkelboog). De openingshoek is de hoek waarover de grootste hoofdspanning
//                   draait tussen de passieve wig en de wig onder de voet:
//                     naar de kant waarheen de belasting wijst   90° − α − αb − β
//                     naar de andere kant                        90° + α + αb
//                   met αb de helling van de onderkant (oplopend in de richting van de belasting)
//                   en β de helling van het maaiveld aan die kant
//   passieve wig    basishoeken 45° − φ'/2 met het maaiveld; de grootste hoofdspanning loopt er
//                   evenwijdig aan het maaiveld
//
// Beide mechanismen horen bij dezelfde belasting. Het draagvermogen is evenredig met
// e^(2·openingshoek·tan φ') (ongedraineerd met 1 + 2·openingshoek + cos 2α): de kant met de kleinste
// openingshoek bezwijkt het eerst en is maatgevend. Bij α = αb = β = 0 zijn beide kanten het
// symmetrische vlak van Prandtl; bij δ = φ' (α = μ) schuift de voet af. Zie VERIFICATIE.md.

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Punt in de doorsnede: x [m] vanaf het midden van b', z [m] onder het funderingsvlak in het midden van b'. */
export interface Pt { x: number; z: number }

export interface SlipSide {
  /** Kant waarheen de grond uitwijkt: +1 in de richting van H en van de maaiveldhelling, −1 ertegenin. */
  dir: 1 | -1;
  /** Dit mechanisme vraagt de kleinste belasting. Bij een symmetrisch geval zijn beide kanten maatgevend. */
  governing: boolean;
  /** Actieve wig: de andere rand, de punt, de rand aan deze kant (de pool van de spiraal). */
  wedge: Pt[];
  /** Overgangszone van de punt van de wig naar de passieve wig. */
  transition: Pt[];
  /** Passieve wig: einde van de overgangszone, uittredepunt op de lijn door de rand evenwijdig aan het maaiveld, de rand. */
  passive: Pt[];
  /** Waar het verlengde van de glijlijn door de dekking het maaiveld bereikt; zonder dekking het uittredepunt. */
  daylight: Pt;
  /** Openingshoek van de overgangszone [°]. */
  fanDeg: number;
  /** Grootste diepte onder het funderingsvlak in het midden van b' [m]. */
  maxDepthM: number;
  /** Horizontale afstand van de rand van b' tot het uittredepunt [m]. */
  reachM: number;
}

export interface SlipSurface {
  kind: "logspiral" | "circle";
  /** Altijd beide kanten: eerst de kant van H en van de helling (+1), dan de andere (−1). */
  sides: SlipSide[];
  /** Diepte, reikwijdte en openingshoek van het maatgevende mechanisme. */
  maxDepthM: number;
  reachM: number;
  fanDeg: number;
  /** Verdraaiing α van de grootste hoofdspanning onder de voet door de belastinghelling [°]; 0 bij verticale belasting. */
  rotationDeg: number;
  /** Basishoeken van de actieve wig met de onderkant [°]: aan de kant waar de belasting vandaan komt en waarheen hij wijst. */
  wedgeAnglesDeg: [far: number, near: number];
  /** Basishoek van de passieve wig [°]. */
  passiveDeg: number;
  /** Beide kanten zijn gelijk: er is geen maatgevende kant. */
  symmetric: boolean;
  /** Factor waarmee de belasting moet toenemen voordat de grond ook naar de niet-maatgevende kant bezwijkt (≥ 1). */
  otherSideFactor: number;
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

/**
 * Diepte en reikwijdte van het mechanisme als veelvoud van b', bij een verdraaiing α [rad], een horizontaal
 * maaiveld en een horizontale onderkant. Een negatieve α geeft het mechanisme naar de andere kant.
 */
export function mechanismRatios(phiDeg: number, alphaRad = 0): { ze: number; ae: number } {
  const phi = rad(phiDeg), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi), a = Math.min(Math.max(-mu, alphaRad), mu);
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
  /** Helling β van het maaiveld aan de kant +1, aflopend vanaf de rand van b' [°]. */
  slopeDeg?: number;
  /** Helling αb van de onderkant, oplopend naar de kant +1 [°]. */
  baseTiltDeg?: number;
  /** Dekking boven het funderingsvlak in het midden van b' [m]; bepaalt alleen waar het vlak het maaiveld bereikt. */
  coverM?: number;
  /** Aantal punten op de overgangszone. */
  points?: number;
}

export function slipSurface(p: SlipParams): SlipSurface {
  const b = p.bEffM, phiDeg = Math.min(45, Math.max(0, p.phiDeg)), phi = rad(phiDeg), mu = Math.PI / 4 + phi / 2, t = Math.tan(phi), eps = Math.PI / 4 - phi / 2;
  const alpha = Math.min(loadRotation(phiDeg, p.obliquity ?? 0), mu), tiltAll = rad(Math.max(0, p.baseTiltDeg ?? 0)), betaAll = rad(Math.max(0, p.slopeDeg ?? 0));
  const count = Math.max(8, p.points ?? 32), edge = b / 2, cover = Math.max(0, p.coverM ?? 0);
  // Elke kant in zijn eigen stelsel met x naar buiten; de kant −1 wordt daarna gespiegeld.
  const build = (dir: 1 | -1) => {
    const a = dir * alpha, tilt = dir * tiltAll, beta = dir === 1 ? betaAll : 0;
    // Pool van de spiraal: de rand van b' aan deze kant, op de hellende onderkant. ψ is de hoek onder de horizontaal.
    const pole: Pt = { x: edge, z: 0 - edge * Math.tan(tilt) }, other: Pt = { x: -edge, z: 0 + edge * Math.tan(tilt) };
    const fan = Math.max(0, Math.PI / 2 - a - tilt - beta), psi0 = Math.PI - mu - a - tilt;
    const r0 = ((b / Math.cos(tilt)) * Math.sin(mu - a)) / Math.cos(phi);
    const at = (theta: number): Pt => { const psi = psi0 - theta, r = r0 * Math.exp(theta * t); return { x: pole.x + r * Math.cos(psi), z: pole.z + r * Math.sin(psi) }; };
    const transition = Array.from({ length: count + 1 }, (_, k) => at((k / count) * fan));
    // De passieve wig ligt onder de lijn door de pool evenwijdig aan het maaiveld; daarboven ligt de dekking.
    const r1 = r0 * Math.exp(fan * t), reach = 2 * r1 * Math.cos(eps);
    const exit: Pt = { x: pole.x + reach * Math.cos(beta), z: pole.z + reach * Math.sin(beta) };
    const up = (Math.max(0, cover + pole.z) * Math.cos(beta)) / Math.sin(eps);
    const daylight: Pt = { x: exit.x + up * Math.cos(eps - beta), z: exit.z - up * Math.sin(eps - beta) };
    // Diepste punt: waar de raaklijn aan de spiraal horizontaal is (ψ = 90° − φ'), als dat op de spiraal ligt.
    const deepest = psi0 - (Math.PI / 2 - phi);
    const maxDepthM = Math.max(transition[0].z, transition[count].z, pole.z, other.z, deepest > 0 && deepest < fan ? at(deepest).z : -Infinity);
    const m = (q: Pt): Pt => ({ x: dir * q.x, z: q.z });
    return { dir, fan, side: { wedge: [m(other), m(transition[0]), m(pole)], transition: transition.map(m), passive: [m(transition[count]), m(exit), m(pole)], daylight: m(daylight), fanDeg: deg(fan), maxDepthM, reachM: exit.x - pole.x } };
  };
  const near = build(1), far = build(-1), symmetric = Math.abs(near.fan - far.fan) < 1e-9;
  const sides: SlipSide[] = [near, far].map((s) => ({ dir: s.dir, governing: symmetric || s.fan === Math.min(near.fan, far.fan), ...s.side }));
  const gov = near.fan <= far.fan ? near : far, oth = gov === near ? far : near;
  const strength = (fan: number) => (phiDeg < 1e-6 ? 1 + 2 * fan + Math.cos(2 * alpha) : Math.exp(2 * fan * t));
  return {
    kind: phiDeg < 1e-6 ? "circle" : "logspiral", sides, maxDepthM: gov.side.maxDepthM, reachM: gov.side.reachM, fanDeg: deg(gov.fan),
    rotationDeg: deg(alpha), wedgeAnglesDeg: [deg(mu - alpha), deg(mu + alpha)], passiveDeg: deg(eps), symmetric, otherSideFactor: strength(oth.fan) / strength(gov.fan),
  };
}
