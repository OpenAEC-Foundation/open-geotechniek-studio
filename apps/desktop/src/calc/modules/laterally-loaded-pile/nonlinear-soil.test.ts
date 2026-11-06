import { describe, expect, it } from 'vitest';
import { evaluateSpring, equivalentLayers, integratedUltimate, springLawAtDepth, ultimateAtDepth } from './nonlinear-soil';
import type { SoilSpringProfile, UltimateProfile } from './spring-types';
const u: UltimateProfile = { atSurfaceKnM: 10, gradientKnM2: 5, capKnM: 30 };
const layer = (topM:number,bottomM:number,ultimate:UltimateProfile=u):SoilSpringProfile => ({topM,bottomM,initialKnM2:1000,ultimate});
describe('project spring law', () => {
  const law = {kind:'hyperbolic' as const,initialKnM2:1000,ultimateKnM:100};
  it('has finite initial stiffness at zero and odd bounded resistance', () => {
    expect(evaluateSpring(law,0)).toEqual({resistanceKnM:0,tangentKnM2:1000,secantKnM2:1000});
    const r=evaluateSpring(law,0.08), n=evaluateSpring(law,-0.08);
    expect(r.resistanceKnM).toBeCloseTo(66.4036770268,9);
    expect(n.resistanceKnM).toBeCloseTo(-r.resistanceKnM,12);
    expect(n.tangentKnM2).toBeCloseTo(r.tangentKnM2,12);
    expect(r.secantKnM2).toBeCloseTo(r.resistanceKnM/0.08,12);
    const h=1e-7;
    expect(r.tangentKnM2).toBeCloseTo((evaluateSpring(law,0.08+h).resistanceKnM-evaluateSpring(law,0.08-h).resistanceKnM)/(2*h),5);
    expect(evaluateSpring(law,1000).resistanceKnM).toBeLessThanOrEqual(100);
    expect(evaluateSpring(law,1000).tangentKnM2).toBeGreaterThanOrEqual(0);
  });
  it('keeps linear response uncapped and independent of ultimate strength', () => {
    for(const ultimateKnM of [null,1]) expect(evaluateSpring({kind:'linear',initialKnM2:1000,ultimateKnM},2)).toEqual({resistanceKnM:2000,tangentKnM2:1000,secantKnM2:1000});
  });
  it('allows a zero-strength spring and rejects invalid parameters', () => {
    expect(evaluateSpring({...law,ultimateKnM:0},0.1)).toEqual({resistanceKnM:0,tangentKnM2:0,secantKnM2:0});
    for(const invalid of [{...law,initialKnM2:-1},{...law,ultimateKnM:null},{...law,ultimateKnM:NaN}]) expect(()=>evaluateSpring(invalid,0)).toThrow();
    expect(()=>evaluateSpring(law,Infinity)).toThrow();
  });
});
describe('ultimate profile', () => {
  it('integrates rising and capped branches exactly', () => {
    expect(ultimateAtDepth(u,2)).toBe(20);
    expect(ultimateAtDepth(u,10)).toBe(30);
    expect(integratedUltimate(u,2)).toBe(30);
    expect(integratedUltimate(u,6)).toBe(140);
    expect(integratedUltimate({atSurfaceKnM:7,gradientKnM2:0,capKnM:10},3)).toBe(21);
  });
  it('rejects negative depths and invalid profiles', () => {
    for(const invalid of [{...u,atSurfaceKnM:-1},{...u,gradientKnM2:Infinity},{...u,capKnM:0},{...u,atSurfaceKnM:31}]) {
      expect(()=>ultimateAtDepth(invalid,1)).toThrow();
      expect(()=>integratedUltimate(invalid,1)).toThrow();
    }
    expect(()=>integratedUltimate(u,-1)).toThrow();
    expect(()=>ultimateAtDepth(u,NaN)).toThrow();
  });
});
describe('equivalent depths', () => {
  it('preserves identical contiguous layers below a free head', () => {
    const e=equivalentLayers([layer(3,5),layer(5,8),layer(8,10)],'georgiadis');
    expect(e.map(x=>x.topEquivalentM)).toEqual([0,2,5]);
    expect(e.map(x=>x.bottomEquivalentM)).toEqual([2,5,7]);
    expect(e[2].cumulativeUltimateKn).toBe(170);
  });
  it('balances strong-over-weak and weak-over-strong layers', () => {
    const p=[layer(0,2,{atSurfaceKnM:40,gradientKnM2:0,capKnM:40}),layer(2,4,{atSurfaceKnM:10,gradientKnM2:0,capKnM:10}),layer(4,7,{atSurfaceKnM:20,gradientKnM2:0,capKnM:20})];
    expect(equivalentLayers(p,'georgiadis')).toEqual([{topEquivalentM:0,bottomEquivalentM:2,cumulativeUltimateKn:80},{topEquivalentM:8,bottomEquivalentM:10,cumulativeUltimateKn:100},{topEquivalentM:5,bottomEquivalentM:8,cumulativeUltimateKn:160}]);
  });
  it('conserves integrated force with shifted depth-dependent capped profiles', () => {
    const p=[layer(0,2),layer(2,5,{atSurfaceKnM:0,gradientKnM2:2,capKnM:8}),layer(5,9,{atSurfaceKnM:5,gradientKnM2:3,capKnM:40})];
    const e=equivalentLayers(p,'georgiadis');
    expect(e[1].topEquivalentM).toBeCloseTo(5.75,12);
    expect(e[1].cumulativeUltimateKn).toBeCloseTo(54,12);
    expect(e[2].topEquivalentM).toBeCloseTo((-5+Math.sqrt(349))/3,12);
  });
  it('omits gaps from resistance and uses ground-relative depth without correction', () => {
    const p=[layer(3,5),layer(7,9)];
    expect(equivalentLayers(p,'georgiadis')[1].topEquivalentM).toBeCloseTo(2,12);
    const e=equivalentLayers(p,'none');
    expect(e[1].topEquivalentM).toBe(4);
    expect(e[1].cumulativeUltimateKn).toBe(90);
    expect(springLawAtDepth(p,e,1,8,'nonlinear')).toEqual({equivalentDepthM:5,law:{kind:'hyperbolic',initialKnM2:1000,ultimateKnM:30}});
    expect(()=>springLawAtDepth(p,e,1,6,'nonlinear')).toThrow();
  });
  it('shifts ultimate depth while keeping initial stiffness constant', () => {
    const p=[layer(0,2),layer(2,4,{atSurfaceKnM:2,gradientKnM2:0,capKnM:2})],e=equivalentLayers(p,'georgiadis');
    expect(springLawAtDepth(p,e,1,3,'nonlinear')).toEqual({equivalentDepthM:16,law:{kind:'hyperbolic',initialKnM2:1000,ultimateKnM:2}});
    expect(springLawAtDepth(p,e,1,3,'linear').law).toEqual({kind:'linear',initialKnM2:1000,ultimateKnM:null});
  });
  it('rejects overlaps and impossible zero-strength equivalence', () => {
    expect(()=>equivalentLayers([layer(0,3),layer(2,4)],'georgiadis')).toThrow(/overlap/i);
    expect(()=>equivalentLayers([layer(0,3),layer(3,4,{atSurfaceKnM:0,gradientKnM2:0,capKnM:10})],'georgiadis')).toThrow(/zero|nul/i);
    expect(()=>equivalentLayers([layer(0,Infinity)],'none')).toThrow();
    expect(()=>equivalentLayers([layer(0,0)],'none')).toThrow();
  });
});
