import { describe, expect, it } from 'vitest';
import { solveBeam, type BeamInput } from './beam';

const cantilever: BeamInput = {
  lengthM: 6, eiKnM2: 30000, maxElementM: .5,
  headForceKn: 100, headMomentKnM: 0, headFixedRotation: false,
  toeFixed: true, layers: [],
};
describe('Ligger op horizontale veren', () => {
  it('vindt de analytische doorbuiging van een grondloze uitkraging', () => {
    const r = solveBeam(cantilever);
    expect(r.nodes[0].yM).toBeCloseTo(100 * 6 ** 3 / (3 * 30000), 9);
    expect(r.nodes[0].rotationRad).toBeCloseTo(-100 * 6 ** 2 / (2 * 30000), 9);
    expect(r.forceResidualKn).toBeCloseTo(0, 7);
    expect(r.momentResidualKnM).toBeCloseTo(0, 7);
  });
  it('neemt een zelfstandig kopmoment mee met expliciete rotatieconventie', () => {
    const r = solveBeam({ ...cantilever, headForceKn: 0, headMomentKnM: 80 });
    expect(r.nodes[0].yM).toBeCloseTo(-80 * 6 ** 2 / (2 * 30000), 9);
    expect(r.nodes[0].rotationRad).toBeCloseTo(80 * 6 / 30000, 9);
  });
  it('integreert verdeelde last en voldoet aan het globale evenwicht', () => {
    const r = solveBeam({ ...cantilever, headForceKn: 0,
      layers: [{ topM: 0, bottomM: 6, lineSpringKnM2: 0, lineLoadKnM: 10 }] });
    expect(r.nodes[0].yM).toBeCloseTo(10 * 6 ** 4 / (8 * 30000), 8);
    expect(r.forceResidualKn).toBeCloseTo(0, 7);
    expect(r.momentResidualKnM).toBeCloseTo(0, 7);
  });
  it('laat een vrije paal door uitsluitend grondveren dragen', () => {
    const r = solveBeam({ ...cantilever, toeFixed: false,
      layers: [{ topM: 0, bottomM: 6, lineSpringKnM2: 5000, lineLoadKnM: 0 }] });
    expect(r.nodes[0].yM).toBeGreaterThan(0);
    expect(r.nodes[0].yM).toBeLessThan(.24);
    expect(r.forceResidualKn).toBeCloseTo(0, 7);
    expect(r.momentResidualKnM).toBeCloseTo(0, 7);
    expect(r.toeReactionKn).toBe(0);
  });
  it('maakt exact knopen op laaggrenzen en convergeert bij netverfijning', () => {
    const input = { ...cantilever, toeFixed: false, layers: [
      { topM: 1.13, bottomM: 3.17, lineSpringKnM2: 2000, lineLoadKnM: 5 },
      { topM: 3.17, bottomM: 6, lineSpringKnM2: 9000, lineLoadKnM: 0 },
    ] };
    const a = solveBeam(input), b = solveBeam({ ...input, maxElementM: .25 });
    expect(a.nodes.some(n => n.zM === 1.13)).toBe(true);
    expect(a.nodes.some(n => n.zM === 3.17)).toBe(true);
    expect(Math.abs(a.nodes[0].yM / b.nodes[0].yM - 1)).toBeLessThan(.001);
  });
  it('weigert instabiliteit en ongeldige of overlappende lagen', () => {
    expect(() => solveBeam({ ...cantilever, toeFixed: false })).toThrow(/instabiel/i);
    expect(() => solveBeam({ ...cantilever, eiKnM2: NaN })).toThrow();
    expect(() => solveBeam({ ...cantilever, maxElementM: 0 })).toThrow();
    expect(() => solveBeam({ ...cantilever, layers: [
      { topM: 0, bottomM: 4, lineSpringKnM2: 1, lineLoadKnM: 0 },
      { topM: 3, bottomM: 6, lineSpringKnM2: 1, lineLoadKnM: 0 },
    ] })).toThrow(/overlap/i);
  });
  it('vindt een momentpiek tussen de vaste grafiekpunten',()=>{
    const r=solveBeam({...cantilever,lengthM:1,maxElementM:1,eiKnM2:100,headForceKn:-4.375,
      layers:[{topM:0,bottomM:1,lineSpringKnM2:0,lineLoadKnM:10}]});
    expect(Math.max(...r.samples.map(p=>Math.abs(p.momentKnM)))).toBeCloseTo(.95703125,10);
    expect(r.samples.some(p=>Math.abs(p.zM-.4375)<1e-9)).toBe(true);
  });
});
