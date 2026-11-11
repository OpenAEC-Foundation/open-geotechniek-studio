import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForceDiagrams, extremes, niceTicks } from './ForceDiagrams';
import { computeLateral, lateralExample } from './compute';
import { visibleSprings } from './LateralExplorer';
import { springStride } from './PileScene3D';

describe('diagrammen horizontale paal',()=>{
  it('kiest ronde schaalwaarden die nul en het bereik dekken',()=>{
    expect(niceTicks(-12,44)).toEqual([-20,0,20,40,60]);
    expect(niceTicks(0,12.8)).toEqual([0,5,10,15]);
    expect(niceTicks(-3.2,0)).toEqual([-4,-3,-2,-1,0]);
  });
  it('toont per grootheid eenheid, max en min met hun NAP-niveau en de tekens',()=>{
    const r=computeLateral(lateralExample);if(!r.ok)throw new Error(r.error);
    const {container}=render(<ForceDiagrams input={{...lateralExample,headNap:-1}} beam={r.beam}/>);
    const ext=extremes(r.beam.samples,p=>p.momentKnM);
    const moment=container.querySelector('.pile-diagram-M')!;
    expect(moment.getAttribute('aria-label')).toBe(`Buigend moment [kNm]: max ${ext.max.v.toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})} kNm, min ${ext.min.v.toLocaleString('nl-NL',{minimumFractionDigits:1,maximumFractionDigits:1})} kNm`);
    expect(moment.querySelectorAll('.pile-extreme')).toHaveLength(2);
    expect(moment.textContent).toContain(`NAP ${(-1-ext.max.z).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})}`);
    for(const unit of ['mm','kNm','kN','kN/m'])expect(screen.getAllByText(unit).length).toBeGreaterThan(0);
    expect(screen.getByText('m NAP')).toBeInTheDocument();
    expect(screen.getByText('kop -1,00')).toBeInTheDocument();
    // Arcering haaks op de paal, buigtekens bij het moment en afschuiftekens bij de dwarskracht.
    expect(container.querySelectorAll('.pile-diagram-M .pile-hatch line').length).toBeGreaterThan(50);
    expect(container.querySelectorAll('.pile-diagram-M .pile-bend-sign').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.pile-diagram-V .pile-shear-sign').length).toBeGreaterThan(0);
    expect(moment.textContent).toContain('getrokken zijde');
  });
});
describe('rustiger veren',()=>{
  it('tekent in 2D alleen veren met genoeg tussenruimte, en altijd de geselecteerde',()=>{
    const r=computeLateral(lateralExample);if(!r.ok)throw new Error(r.error);
    const y=(z:number)=>65+490*z/lateralExample.lengthM;
    const shown=visibleSprings(r.springs,y,r.springs[5].id);
    expect(shown.length).toBeLessThan(r.springs.length/2);
    expect(shown.map(s=>s.id)).toContain(r.springs[5].id);
  });
  it('toont in 3D meer veren naarmate je inzoomt',()=>{
    expect(springStride(96,10,10)).toBe(8);
    expect(springStride(96,10,5)).toBe(4);
    expect(springStride(96,10,1)).toBe(1);
    expect(springStride(96,10,40)).toBe(8);
  });
});
describe('moment aan de getrokken zijde',()=>{
  it('tekent een positief moment links van de nullijn, met de echte waarde in het label',()=>{
    const r=computeLateral({...lateralExample,headMomentKnM:0,analysisMode:'linear',layerCorrection:'none'});if(!r.ok)throw new Error(r.error);
    const {container}=render(<ForceDiagrams input={lateralExample} beam={r.beam}/>);
    const zero=Number(container.querySelector('.pile-diagram-M .pile-zero')!.getAttribute('x1'));
    const ext=extremes(r.beam.samples,p=>p.momentKnM);
    expect(ext.max.v).toBeGreaterThan(0);
    const maxDot=container.querySelector('.pile-diagram-M .pile-extreme-max circle')!;
    expect(Number(maxDot.getAttribute('cx'))).toBeLessThan(zero);
  });
});

