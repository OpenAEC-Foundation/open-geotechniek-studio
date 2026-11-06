import type { AnalysisMode, EquivalentLayer, LayerCorrection, SoilSpringProfile, SpringLaw, SpringResponse, UltimateProfile } from './spring-types';

function nonnegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} moet eindig en niet-negatief zijn.`);
}

function validateUltimate(profile: UltimateProfile): void {
  nonnegative(profile.atSurfaceKnM, 'Grensweerstand aan maaiveld');
  nonnegative(profile.gradientKnM2, 'Toename grensweerstand');
  nonnegative(profile.capKnM, 'Bovengrens weerstand');
  if (profile.capKnM === 0 || profile.atSurfaceKnM > profile.capKnM) {
    throw new Error('De bovengrens moet positief zijn en minstens gelijk aan de grensweerstand aan maaiveld.');
  }
}

export function evaluateSpring(law: SpringLaw, yM: number): SpringResponse {
  nonnegative(law.initialKnM2, 'Initiële stijfheid');
  if (!Number.isFinite(yM)) throw new Error('De veerverplaatsing moet eindig zijn.');
  const k = law.initialKnM2;
  if (law.kind === 'linear') return { resistanceKnM: k * yM, tangentKnM2: k, secantKnM2: k };
  if (law.kind !== 'hyperbolic' || law.ultimateKnM === null) throw new Error('De niet-lineaire veer vereist een grensweerstand.');
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
  return Math.min(profile.capKnM, profile.atSurfaceKnM + profile.gradientKnM2 * zM);
}

/** Integral from the homogeneous profile origin to z, in kN. */
export function integratedUltimate(profile: UltimateProfile, zM: number): number {
  validateUltimate(profile);
  nonnegative(zM, 'Diepte grensweerstandsprofiel');
  const { atSurfaceKnM: a, gradientKnM2: g, capKnM: cap } = profile;
  if (g === 0) return a * zM;
  const risingDepth = Math.min(zM, (cap - a) / g);
  return risingDepth * (a + 0.5 * g * risingDepth) + cap * (zM - risingDepth);
}

function inverseIntegratedUltimate(profile: UltimateProfile, forceKn: number): number {
  if (forceKn === 0) return 0;
  const { atSurfaceKnM: a, gradientKnM2: g, capKnM: cap } = profile;
  if (g === 0) {
    if (a === 0) throw new Error('Een laag met nulsterkte kan de bovenliggende grensweerstand niet vertegenwoordigen.');
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
    if (profile.bottomM <= profile.topM) throw new Error('De laagonderkant moet dieper liggen dan de bovenkant.');
    if (index > 0 && profile.topM < profiles[index - 1].bottomM) throw new Error('Grondlagen overlappen of staan niet op diepte gesorteerd.');
  });
}

export function equivalentLayers(profiles: SoilSpringProfile[], correction: LayerCorrection): EquivalentLayer[] {
  validateProfiles(profiles);
  if (correction !== 'none' && correction !== 'georgiadis') throw new Error('Onbekende laagcorrectie.');
  let cumulativeUltimateKn = 0;
  return profiles.map((profile, index) => {
    const topEquivalentM = correction === 'none' ? profile.topM - profiles[0].topM
      : index === 0 ? 0 : inverseIntegratedUltimate(profile.ultimate, cumulativeUltimateKn);
    const bottomEquivalentM = topEquivalentM + profile.bottomM - profile.topM;
    cumulativeUltimateKn += integratedUltimate(profile.ultimate, bottomEquivalentM) - integratedUltimate(profile.ultimate, topEquivalentM);
    if (!Number.isFinite(bottomEquivalentM) || !Number.isFinite(cumulativeUltimateKn)) throw new Error('De equivalente-laagberekening overschrijdt het numerieke bereik.');
    return { topEquivalentM, bottomEquivalentM, cumulativeUltimateKn };
  });
}

export function springLawAtDepth(profiles: SoilSpringProfile[], equivalents: EquivalentLayer[], layerIndex: number, zM: number, mode: AnalysisMode): { law: SpringLaw; equivalentDepthM: number } {
  validateProfiles(profiles);
  nonnegative(zM, 'Veerdiepte');
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= profiles.length || equivalents.length !== profiles.length) throw new Error('Ongeldige veerlaag of aantal equivalente lagen.');
  const profile = profiles[layerIndex], equivalent = equivalents[layerIndex];
  if (zM < profile.topM || zM > profile.bottomM) throw new Error('De veerdiepte ligt buiten de geselecteerde grondlaag.');
  nonnegative(equivalent.topEquivalentM, 'Equivalente laagbovenkant');
  const equivalentDepthM = equivalent.topEquivalentM + zM - profile.topM;
  if (mode !== 'linear' && mode !== 'nonlinear') throw new Error('Onbekende analysekeuze.');
  return {
    equivalentDepthM,
    law: { kind: mode === 'linear' ? 'linear' : 'hyperbolic', initialKnM2: profile.initialKnM2, ultimateKnM: mode === 'linear' ? null : ultimateAtDepth(profile.ultimate, equivalentDepthM) },
  };
}
