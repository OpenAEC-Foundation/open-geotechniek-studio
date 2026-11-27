// Koppeling met de module paaldraagvermogen: overnemen van een verticale
// berekening, dezelfde paalsystemen, en de knop en de herkomstregel op het scherm.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCalculationsStore } from '../../framework/store';
import { PILE_SYSTEMS } from '../pile-bearing-capacity/pile-systems';
import { pileBearingCapacityModule } from '../pile-bearing-capacity/module';
import type { PileInput } from '../pile-bearing-capacity/types';
import { computeLateral, lateralExample, type LateralInput } from './compute';
import { AddLateralCalculation, InheritedNote } from './InheritedNote';
import { SYSTEM_KINDS, applyPile, lateralInputFromPile, systemAvailable, systemOf } from './pile-link';
import { sheetGeometry } from './PileScene3D';
import { sheetOutline } from './sheet-shape';
import { findSheetPile } from '../../library/sheetPiles';

const ctx = { cpts: new Map(), activeCptId: null, projectMeta: { title: '', client: '', location: '', project_number: '', author: '', date: '' } };
const base = pileBearingCapacityModule.defaultInput(ctx) as PileInput;
/** Prefab betonpaal □320, kop NAP −1,00, punt NAP −15,00, maaiveld NAP 0,00, grondwater NAP −0,80; klei tot −9, daaronder zand. */
const pile: PileInput = {
  ...base, cptId: 'S01', pileTypeId: 'concrete-prefab-prestressed-driven', diameterMm: 320, pileTopNap: -1, pileToeNap: -15, excavationNap: 0, waterNap: -0.8, nEd: 650,
  soilProfile: [
    { kind: 'clay', startNap: 0, endNap: -9, gammaK: 16, gammaW: 10, phi: 17.5 },
    { kind: 'sand-wet', startNap: -9, endNap: -20, gammaK: 20, gammaW: 10, phi: 32.5 },
  ],
};
const source = { calcId: 'c1', name: 'Hoofdgebouw' };

describe('horizontale berekening uit een paaldraagvermogenberekening', () => {
  it('neemt paal, niveaus, grondlagen en N over en rekent', () => {
    const made = lateralInputFromPile(pile, source, '2026-11-27T00:00:00.000Z');
    if (!made.ok) throw new Error(made.reason);
    const i = made.input;
    expect(i).toMatchObject({ headNap: -1, lengthM: 14, nEdKn: 650, springWidthM: 0.32, pileSystemId: 'prefab-concrete', headForceKn: 0, headMomentKnM: 0 });
    expect(i.section).toMatchObject({ kind: 'concrete-square', diameterMm: 320 });
    // Lagen onder de paalkop: klei van 0 tot 8 m (NAP −1 tot −9), zand van 8 tot 14 m (NAP −9 tot de punt op −15).
    expect(i.layers.map((l) => [l.topM, l.bottomM, l.springId, l.frictionDeg])).toEqual([[0, 8, 'clay-soft', 17.5], [8, 14, 'sand-medium', 32.5]]);
    expect(i.inherited).toEqual({ calcId: 'c1', name: 'Hoofdgebouw', cptId: 'S01', waterNap: -0.8, surfaceNap: 0, at: '2026-11-27T00:00:00.000Z' });
    // Geen p_u in de verticale berekening: lineaire veren, tot de gebruiker p_u invult.
    expect([i.analysisMode, i.layerCorrection]).toEqual(['linear', 'none']);
    const r = computeLateral({ ...i, headForceKn: 40 });
    expect(r.ok).toBe(true);
    expect(computeLateral(i).ok).toBe(true);
  });
  it('laat een paalkop boven maaiveld vrij staan tot het maaiveld', () => {
    const made = lateralInputFromPile({ ...pile, pileTopNap: 1.5 }, source);
    if (!made.ok) throw new Error(made.reason);
    expect(made.input.layers[0]).toMatchObject({ topM: 1.5, bottomM: 10.5 });
    expect(made.input.lengthM).toBe(16.5);
  });
  it('kiest de doorsnede bij het paaltype: buis, ronde betonpaal, boorpaal met minimumwapening', () => {
    const tube = lateralInputFromPile({ ...pile, pileTypeId: 'steel-pipe-driven-closed-2017', diameterMm: 323.9, wallThicknessMm: 12.5 }, source);
    expect(tube.ok && tube.input.section).toMatchObject({ kind: 'steel-tube', diameterMm: 323.9, wallMm: 12.5 });
    const bored = lateralInputFromPile({ ...pile, pileTypeId: 'concrete-bored', diameterMm: 600 }, source);
    expect(bored.ok && [bored.input.section.kind, bored.input.pileSystemId, bored.input.material?.boredPile]).toEqual(['concrete-round', 'bored', true]);
    expect(lateralInputFromPile({ ...pile, pileTypeId: 'timber-uniform' }, source)).toEqual({ ok: false, reason: 'timber' });
    expect(lateralInputFromPile({ ...pile, pileTypeId: 'bestaat-niet' }, source)).toEqual({ ok: false, reason: 'unknownType' });
    expect(lateralInputFromPile({ ...pile, pileToeNap: 0 }, source)).toEqual({ ok: false, reason: 'noLength' });
  });
  it('opnieuw overnemen laat H, M en de wapening staan', () => {
    const current: LateralInput = { ...lateralExample, headForceKn: 55, headMomentKnM: -12, section: { ...lateralExample.section, barCount: 12, barDiameterMm: 25 }, material: { stirrupDiameterMm: 8, stirrupSpacingMm: 150 } };
    const made = applyPile(current, { ...pile, pileToeNap: -18 }, source);
    if (!made.ok) throw new Error(made.reason);
    expect(made.input).toMatchObject({ headForceKn: 55, headMomentKnM: -12, lengthM: 17, material: { stirrupDiameterMm: 8, stirrupSpacingMm: 150 } });
    expect(made.input.section).toMatchObject({ barCount: 12, barDiameterMm: 25, diameterMm: 320 });
  });
});

describe('dezelfde paalsystemen als het paaldraagvermogen', () => {
  it('elk systeem heeft zijn doorsneden; alleen hout is nog niet te kiezen', () => {
    expect(Object.keys(SYSTEM_KINDS).sort()).toEqual(PILE_SYSTEMS.map((s) => s.id).sort());
    expect(PILE_SYSTEMS.filter((s) => !systemAvailable(s.id)).map((s) => s.id)).toEqual(['timber', 'timber-extension']);
  });
  it('leidt het systeem van bestaande invoer af uit de doorsnede', () => {
    expect(systemOf(lateralExample)).toBe('prefab-concrete');
    expect(systemOf({ section: { ...lateralExample.section, kind: 'steel-tube' } })).toBe('steel-tube-closed');
    expect(systemOf({ section: { ...lateralExample.section, kind: 'filled-tube' } })).toBe('screw-permanent-casing');
    expect(systemOf({ pileSystemId: 'vibro', section: { ...lateralExample.section, kind: 'concrete-round' } })).toBe('vibro');
    expect(systemOf({ pileSystemId: 'vibro', section: { ...lateralExample.section, kind: 'sheet-pile' } })).toBe('sheet-pile');
  });
});

describe('knop en herkomstregel', () => {
  beforeEach(() => useCalculationsStore.setState({ byDoc: new Map(), activeCalcId: null }));
  it('voegt vanuit de paalberekening een horizontale berekening toe en opent die', () => {
    const store = useCalculationsStore.getState(), pileId = store.addCalculation('doc', 'pile-bearing-capacity', 'Hoofdgebouw', pile);
    render(<AddLateralCalculation input={pile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Horizontale paalbelasting toevoegen' }));
    const list = useCalculationsStore.getState().getList('doc'), added = list[1];
    expect(list).toHaveLength(2);
    expect(added).toMatchObject({ moduleId: 'laterally-loaded-pile', name: 'Hoofdgebouw · horizontaal' });
    expect((added.input as LateralInput).inherited).toMatchObject({ calcId: pileId, name: 'Hoofdgebouw', cptId: 'S01' });
    expect(useCalculationsStore.getState().sheetNav).toMatchObject({ calcId: added.id, view: 'sheet' });
  });
  it('staat uit bij een houten paal, met de reden', () => {
    render(<AddLateralCalculation input={{ ...pile, pileTypeId: 'timber-uniform' }} />);
    const button = screen.getByRole('button', { name: 'Horizontale paalbelasting toevoegen' });
    expect(button).toBeDisabled(); expect(button.getAttribute('title')).toMatch(/houten palen/);
  });
  it('toont in de horizontale berekening waar de gegevens vandaan komen en neemt opnieuw over', () => {
    const store = useCalculationsStore.getState(), pileId = store.addCalculation('doc', 'pile-bearing-capacity', 'Hoofdgebouw', pile);
    const made = lateralInputFromPile(pile, { calcId: pileId, name: 'Hoofdgebouw' }); if (!made.ok) throw new Error(made.reason);
    const onChange = vi.fn();
    render(<InheritedNote input={{ ...made.input, headForceKn: 40 }} onChange={onChange} />);
    expect(screen.getByRole('note')).toHaveTextContent('Overgenomen uit Hoofdgebouw · S01 · maaiveld NAP 0,00, grondwater NAP -0,80');
    useCalculationsStore.getState().updateCalculation('doc', pileId, { input: { ...pile, pileToeNap: -17 } });
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw overnemen' }));
    expect(onChange.mock.lastCall![0]).toMatchObject({ lengthM: 16, headForceKn: 40 });
  });
});

describe('damwandprofiel in tekening en 3D', () => {
  it('de hartlijn heeft de breedte en hoogte van het profiel en sloten per vorm', () => {
    // U-plank 750 × 408 (wand): twee planken, sloten op de neutrale lijn, flenzen om en om op ±204 mm.
    const u = sheetOutline({ shape: 'U', widthMm: 750, wallHeightMm: 408 }, 'wall');
    expect([u.widthMm, u.heightMm, u.planks]).toEqual([1500, 408, 2]);
    expect(u.locks.map((q) => q.y)).toEqual([0, 0, 0]);
    expect([Math.max(...u.points.map((q) => q.y)), Math.min(...u.points.map((q) => q.y))]).toEqual([204, -204]);
    // Losse U-plank: de halve wandhoogte.
    expect(sheetOutline({ shape: 'U', widthMm: 750, wallHeightMm: 408 }, 'single').heightMm).toBe(204);
    // Z-plank: sloten in de flenzen, om en om boven en onder.
    const z = sheetOutline({ shape: 'Z', widthMm: 800, wallHeightMm: 450 }, 'wall');
    expect(z.locks.map((q) => q.y)).toEqual([225, -225, 225]);
    expect(sheetOutline({ shape: 'hat', widthMm: 900, wallHeightMm: 230 }, 'single').heightMm).toBe(230);
  });
  it('met een contour uit de fabriekstekening: de getekende planken op de plaats van de hartlijn', () => {
    // PU 18 (600 × 430): twee platen over 1,2 m, symmetrisch om de as; aan dezelfde kant als de flens van de hartlijn.
    const w = sheetOutline(findSheetPile('PU 18')!, 'wall'), xs = w.plates.flat().map((q) => q.x), ys = w.plates.flat().map((q) => q.y);
    expect(w.basis).toBe('drawing'); expect(w.plates).toHaveLength(2); expect(w.heightMm).toBeCloseTo(430, 0);
    expect(Math.min(...xs)).toBeGreaterThan(-650); expect(Math.max(...xs)).toBeLessThan(650); expect(Math.abs(Math.max(...ys) + Math.min(...ys))).toBeLessThan(1);
    const flange = w.points[1], near = w.plates[0].filter((q) => Math.abs(q.x - flange.x) < 40);
    expect(Math.sign(near.reduce((s, q) => s + q.y, 0))).toBe(Math.sign(flange.y));
    const single = sheetOutline(findSheetPile('PU 18')!, 'single');
    expect(single.plates).toHaveLength(1); expect(single.heightMm).toBeLessThan(w.heightMm);
    // Zonder tekening: geen platen, de hartlijn blijft.
    const plain = sheetOutline(findSheetPile('JFESP-2')!, 'wall'); expect(plain.basis).not.toBe('drawing'); expect(plain.plates).toEqual([]);
  });
  it('het 3D-vlak volgt de verplaatsingslijn over de hele paallengte', () => {
    const r = computeLateral(lateralExample); if (!r.ok) throw new Error(r.error);
    const outline = sheetOutline({ shape: 'U', widthMm: 750, wallHeightMm: 408 }, 'wall').points.map((q) => ({ x: q.x / 1000, y: q.y / 1000 }));
    const g = sheetGeometry(r.beam.samples, 10, outline); g.computeBoundingBox();
    expect(g.boundingBox!.min.y).toBeCloseTo(-lateralExample.lengthM, 2);
    expect(g.boundingBox!.max.z - g.boundingBox!.min.z).toBeCloseTo(1.5, 6);
    expect(g.getAttribute('position').count).toBeGreaterThan(100);
  });
});
