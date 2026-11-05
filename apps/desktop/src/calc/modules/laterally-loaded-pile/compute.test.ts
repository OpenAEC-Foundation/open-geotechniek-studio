import { expect, it } from 'vitest';
import { computeLateral, lateralExample } from './compute';
it('berekent zelfstandige horizontale respons met materiaal-EI en N-M-toets',()=>{
  const r=computeLateral(lateralExample);
  expect(r.ok).toBe(true);
  if(r.ok) {expect(r.maxMomentKnM).toBeGreaterThan(0);expect(r.section.eiKnM2).toBeGreaterThan(0);expect(Math.abs(r.beam.forceResidualKn)).toBeLessThan(.001);}
});
it('weigert stilzwijgende omzetting van q op vrijstaande palen',()=>{
  const r=computeLateral({...lateralExample,surchargeKpa:20,surchargeMode:'unresolved'});
  expect(r.ok).toBe(false);
  if(!r.ok)expect(r.error).toMatch(/bovenbelasting/i);
});
it('laat q met expliciete kerende invloedbreedte meetellen en toont beperkingen',()=>{
  const a=computeLateral(lateralExample),b=computeLateral({...lateralExample,surchargeKpa:20,surchargeMode:'retaining' as const});
  expect(b.ok).toBe(true);
  if(a.ok&&b.ok)expect(b.maxMomentKnM).toBeGreaterThan(a.maxMomentKnM);
});
it('weigert lege en niet-eindige grond- of belastingsinvoer',()=>{
  expect(computeLateral({...lateralExample,layers:[]}).ok).toBe(false);
  expect(computeLateral({...lateralExample,surchargeKpa:NaN}).ok).toBe(false);
});
it('behoudt lineair gedrag van oude projecten en kiest expliciet niet-lineair voor nieuwe voorbeelden',()=>{
  const legacy={...lateralExample,analysisMode:undefined,layerCorrection:undefined,layers:lateralExample.layers.map(l=>({...l,ultimate:undefined}))};
  const a=computeLateral(legacy),b=computeLateral({...lateralExample,analysisMode:'linear'}),c=computeLateral(lateralExample);
  expect(a.ok&&b.ok&&c.ok).toBe(true);
  if(a.ok&&b.ok&&c.ok){expect(a.analysisMode).toBe('linear');expect(a.maxDisplacementMm).toBeCloseTo(b.maxDisplacementMm,8);expect(c.analysisMode).toBe('nonlinear');expect(c.springs.length).toBeGreaterThan(0);expect(c.convergence.converged).toBe(true);}
});
it('weigert niet-lineaire berekening zonder expliciete grensweerstand',()=>{
  const r=computeLateral({...lateralExample,layers:lateralExample.layers.map(l=>({...l,ultimate:undefined}))});
  expect(r.ok).toBe(false);if(!r.ok)expect(r.error).toMatch(/grensweerstand/i);
});
it('toont ook bij grove elementen de werkelijke begrensde grondreactie',()=>{
 const r=computeLateral({...structuredClone(lateralExample),maxElementM:4,headForceKn:400,headMomentKnM:0});
 expect(r.ok).toBe(true);
 if(r.ok){const top=r.beam.samples.find(s=>s.zM===0)!;expect(top.reactionKnM).toBeGreaterThanOrEqual(-30-1e-8);expect(top.reactionKnM).toBeCloseTo(-30*Math.tanh(800*top.yM/30),8);}
});
it('laat een ongeldig niet-toegepast pu-profiel lineair rekenen zonder laagcorrectie niet blokkeren',()=>{
 const r=computeLateral({...lateralExample,analysisMode:'linear',layerCorrection:'none',layers:lateralExample.layers.map(l=>({...l,ultimate:{atSurfaceKnM:NaN,gradientKnM2:NaN,capKnM:NaN}}))});
 expect(r.ok).toBe(true);
});
