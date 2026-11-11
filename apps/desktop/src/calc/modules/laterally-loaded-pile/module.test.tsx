import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { laterallyLoadedPileModule as module } from './module';
import { computeLateral, lateralExample } from './compute';
it('heeft eigen materiaal- en maaiveldinvoer en bewaart wijzigingen',()=>{
  const onChange=vi.fn(), result=computeLateral(lateralExample);
  render(<module.InputPanel input={lateralExample} result={result} onChange={onChange}/>);
  fireEvent.click(screen.getByRole('radio',{name:'Buis gevuld'}));
  expect(onChange.mock.lastCall?.[0].section.kind).toBe('filled-tube');
  expect(screen.getByLabelText('Moment op de kop [kNm]')).toBeInTheDocument();
  expect(screen.getByLabelText('Bovenbelasting [kPa]')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Analyse grondveren'),{target:{value:'linear'}});
  expect(onChange.mock.lastCall?.[0].analysisMode).toBe('linear');
  expect(screen.getByLabelText('Laagcorrectie')).toBeInTheDocument();
});
it('zet de uitdraai op papier met resultaten per niveau, doorsnedetoets en conclusie',()=>{
  const input={...lateralExample,headNap:-1},r=computeLateral(input);if(!r.ok)throw new Error(r.error);
  render(<module.ResultPanel input={input} result={r}/>);
  for(const h of ['Uitgangspunten','Paaldoorsnede','Grondopbouw','Buigstijfheid','Resultaten','Grondreactie per laag','Verloop over de diepte','Doorsnedetoets N–M','Conclusie'])expect(screen.getByRole('heading',{name:h})).toBeInTheDocument();
  expect(screen.getByText('NAP -13,00 m')).toBeInTheDocument();
  expect(screen.getByRole('table',{name:'Resultaten met niveau'})).toHaveTextContent('Moment M [kNm]');
  expect(screen.getByText(/De doorsnede (voldoet|voldoet niet)/)).toBeInTheDocument();
  expect(screen.getByText(/Niet getoetst: dwarskracht, scheurwijdte/)).toBeInTheDocument();
  expect(screen.getByText(/referentiegevallen hebben numerieke broninvoer/)).toBeInTheDocument();
  // Grondlagen met kleur en toegekende eigenschappen; grondkrachten in evenwicht met H.
  const soil=screen.getByRole('table',{name:'Grondlagen met toegekende eigenschappen'});
  expect(soil.querySelectorAll('.lateral-swatch')).toHaveLength(2);
  expect(soil).toHaveTextContent('CUR166 tabel 3.3');
  const sum=screen.getByRole('table',{name:'Grondreactie per laag'}).querySelector('.lateral-sum')!;
  expect(Math.abs(Number(sum.querySelector('.num')!.textContent!.replace(',','.')))).toBeLessThan(1e-2);
  expect(screen.getByRole('table',{name:'Verloop over de diepte'}).querySelectorAll('tbody tr').length).toBe(25);
  expect(screen.getByRole('img',{name:/N–M-interactiekromme/})).toBeInTheDocument();
});
it('maakt een PDF-rapport met dezelfde onderdelen en kernuitkomsten voor de chips',()=>{
  const input={...lateralExample,headNap:-1},r=computeLateral(input);if(!r.ok)throw new Error(r.error);
  const meta={title:'Proef',client:'',location:'',project_number:'7',author:'',date:'2026-11-06'};
  const text=new TextDecoder('latin1').decode(module.buildReport!(input,r,{cpts:new Map(),activeCptId:null,projectMeta:meta}));
  for(const t of ['1. Uitgangspunten','2. Paaldoorsnede','3. Grondopbouw','4. Resultaten','5. Grondreactie per laag','6. Verloop over de diepte','7. Doorsnedetoets N-M','8. Conclusie','Moment M [kNm]','NAP -13,00','getrokken zijde','CUR166 tabel 3.3'])expect(text).toContain(t);
  const checks=module.checks!(input,r);
  expect(checks.map(c=>c.label)).toEqual(['y kop','M max','V max','doorsnede']);
  expect(module.statusLine!(r).text).toMatch(/^u\.c\. /);
});

describe('invoer in rekenbladstijl',()=>{
  const setup=(input=lateralExample)=>{const onChange=vi.fn();render(<module.InputPanel input={input} result={computeLateral(input)} onChange={onChange}/>);return onChange;};
  it('rekent niveaus in m NAP om naar diepte vanaf de kop en schuift de onderste laag mee',()=>{
    const onChange=setup({...lateralExample,headNap:-1});
    expect(screen.getByLabelText('Paalpunt [m NAP]')).toHaveValue('-13');
    expect(screen.getByLabelText('Onderkant laag 1 [m NAP]')).toHaveValue('-5');
    fireEvent.change(screen.getByLabelText('Paalpunt [m NAP]'),{target:{value:'-15'}}); fireEvent.blur(screen.getByLabelText('Paalpunt [m NAP]'));
    const next=onChange.mock.lastCall![0];
    expect(next.lengthM).toBe(14);
    expect(next.layers.map((l:{topM:number;bottomM:number})=>[l.topM,l.bottomM])).toEqual([[0,4],[4,14]]);
    fireEvent.change(screen.getByLabelText('Bovenkant laag 2 [m NAP]'),{target:{value:'-6'}}); fireEvent.blur(screen.getByLabelText('Bovenkant laag 2 [m NAP]'));
    expect(onChange.mock.lastCall![0].layers[1].topM).toBe(5);
  });
  it('meldt dat de paalkop is aangenomen als die nog ontbreekt',()=>{
    setup();
    expect(screen.getByText(/Paalkop op NAP 0,00 aangenomen/)).toBeInTheDocument();
  });
  it('kort lagen in bij een kortere paal en houdt de berekening geldig',()=>{
    const onChange=setup();
    fireEvent.change(screen.getByLabelText('Paalpunt [m NAP]'),{target:{value:'-3'}}); fireEvent.blur(screen.getByLabelText('Paalpunt [m NAP]'));
    const next=onChange.mock.lastCall![0];
    expect(next.layers).toHaveLength(1);
    expect(next.layers[0]).toMatchObject({topM:0,bottomM:3});
    expect(computeLateral(next).ok).toBe(true);
  });
  it('tekent de doorsnede met de wapening en past het aantal staven per vier aan bij vierkant',()=>{
    const onChange=setup();
    expect(screen.getByRole('img',{name:'Doorsnede □400 mm met 8 staven Ø20'})).toBeInTheDocument();
    expect(document.querySelectorAll('.lat-sketch-bar')).toHaveLength(8);
    fireEvent.change(screen.getByLabelText('Aantal langsstaven'),{target:{value:'10'}}); fireEvent.blur(screen.getByLabelText('Aantal langsstaven'));
    expect(onChange.mock.lastCall![0].section.barCount).toBe(12);
  });
  it('splitst de onderste laag bij + Laag, en toont pu-kolommen alleen bij niet-lineair',()=>{
    const onChange=setup();
    expect(screen.getByLabelText('pu,0 laag 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'+ Laag'}));
    const next=onChange.mock.lastCall![0];
    expect(next.layers.map((l:{topM:number;bottomM:number})=>[l.topM,l.bottomM])).toEqual([[0,4],[4,8],[8,12]]);
    expect(computeLateral(next).ok).toBe(true);
    cleanup();
    setup({...lateralExample,analysisMode:'linear',layerCorrection:'none'});
    expect(screen.queryByLabelText('pu,0 laag 1')).toBeNull();
  });
  it('zet de werkende breedte gelijk aan de paalbreedte',()=>{
    const onChange=setup({...lateralExample,springWidthM:1});
    fireEvent.click(screen.getByRole('button',{name:'= paal'}));
    expect(onChange.mock.lastCall![0].springWidthM).toBe(.4);
  });
});

