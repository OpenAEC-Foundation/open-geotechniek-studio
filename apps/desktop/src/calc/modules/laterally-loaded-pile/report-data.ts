// Alle tabellen van de uitgebreide uitdraai horizontale paal, één keer
// berekend en gedeeld door het rekenblad op het scherm en het PDF-rapport.
import type { LateralInput, LateralResult } from './compute';
import { SOIL_SPRINGS } from './soil';
import { sectionCapacity } from './section';
import { mobilisation } from './SpringField';
import { valueAt } from './ForceDiagrams';

type Ok = Extract<LateralResult, { ok: true }>;

/** Laagkleuren: zand geel, klei groen, veen bruin, eigen waarde grijs. */
export function soilColor(springId: string): { fill: string; rgb: [number, number, number]; name: string } {
  if (springId.startsWith('sand')) return { fill: '#f1d78a', rgb: [241, 215, 138], name: 'zand' };
  if (springId.startsWith('clay')) return { fill: '#a9cf8f', rgb: [169, 207, 143], name: 'klei' };
  if (springId.startsWith('peat')) return { fill: '#b08c64', rgb: [176, 140, 100], name: 'veen' };
  return { fill: '#c9cbcf', rgb: [201, 203, 207], name: 'eigen waarde' };
}
export const soilLabel = (id: string) => id === 'manual' ? 'Eigen waarde' : SOIL_SPRINGS.find((v) => v.id === id)?.label ?? id;

export interface LayerRow {
  index: number; topNap: number; bottomNap: number; thicknessM: number; springId: string; label: string; color: string; rgb: [number, number, number];
  khKnM3: number; source: string; k0KnM2: number; ultimate: string | null; puTop: number | null; puBottom: number | null;
  frictionDeg: number; ka: number; lineLoadKnM: number; zeqTop: number; zeqBottom: number; cumulativeKn: number | null;
  // Uitkomsten per laag
  springs: number; yMaxMm: number; pMaxKnM: number; resultantKn: number; mobMax: number | null; secantRatioMin: number;
}
export interface DepthRow { z: number; nap: number; yMm: number; rotMrad: number; mKnM: number; vKn: number; pKnM: number }

export function lateralReportData(input: LateralInput, r: Ok) {
  const head = input.headNap ?? 0, nonlinear = r.analysisMode === 'nonlinear' || input.layerCorrection === 'georgiadis';
  const layers: LayerRow[] = input.layers.map((l, k) => {
    const res = r.resolvedLayers.find((x) => x.topM === l.topM && x.bottomM === l.bottomM && x.springId === l.springId) ?? r.resolvedLayers[k];
    const eq = r.layering[k];
    const own = r.springs.filter((s) => s.layerIndex === k);
    const pu = (zeq: number) => l.ultimate ? Math.min(l.ultimate.capKnM, l.ultimate.atSurfaceKnM + l.ultimate.gradientKnM2 * zeq) : null;
    const mobs = own.map(mobilisation).filter((m): m is number => m !== null);
    const color = soilColor(l.springId);
    return {
      index: k + 1, topNap: head - l.topM, bottomNap: head - l.bottomM, thicknessM: l.bottomM - l.topM, springId: l.springId, label: soilLabel(l.springId),
      color: color.fill, rgb: color.rgb,
      khKnM3: res.khKnM3, source: l.springId === 'manual' ? 'projectwaarde' : `CUR166 tabel 3.3, ${input.scenario === 'low' ? 'laag' : 'hoog'} gemiddelde`,
      k0KnM2: res.lineSpringKnM2,
      ultimate: nonlinear && l.ultimate ? `min(${l.ultimate.capKnM}; ${l.ultimate.atSurfaceKnM} + ${l.ultimate.gradientKnM2}·zeq)` : null,
      puTop: nonlinear ? pu(eq.topEquivalentM) : null, puBottom: nonlinear ? pu(eq.bottomEquivalentM) : null,
      frictionDeg: l.frictionDeg, ka: res.ka, lineLoadKnM: res.lineLoadKnM,
      zeqTop: eq.topEquivalentM, zeqBottom: eq.bottomEquivalentM, cumulativeKn: nonlinear ? eq.cumulativeUltimateKn : null,
      springs: own.length,
      yMaxMm: Math.max(0, ...own.map((s) => Math.abs(s.displacementM) * 1000)),
      pMaxKnM: Math.max(0, ...own.map((s) => Math.abs(s.resistanceKnM))),
      // Kracht die de laag op de paal zet: −Σ p·Δz (reactie tegen de verplaatsing in).
      resultantKn: -own.reduce((a, s) => a + s.resistanceKnM * s.tributaryLengthM, 0),
      mobMax: mobs.length ? Math.max(...mobs) : null,
      secantRatioMin: own.length ? Math.min(...own.map((s) => s.initialKnM2 > 0 ? s.secantKnM2 / s.initialKnM2 : 1)) : 1,
    };
  });

  // Verloop over de diepte op een vaste stap, inclusief kop en punt.
  const L = input.lengthM, step = L <= 8 ? .25 : L <= 20 ? .5 : 1;
  const samples = [...r.beam.samples].sort((a, b) => a.zM - b.zM), nodes = r.beam.nodes;
  const rot = (z: number) => { const k = nodes.findIndex((n) => n.zM >= z); if (k <= 0) return nodes[Math.max(0, k)].rotationRad; const a = nodes[k - 1], b = nodes[k]; return a.rotationRad + (z - a.zM) / (b.zM - a.zM) * (b.rotationRad - a.rotationRad); };
  const zs: number[] = []; for (let z = 0; z < L - 1e-9; z += step) zs.push(+z.toFixed(6)); zs.push(L);
  const depth: DepthRow[] = zs.map((z) => ({ z, nap: head - z, yMm: valueAt(samples, (p) => p.yM * 1000, z), rotMrad: rot(z) * 1000,
    mKnM: valueAt(samples, (p) => p.momentKnM, z), vKn: valueAt(samples, (p) => p.shearKn, z), pKnM: valueAt(samples, (p) => p.reactionKnM, z) }));

  // N–M-interactie: MRd over het bereik van N, met het ontwerppunt.
  let nm: Array<{ n: number; m: number }> = [];
  try {
    const c0 = sectionCapacity(input.section, 0), lo = c0.nMinKn, hi = c0.nMaxKn;
    nm = Array.from({ length: 41 }, (_, k) => lo + (hi - lo) * (0.005 + 0.99 * k / 40)).map((n) => ({ n, m: sectionCapacity(input.section, n).mRdKnM }));
  } catch { nm = []; }

  const soilForce = layers.reduce((a, l) => a + l.resultantKn, 0);
  return { head, layers, depth, step, nm, soilForce, nonlinear };
}
