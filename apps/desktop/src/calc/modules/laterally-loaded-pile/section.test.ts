import { describe, expect, it } from 'vitest';
import { sectionStiffness, sectionCapacity, type PileSection } from './section';
const concrete: PileSection = { kind:'concrete-square', diameterMm:400, wallMm:12,
  concreteEMpa:30000, steelEMpa:210000, rebarEMpa:200000, concreteFactor:1,
  creepCoefficient:0, tubeParticipates:false, barCount:4, barDiameterMm:20,
  coverToBarCentreMm:50, fckMpa:30, fcdMpa:20, fydMpa:435, tubeFydMpa:355 };
describe('Materiaalafhankelijke paaldoorsnede', () => {
  it('telt staal dat beton vervangt zonder dubbel beton mee', () => {
    expect(sectionStiffness({...concrete,barCount:0}).eiKnM2).toBeCloseTo(64000,6);
    expect(sectionStiffness(concrete).eiKnM2).toBeCloseTo(68811.9767,2);
  });
  it('onderscheidt een buis, een samenwerkende kern en een mantelbuis', () => {
    const tube={...concrete,kind:'steel-tube' as const,diameterMm:600,barCount:0};
    expect(sectionStiffness(tube).eiKnM2).toBeCloseTo(201267.3125,2);
    const filled={...tube,kind:'filled-tube' as const,tubeParticipates:true};
    expect(sectionStiffness(filled).eiKnM2).toBeCloseTo(363366.5927,2);
    expect(sectionStiffness({...filled,tubeParticipates:false}).eiKnM2).toBeCloseTo(162099.2802,2);
    expect(sectionStiffness({...filled,creepCoefficient:1}).eiKnM2).toBeCloseTo(282316.9526,2);
  });
  it('bepaalt M-weerstand bij N en niet alleen bij zuivere buiging', () => {
    const a=sectionCapacity(concrete,0), b=sectionCapacity(concrete,500);
    expect(a.mRdKnM).toBeGreaterThan(80);
    expect(b.mRdKnM).toBeGreaterThan(a.mRdKnM);
    expect(Math.abs(b.nResidualKn)).toBeLessThan(.001);
    expect(() => sectionCapacity(concrete,1e6)).toThrow(/normaalkracht/i);
  });
  it('benadert een gesloten parabool-rechthoekoplossing bij neutrale as op halve hoogte',()=>{
    const x=.2,b=.4,fc=20000,a=.002/.0035,abar=Math.PI*.02**2/4;
    const nc=b*fc*x*(1-a/3), mc=b*fc*(.2*x*(1-a/3)-x*x*(.5-a/3+a*a/12));
    const n=nc-2*abar*fc;
    const m=mc+(2*abar*(435000-fc)+2*abar*435000)*.15;
    expect(sectionCapacity(concrete,n).mRdKnM).toBeCloseTo(m,2);
  });
  it('benadert het plastische moment van een stalen buis onafhankelijk', () => {
    const tube={...concrete,kind:'steel-tube' as const,diameterMm:600,barCount:0};
    const z=(.6**3-.576**3)/6;
    expect(sectionCapacity(tube,0).mRdKnM).toBeCloseTo(z*355000,0);
    expect(Math.abs(sectionCapacity(tube,503).nResidualKn)).toBeLessThan(.001);
  });
  it('weigert niet-eindige gegevens en staven buiten de betonkern', () => {
    expect(() => sectionStiffness({...concrete,concreteEMpa:NaN})).toThrow();
    expect(() => sectionStiffness({...concrete,wallMm:350,kind:'steel-tube'})).toThrow();
    expect(() => sectionStiffness({...concrete,coverToBarCentreMm:2})).toThrow();
    expect(() => sectionStiffness({...concrete,barCount:3})).toThrow();
    expect(() => sectionStiffness({...concrete,fcdMpa:55})).toThrow();
  });
});
