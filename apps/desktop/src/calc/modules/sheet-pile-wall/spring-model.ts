// Verenmodel van de wand: een elastisch ondersteunde ligger met aan beide zijden grondveren die bij de
// neutrale gronddruk beginnen en begrensd zijn door de actieve en de passieve gronddruk.
//
// De ligger zelf wordt opgelost door de lineaire liggeroplosser van de module voor horizontaal belaste palen
// (beam.ts). Die kent per element een constante bedding en een constante lijnlast; daarmee wordt de
// tweezijdige, begrensde veer per element geschreven als "bedding + lijnlast" en itereert dit bestand over de
// toestand van elke veer (elastisch, actief of passief) tot die niet meer verandert.
//
// Tekens: z omlaag vanaf de bovenkant van de wand, verplaatsing y positief naar de lage zijde. De hoge zijde
// (links) duwt in +y, de lage zijde (rechts) in −y. Alles per strekkende meter wand: kN/m, kNm/m, kPa.
import { solveBeam, type BeamResult } from "../laterally-loaded-pile/beam";

export interface SideSpring {
  /** Neutrale korreldruk bij y = 0 [kPa]. */
  p0: number;
  /** Ondergrens (actief) en bovengrens (passief) van de korreldruk [kPa]. */
  pa: number;
  pp: number;
  /** Beddingsconstante [kN/m³]. */
  k: number;
}

export interface WallElement {
  topM: number;
  bottomM: number;
  left: SideSpring | null;
  right: SideSpring | null;
  /** Belasting die niet van de verplaatsing afhangt, positief naar de lage zijde [kPa] (waterdrukverschil). */
  loadKpa: number;
  /** Extra lineaire veer in dit element [kN/m²]: het anker of de stempel, uitgesmeerd over de elementlengte. */
  supportKnM2?: number;
}

export type SpringState = "elastic" | "active" | "passive";

export interface WallElementResult {
  yM: number;
  left: { state: SpringState; pressureKpa: number } | null;
  right: { state: SpringState; pressureKpa: number } | null;
  supportKnM: number;
}

export interface SpringWallResult {
  beam: BeamResult;
  elements: WallElementResult[];
  iterations: number;
  converged: boolean;
  /** Kracht die de veren boven hun grens zouden moeten leveren [kN/m]; vrijwel nul bij evenwicht. */
  excessKn: number;
}

/** Reststijfheid van een veer op zijn grens, als fractie van k: houdt het stelsel oplosbaar. */
const RESIDUAL = 1e-4;
const MAX_ITERATIONS = 200;

interface Linear { spring: number; load: number }

/** Lineair stuk van één veer: druk = load + spring·s·y, met s = −1 links en +1 rechts. */
function branch(side: SideSpring, state: SpringState, s: 1 | -1): Linear {
  if (state === "elastic" || side.k <= 0) return { spring: side.k, load: side.p0 };
  const limit = state === "active" ? side.pa : side.pp;
  // Vanaf de verplaatsing waarbij de grens wordt bereikt loopt de veer verder met de reststijfheid.
  const yLimit = (s * (limit - side.p0)) / side.k;
  return { spring: RESIDUAL * side.k, load: limit - RESIDUAL * side.k * s * yLimit };
}

function stateOf(side: SideSpring, y: number, s: 1 | -1): SpringState {
  const trial = side.p0 + side.k * s * y;
  return trial < side.pa - 1e-12 ? "active" : trial > side.pp + 1e-12 ? "passive" : "elastic";
}

/**
 * Lost de wand op. `elements` sluiten op elkaar aan van z = 0 tot de teen; elk element is één liggerelement.
 * Gooit een fout als de ligger niet oplosbaar is (geen steun).
 */
export function solveSpringWall(input: { lengthM: number; eiKnM2: number; elements: WallElement[]; headForceKn?: number; headMomentKnM?: number }): SpringWallResult {
  const { elements } = input, n = elements.length;
  let left: SpringState[] = elements.map(() => "elastic"), right: SpringState[] = elements.map(() => "elastic");
  let beam: BeamResult | null = null, mids: number[] = [], iterations = 0, converged = false;
  const solve = () => solveBeam({
    lengthM: input.lengthM, eiKnM2: input.eiKnM2, maxElementM: input.lengthM * 2, headForceKn: input.headForceKn ?? 0, headMomentKnM: input.headMomentKnM ?? 0,
    headFixedRotation: false, toeFixed: false,
    layers: elements.map((e, i) => {
      const l = e.left ? branch(e.left, left[i], -1) : { spring: 0, load: 0 }, r = e.right ? branch(e.right, right[i], 1) : { spring: 0, load: 0 };
      return { topM: e.topM, bottomM: e.bottomM, lineSpringKnM2: l.spring + r.spring + (e.supportKnM2 ?? 0), lineLoadKnM: l.load - r.load + e.loadKpa };
    }),
  });
  const seen = new Set<string>();
  for (; iterations < MAX_ITERATIONS;) {
    beam = solve(); iterations++;
    if (beam.nodes.length !== n + 1) throw new Error("Elementindeling van de wand sluit niet aan.");
    mids = elements.map((e, i) => {
      const a = beam!.nodes[i], b = beam!.nodes[i + 1], l = e.bottomM - e.topM;
      return (a.yM + b.yM) / 2 + (l * (a.rotationRad - b.rotationRad)) / 8;
    });
    const nextLeft = elements.map((e, i) => (e.left ? stateOf(e.left, mids[i], -1) : "elastic"));
    const nextRight = elements.map((e, i) => (e.right ? stateOf(e.right, mids[i], 1) : "elastic"));
    const changed = nextLeft.reduce((c, s, i) => c + Number(s !== left[i]) + Number(nextRight[i] !== right[i]), 0);
    if (changed === 0) { converged = true; break; }
    // Een toestand die terugkomt betekent een cyclus: dan wisselt per stap nog maar de helft van de veren.
    const key = nextLeft.join("") + "|" + nextRight.join("");
    if (seen.has(key)) {
      let skip = false;
      for (let i = 0; i < n; i++) {
        if (nextLeft[i] !== left[i]) { if (!skip) left[i] = nextLeft[i]; skip = !skip; }
        if (nextRight[i] !== right[i]) { if (!skip) right[i] = nextRight[i]; skip = !skip; }
      }
    } else { seen.add(key); left = nextLeft; right = nextRight; }
  }
  let excess = 0;
  const out: WallElementResult[] = elements.map((e, i) => {
    const y = mids[i], l = e.bottomM - e.topM;
    const side = (spring: SideSpring | null, s: 1 | -1) => {
      if (!spring) return null;
      const trial = spring.p0 + spring.k * s * y, pressure = Math.max(spring.pa, Math.min(spring.pp, trial));
      excess += RESIDUAL * Math.abs(trial - pressure) * l;
      return { state: stateOf(spring, y, s), pressureKpa: pressure };
    };
    return { yM: y, left: side(e.left, -1), right: side(e.right, 1), supportKnM: (e.supportKnM2 ?? 0) * y * l };
  });
  return { beam: beam!, elements: out, iterations, converged, excessKn: excess };
}
