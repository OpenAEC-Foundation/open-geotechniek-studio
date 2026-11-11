import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LateralExplorer } from './LateralExplorer';
import { SpringInspector } from './SpringInspector';
import { computeLateral, lateralExample } from './compute';
import type { SpringState } from './spring-types';

// The browser owns WebGL; selection and all numerical inspection stay real.
vi.mock('./PileScene3D', () => ({ PileScene3D: () => null }));
const first:SpringState={id:'element-0-gauss-0',elementIndex:0,gaussIndex:0,layerIndex:0,zM:.25,equivalentDepthM:.4,
  displacementM:.002,tributaryLengthM:.1,initialKnM2:1000,ultimateKnM:10,mode:'nonlinear',correction:'georgiadis',
  modelLabel:'Hyperbolisch projectmodel',source:'Projectinvoer',formula:'p = pu tanh(k0 y / pu)',
  resistanceKnM:1.97,tangentKnM2:961,secantKnM2:985,curvePoints:[{yM:-.01,pKnM:-7.616},{yM:0,pKnM:0},{yM:.01,pKnM:7.616}]};
const second:SpringState={...first,id:'element-1-gauss-2',elementIndex:1,gaussIndex:2,zM:.8,equivalentDepthM:.9,displacementM:.004,resistanceKnM:3.8};
function result() {
  const r=computeLateral(lateralExample);
  if(!r.ok)throw new Error(r.error);
  return {...r,springs:[first,second],analysisMode:'nonlinear' as const,layering:[],
    convergence:{converged:true as const,iterations:4,loadSteps:3,residualKn:1e-9,relativeResidual:1e-10}};
}
describe('Veerinspectie',()=>{
  it('houdt selectie van een werkelijk modelpunt en de dieptelijst gelijk',()=>{
    render(<LateralExplorer input={lateralExample} result={result()}/>);
    fireEvent.click(screen.getByRole('tab',{name:'Rekenmodel'}));
    fireEvent.click(screen.getByRole('button',{name:`Selecteer veer ${second.id}`}));
    expect(screen.getByRole('combobox',{name:'Grondveer op diepte'})).toHaveValue(second.id);
    expect(within(screen.getByRole('region',{name:'Veerinspectie'})).getByText(second.id)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Grondveer op diepte'}),{target:{value:first.id}});
    expect(screen.getByRole('button',{name:`Selecteer veer ${first.id}`})).toHaveAttribute('aria-pressed','true');
  });
  it('verwijdert model en werkpunt zodra de berekening ongeldig wordt',()=>{
    const {rerender}=render(<LateralExplorer input={lateralExample} result={result()}/>);
    rerender(<LateralExplorer input={lateralExample} result={{ok:false,error:'Geen convergentie'}}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('Geen convergentie');
    expect(screen.queryByRole('region',{name:'Veerinspectie'})).not.toBeInTheDocument();
  });
  it('toont solverwaarden en zet alleen de horizontale curve-as om naar mm',()=>{
    render(<SpringInspector spring={first}/>);
    const curve=screen.getByLabelText('p-y-curve');
    expect(curve).toHaveTextContent('y [mm]');
    expect(curve).toHaveTextContent('p [kN/m]');
    expect(screen.getByRole('table',{name:'Curvepunten'})).toHaveTextContent('-10');
    expect(screen.getByRole('table',{name:'Curvepunten'})).toHaveTextContent('-7,616');
    expect(screen.getByText('961 kN/m²')).toBeInTheDocument();
    expect(screen.getByText('985 kN/m²')).toBeInTheDocument();
    expect(screen.getByText('0,4 m')).toBeInTheDocument();
    expect(screen.getByLabelText('Werkpunt')).toHaveAttribute('data-y-mm','2');
    expect(screen.getByLabelText('Werkpunt')).toHaveAttribute('data-p-kn-m','1.97');
  });
});
