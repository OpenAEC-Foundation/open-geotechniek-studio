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
