import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { laterallyLoadedPileModule as module } from './module';
import { computeLateral, lateralExample } from './compute';
it('heeft eigen materiaal- en maaiveldinvoer en bewaart wijzigingen',()=>{
  const onChange=vi.fn(), result=computeLateral(lateralExample);
  render(<module.InputPanel input={lateralExample} result={result} onChange={onChange}/>);
  // Dezelfde paalsystemen als de module paaldraagvermogen; het systeem bepaalt de doorsnede.
  fireEvent.click(screen.getByRole('radio',{name:'Schroefpaal, blijvende buis'}));
  expect(onChange.mock.lastCall?.[0].section.kind).toBe('filled-tube');
  expect(onChange.mock.lastCall?.[0].pileSystemId).toBe('screw-permanent-casing');
  fireEvent.click(screen.getByRole('radio',{name:'Boorpaal'}));
  expect(onChange.mock.lastCall?.[0].section.kind).toBe('concrete-round');
  expect(onChange.mock.lastCall?.[0].material.boredPile).toBe(true);
  expect(screen.getByRole('radio',{name:'Houten paal'})).toBeDisabled();
  // Prefab: vierkant of rond als doorsnede.
  fireEvent.change(screen.getByLabelText('Doorsnede'),{target:{value:'concrete-round'}});
  expect(onChange.mock.lastCall?.[0].section.kind).toBe('concrete-round');
  expect(screen.getByLabelText('Moment op de kop [kNm]')).toBeInTheDocument();
  expect(screen.getByLabelText('Bovenbelasting [kPa]')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Analyse grondveren'),{target:{value:'linear'}});
  expect(onChange.mock.lastCall?.[0].analysisMode).toBe('linear');
  expect(screen.getByLabelText('Laagcorrectie')).toBeInTheDocument();
});
it('zet de uitdraai op papier met resultaten per niveau, doorsnedetoets en conclusie',()=>{
  const input={...lateralExample,headNap:-1},r=computeLateral(input);if(!r.ok)throw new Error(r.error);
  render(<module.ResultPanel input={input} result={r}/>);
  for(const h of ['Uitgangspunten','Paaldoorsnede','Grondopbouw','Buigstijfheid','Resultaten','Grondreactie per laag','Verloop over de diepte','Doorsnedetoets N–M','Materiaaltoetsing','Conclusie'])expect(screen.getByRole('heading',{name:h})).toBeInTheDocument();
  expect(screen.getByText('NAP -13,00 m')).toBeInTheDocument();
  expect(screen.getByRole('table',{name:'Resultaten met niveau'})).toHaveTextContent('Moment M [kNm]');
  expect(screen.getByText(/De doorsnede (voldoet|voldoet niet)/)).toBeInTheDocument();
  expect(screen.getByText(/Niet getoetst: scheurwijdte, verankering/)).toBeInTheDocument();
  // Overzicht van de materiaaltoetsing: per toets artikel, rekenwaarde, weerstand, u.c. en oordeel.
  const material=screen.getByRole('table',{name:'Materiaaltoetsing'});
  for(const part of ['Buiging met normaalkracht','Dwarskracht zonder dwarskrachtwapening','EN 1992-1-1 art. 6.2.2 (1)','Minimale langswapening','Scheurwijdte','voldoet','niet getoetst'])expect(material).toHaveTextContent(part);
  expect(material.querySelectorAll('thead th')).toHaveLength(6);
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
  for(const t of ['1. Uitgangspunten','2. Paaldoorsnede','3. Grondopbouw','4. Resultaten','5. Grondreactie per laag','6. Verloop over de diepte','7. Doorsnedetoets N-M','8. Materiaaltoetsing','9. Conclusie','Dwarskracht zonder dwarskrachtwapening','Niet getoetst: scheurwijdte','Moment M [kNm]','NAP -13,00','getrokken zijde','CUR166 tabel 3.3'])expect(text).toContain(t);
  const checks=module.checks!(input,r);
  expect(checks.map(c=>c.label)).toEqual(['y kop','M max','V max','doorsnede','materiaal']);
  // De statusregel noemt de maatgevende toets.
  expect(module.statusLine!(r).text).toBe(`u.c. ${r.material!.governing!.uc.toLocaleString('nl-NL',{maximumFractionDigits:2})} · ${r.material!.governing!.label}`);
  expect(module.statusLine!(r).ok).toBe(true);
  const class4=computeLateral({...input,section:{...input.section,kind:'steel-tube',diameterMm:500,wallMm:5}});
  expect(module.statusLine!(class4)).toMatchObject({text:'Valt buiten de materiaaltoetsing',ok:false});
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

describe('damwandprofiel als doorsnede',()=>{
  const setup=(input=lateralExample)=>{const onChange=vi.fn();render(<module.InputPanel input={input} result={computeLateral(input)} onChange={onChange}/>);return onChange;};
  it('kiest een profiel uit de bibliotheek en zet de grondveren op de rekenbreedte',()=>{
    const onChange=setup();
    fireEvent.click(screen.getByRole('radio',{name:'Damwandprofiel'}));
    const picked=onChange.mock.lastCall![0];
    expect(picked.section.kind).toBe('sheet-pile');
    expect(picked.section.sheet).toMatchObject({grade:'S355GP',widthMode:'wall',betaB:1,betaD:1});
    expect(picked.springWidthM).toBe(1);
    expect(computeLateral(picked).ok).toBe(true);
    cleanup();
    const next=setup(picked);
    expect(screen.getByRole('img',{name:/Damwandprofiel .* schematisch/})).toBeInTheDocument();
    expect(document.querySelectorAll('.lat-sketch-lock').length).toBeGreaterThan(1);
    fireEvent.change(screen.getByLabelText('Profiel'),{target:{value:'ArcelorMittal|AU 14'}});
    expect(next.mock.lastCall![0].section).toMatchObject({diameterMm:408,sheet:{profileId:'AU 14'}});
    fireEvent.change(screen.getByLabelText('Rekenbreedte'),{target:{value:'single'}});
    expect(next.mock.lastCall![0].springWidthM).toBeCloseTo(picked.section.sheet.profileId==='AU 14'?0.75:next.mock.lastCall![0].springWidthM,9);
    expect(next.mock.lastCall![0].section.sheet.widthMode).toBe('single');
    fireEvent.change(screen.getByLabelText('β_B'),{target:{value:'0,8'}}); fireEvent.blur(screen.getByLabelText('β_B'));
    expect(next.mock.lastCall![0].section.sheet.betaB).toBe(0.8);
  });
  it('biedt sterkteklassen en beugels aan zonder de standaardinvoer te veranderen',()=>{
    const onChange=setup();
    expect(screen.getByLabelText('Betonsterkteklasse')).toHaveValue('C30/37');
    expect(screen.getByLabelText('Betonstaal')).toHaveValue('B500');
    fireEvent.change(screen.getByLabelText('Betonsterkteklasse'),{target:{value:'C35/45'}});
    expect(onChange.mock.lastCall![0].section).toMatchObject({fckMpa:35,fcdMpa:23.33});
    fireEvent.change(screen.getByLabelText('Beugeldiameter [mm], 0 = geen'),{target:{value:'8'}}); fireEvent.blur(screen.getByLabelText('Beugeldiameter [mm], 0 = geen'));
    expect(onChange.mock.lastCall![0].material.stirrupDiameterMm).toBe(8);
  });
});
