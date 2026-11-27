import type { AnalysisMode, EquivalentLayer, LayerCorrection, SoilSpringProfile, SpringLaw, SpringResponse, UltimateProfile } from './spring-types';
import { ct } from '../../i18n';

const QUANTITY_KEYS: Record<string, string> = { 'Grensweerstand aan maaiveld': 'ultimateAtSurface', 'Toename grensweerstand': 'ultimateGradient', 'Bovengrens weerstand': 'ultimateCap', 'Initiële stijfheid': 'initialStiffness', 'Grensweerstand van de veer': 'springUltimate', 'Diepte grensweerstandsprofiel': 'profileDepth', 'Laagbovenkant': 'layerTop', 'Laagonderkant': 'layerBottom', 'Veerdiepte': 'springDepth', 'Equivalente laagbovenkant': 'equivalentTop' };

function nonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    const name = QUANTITY_KEYS[label] ? ct('calcLateral', `quantities.${QUANTITY_KEYS[label]}`, label) : label;
    throw new Error(ct('calcLateral', 'errors.nonNegative', '{{label}} moet eindig en niet-negatief zijn.', { label: name }));
  }
}

/**
 * Brinch Hansen (1961), "The ultimate resistance of rigid piles against transversal forces", Danish Geotechnical
 * Institute Bulletin 12: coëfficiënt K_q voor wrijvingsgrond (c = 0) op diepte z bij paalbreedte D:
 *   K_q⁰ = e^((π/2 + φ) tan φ) cos φ tan(π/4 + φ/2) − e^(−(π/2 − φ) tan φ) cos φ tan(π/4 − φ/2)
 *   K_q^∞ = N_c d_c^∞ K0 tan φ, N_c = (N_q − 1) cot φ, N_q = e^(π tan φ) tan²(π/4 + φ/2), d_c^∞ = 1,58 + 4,09 tan⁴ φ,
 *   K0 = 1 − sin φ
 *   α_q = K_q⁰ / (K_q^∞ − K_q⁰) · K0 sin φ / sin(π/4 + φ/2)
 *   K_q(z) = (K_q⁰ + K_q^∞ α_q z/D) / (1 + α_q z/D)
 * Uit kennis van de publicatie overgenomen (de oorspronkelijke tekst is niet geraadpleegd); de waarden van K_q⁰ zijn
 * nagerekend in de test.
 */
export function brinchHansenKq(phiDeg: number, zM: number, widthM: number): number {
  const p = phiDeg * Math.PI / 180, t = Math.tan(p), c = Math.cos(p), s = Math.sin(p);
  const k0q = Math.exp((Math.PI / 2 + p) * t) * c * Math.tan(Math.PI / 4 + p / 2) - Math.exp(-(Math.PI / 2 - p) * t) * c * Math.tan(Math.PI / 4 - p / 2);
  const nq = Math.exp(Math.PI * t) * Math.tan(Math.PI / 4 + p / 2) ** 2, nc = (nq - 1) / t, dc = 1.58 + 4.09 * t ** 4, k0 = 1 - s, kinf = nc * dc * k0 * t;
  const aq = k0q / (kinf - k0q) * k0 * s / Math.sin(Math.PI / 4 + p / 2), r = aq * zM / widthM;
  return (k0q + kinf * r) / (1 + r);
}
const bhPu = (b: NonNullable<UltimateProfile['brinchHansen']>, zM: number) => brinchHansenKq(b.phiDeg, zM, b.widthM ?? 1) * b.gammaEffKnM3 * zM * (b.widthM ?? 1);
/** ∫₀^z pu dz voor Brinch Hansen, met Simpson over 400 stappen (pu is glad). */
function bhIntegral(b: NonNullable<UltimateProfile['brinchHansen']>, zM: number): number {
  if (zM <= 0) return 0;
  const n = 400, h = zM / n;
  let s = bhPu(b, 0) + bhPu(b, zM);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * bhPu(b, i * h);
  return s * h / 3;
}

function validateUltimate(profile: UltimateProfile): void {
  const b = profile.brinchHansen;
  if (b) {
    if (!(b.phiDeg > 0 && b.phiDeg <= 50 && b.gammaEffKnM3 > 0 && (b.widthM ?? 1) > 0 && [b.phiDeg, b.gammaEffKnM3, b.widthM ?? 1].every(Number.isFinite)))
      throw new Error(ct('calcLateral', 'errors.brinchHansenInput', 'Brinch Hansen: vul φ′ (0 tot 50°) en een positieve γ′ in.'));
    return;
  }
  nonnegative(profile.atSurfaceKnM, 'Grensweerstand aan maaiveld');
  nonnegative(profile.gradientKnM2, 'Toename grensweerstand');
  nonnegative(profile.capKnM, 'Bovengrens weerstand');
  if (profile.capKnM === 0 || profile.atSurfaceKnM > profile.capKnM) {
    throw new Error(ct('calcLateral', 'errors.capBelowSurface', 'De bovengrens moet positief zijn en minstens gelijk aan de grensweerstand aan maaiveld.'));
  }
}

export function evaluateSpring(law: SpringLaw, yM: number): SpringResponse {
  nonnegative(law.initialKnM2, 'Initiële stijfheid');
  if (!Number.isFinite(yM)) throw new Error(ct('calcLateral', 'errors.springDisplacement', 'De veerverplaatsing moet eindig zijn.'));
  const k = law.initialKnM2;
  if (law.kind === 'linear') return { resistanceKnM: k * yM, tangentKnM2: k, secantKnM2: k };
  if (law.kind === 'elastoplastic' && law.ultimateKnM !== null) {
    // Elastisch-volkomen plastisch: lineair tot pu, daarna constant (tangent 0).
    nonnegative(law.ultimateKnM, 'Grensweerstand van de veer');
    if (yM === 0) return { resistanceKnM: 0, tangentKnM2: k, secantKnM2: k };
    const elastic = k * Math.abs(yM) < law.ultimateKnM, resistanceKnM = Math.sign(yM) * Math.min(k * Math.abs(yM), law.ultimateKnM);
    return { resistanceKnM, tangentKnM2: elastic ? k : 0, secantKnM2: resistanceKnM / yM };
  }
  if (law.kind !== 'hyperbolic' || law.ultimateKnM === null) throw new Error(ct('calcLateral', 'errors.nonlinearNeedsUltimate', 'De niet-lineaire veer vereist een grensweerstand.'));
  nonnegative(law.ultimateKnM, 'Grensweerstand van de veer');
  if (law.ultimateKnM === 0 || k === 0) return { resistanceKnM: 0, tangentKnM2: 0, secantKnM2: 0 };
  if (yM === 0) return { resistanceKnM: 0, tangentKnM2: k, secantKnM2: k };
  const x = k * yM / law.ultimateKnM;
  const resistanceKnM = law.ultimateKnM * Math.tanh(x);
  const e = Math.exp(-2 * Math.abs(x));
  return { resistanceKnM, tangentKnM2: k * (4 * e / ((1 + e) ** 2)), secantKnM2: resistanceKnM / yM };
}

export function ultimateAtDepth(profile: UltimateProfile, zM: number): number {
  validateUltimate(profile);
  nonnegative(zM, 'Diepte grensweerstandsprofiel');
  if (profile.brinchHansen) return bhPu(profile.brinchHansen, zM);
  return Math.min(profile.capKnM, profile.atSurfaceKnM + profile.gradientKnM2 * zM);
}

/** Integral from the homogeneous profile origin to z, in kN. */
export function integratedUltimate(profile: UltimateProfile, zM: number): number {
  validateUltimate(profile);
  nonnegative(zM, 'Diepte grensweerstandsprofiel');
  if (profile.brinchHansen) return bhIntegral(profile.brinchHansen, zM);
  const { atSurfaceKnM: a, gradientKnM2: g, capKnM: cap } = profile;
  if (g === 0) return a * zM;
  const risingDepth = Math.min(zM, (cap - a) / g);
  return risingDepth * (a + 0.5 * g * risingDepth) + cap * (zM - risingDepth);
}

function inverseIntegratedUltimate(profile: UltimateProfile, forceKn: number): number {
  if (forceKn === 0) return 0;
  if (profile.brinchHansen) {
    // Monotoon stijgend: grenzen verdubbelen, dan halveren.
    let lo = 0, hi = 1;
    while (integratedUltimate(profile, hi) < forceKn) { lo = hi; hi *= 2; if (hi > 1e6) throw new Error(ct('calcLateral', 'errors.equivalentOverflow', 'De equivalente-laagberekening overschrijdt het numerieke bereik.')); }
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (integratedUltimate(profile, m) < forceKn) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  const { atSurfaceKnM: a, gradientKnM2: g, capKnM: cap } = profile;
  if (g === 0) {
    if (a === 0) throw new Error(ct('calcLateral', 'errors.zeroStrengthLayer', 'Een laag met nulsterkte kan de bovenliggende grensweerstand niet vertegenwoordigen.'));
    return forceKn / a;
  }
  const capDepth = (cap - a) / g;
  const capForce = capDepth * (a + cap) / 2;
  if (forceKn >= capForce) return capDepth + (forceKn - capForce) / cap;
  return 2 * forceKn / (a + Math.sqrt(a * a + 2 * g * forceKn));
}

function validateProfiles(profiles: SoilSpringProfile[]): void {
  profiles.forEach((profile, index) => {
    nonnegative(profile.topM, 'Laagbovenkant');
    nonnegative(profile.bottomM, 'Laagonderkant');
    nonnegative(profile.initialKnM2, 'Initiële stijfheid');
    validateUltimate(profile.ultimate);
    if (profile.bottomM <= profile.topM) throw new Error(ct('calcLateral', 'errors.bottomAboveTop', 'De laagonderkant moet dieper liggen dan de bovenkant.'));
    if (index > 0 && profile.topM < profiles[index - 1].bottomM) throw new Error(ct('calcLateral', 'errors.layersUnsorted', 'Grondlagen overlappen of staan niet op diepte gesorteerd.'));
  });
}

/** `originM`: diepte waar de grond begint (zonder laagcorrectie de nul van z_eq); standaard de bovenkant van de eerste laag. */
export function equivalentLayers(profiles: SoilSpringProfile[], correction: LayerCorrection, originM?: number): EquivalentLayer[] {
  validateProfiles(profiles);
  if (correction !== 'none' && correction !== 'georgiadis') throw new Error(ct('calcLateral', 'errors.unknownCorrection', 'Onbekende laagcorrectie.'));
  let cumulativeUltimateKn = 0;
  return profiles.map((profile, index) => {
    const topEquivalentM = correction === 'none' ? profile.topM - Math.min(originM ?? profiles[0].topM, profiles[0].topM)
      : index === 0 ? 0 : inverseIntegratedUltimate(profile.ultimate, cumulativeUltimateKn);
    const bottomEquivalentM = topEquivalentM + profile.bottomM - profile.topM;
    cumulativeUltimateKn += integratedUltimate(profile.ultimate, bottomEquivalentM) - integratedUltimate(profile.ultimate, topEquivalentM);
    if (!Number.isFinite(bottomEquivalentM) || !Number.isFinite(cumulativeUltimateKn)) throw new Error(ct('calcLateral', 'errors.equivalentOverflow', 'De equivalente-laagberekening overschrijdt het numerieke bereik.'));
    return { topEquivalentM, bottomEquivalentM, cumulativeUltimateKn };
  });
}

export function springLawAtDepth(profiles: SoilSpringProfile[], equivalents: EquivalentLayer[], layerIndex: number, zM: number, mode: AnalysisMode): { law: SpringLaw; equivalentDepthM: number } {
  validateProfiles(profiles);
  nonnegative(zM, 'Veerdiepte');
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= profiles.length || equivalents.length !== profiles.length) throw new Error(ct('calcLateral', 'errors.invalidSpringLayer', 'Ongeldige veerlaag of aantal equivalente lagen.'));
  const profile = profiles[layerIndex], equivalent = equivalents[layerIndex];
  if (zM < profile.topM || zM > profile.bottomM) throw new Error(ct('calcLateral', 'errors.springOutsideLayer', 'De veerdiepte ligt buiten de geselecteerde grondlaag.'));
  nonnegative(equivalent.topEquivalentM, 'Equivalente laagbovenkant');
  const equivalentDepthM = equivalent.topEquivalentM + zM - profile.topM;
  if (mode !== 'linear' && mode !== 'nonlinear' && mode !== 'elastoplastic') throw new Error(ct('calcLateral', 'errors.unknownAnalysisChoice', 'Onbekende analysekeuze.'));
  return {
    equivalentDepthM,
    law: { kind: mode === 'linear' ? 'linear' : mode === 'elastoplastic' ? 'elastoplastic' : 'hyperbolic', initialKnM2: profile.initialKnM2, ultimateKnM: mode === 'linear' ? null : ultimateAtDepth(profile.ultimate, equivalentDepthM) },
  };
}
