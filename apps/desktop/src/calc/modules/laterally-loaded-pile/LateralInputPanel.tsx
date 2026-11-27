// Invoer horizontale paal in rekenblad-stijl, gelijk aan de verticale paal:
// dezelfde paalsystemen als tegels, dan doorsnede en niveaus in m NAP, de
// belasting op de kop en de grond. Toelichtingen staan achter een "i";
// materiaal, bovenbelasting en rekeninstellingen staan ingeklapt.
import type { ReactNode } from 'react';
import type { PanelProps } from '../../framework/types';
import { Hint, More, NumberInput, Row, Section } from '../../framework/views/SheetForm';
import type { LateralInput, LateralLayer, LateralResult } from './compute';
import type { PileSection, SectionKind } from './section';
import { SOIL_SPRINGS, soilKey, springValue } from './soil';
import { SectionSketch } from './SectionSketch';
import { PREFAB_SQUARE, STEEL_TUBE_OD, nearest, sizeText } from '../pile-bearing-capacity/standard-sizes';
import { PILE_SYSTEMS, pileSystemName, type PileSystemId } from '../pile-bearing-capacity/pile-systems';
import { PileSketch } from '../pile-bearing-capacity/ui/PileSketch';
import '../pile-bearing-capacity/ui/styles.css';
import './lateral-input.css';
import { OaIcon } from '../../../components/icons/oaIcon';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';
import { SHEET_PILE_GRADES, findSheetPile, sheetPileCatalog } from '../../library/sheetPiles';
import { CONCRETE_CLASSES, REBAR_GRADES, STEEL_GRADES, concreteClassOf, designConcrete, designRebar, rebarGradeOf, steelGradeOf } from './materials';
import type { MaterialInput } from './material-types';
import { CAST_IN_SITU, SYSTEM_KINDS, systemAvailable, systemOf } from './pile-link';
import { InheritedNote } from './InheritedNote';
import { defaultSheet, type SheetSection } from './sheet-section';

type Props = PanelProps<LateralInput, LateralResult>;
const nl = (v: number, d = 2) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const KIND_NAME: Record<SectionKind, [string, string]> = {
  'concrete-square': ['concreteSquare', 'Beton vierkant'], 'concrete-round': ['concreteRound', 'Beton rond'],
  'filled-tube': ['filledTube', 'Buis gevuld'], 'steel-tube': ['steelTube', 'Buis hol'], 'sheet-pile': ['sheetPile', 'Damwandprofiel'],
};
const SheetIcon = () => <svg className="pile-sketch" viewBox="0 0 28 35" aria-hidden="true"><polyline points="2,23 6,23 10,12 16,12 20,23 24,23 26,17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>;

/** Toelichting achter een "i": standaard dicht, zodat de invoer rustig blijft. */
export function Info({ children }: { children: ReactNode }) {
  const { t } = useTranslation('calcLateral');
  return <details className="lat-info"><summary aria-label={t('input.info', 'Toelichting')} title={t('input.info', 'Toelichting')}>i</summary><p>{children}</p></details>;
}

export function LateralInputPanel({ input: i, onChange }: Props) {
  const { t } = useTranslation('calcLateral');
  const change = (patch: Partial<LateralInput>) => onChange?.({ ...i, ...patch });
  const section = (patch: Partial<PileSection>) => change({ section: { ...i.section, ...patch } });
  const material = (patch: Partial<MaterialInput>) => change({ material: { ...i.material, ...patch } });
  const s = i.section, sheet = s.kind === 'sheet-pile', tube = s.kind === 'steel-tube' || s.kind === 'filled-tube', hasBars = !sheet && s.kind !== 'steel-tube';
  const system = systemOf(i), kinds = system === 'sheet-pile' ? [] : SYSTEM_KINDS[system];
  const nonlinear = i.analysisMode === 'nonlinear' || i.layerCorrection === 'georgiadis';
  // Niveaus in m NAP; de berekening zelf rekent vanaf de paalkop.
  const head = i.headNap ?? 0, nap = (z: number) => r3(head - z), depth = (n: number) => r3(head - n);
  const setLayer = (k: number, patch: Partial<LateralLayer>) => change({ layers: i.layers.map((l, j) => j === k ? { ...l, ...patch } : l) });
  const setLength = (L: number) => {
    if (!(L > 0)) return;
    // Lagen gaan mee met de paalpunt: de onderste laag eindigt op de punt.
    const last = Math.max(...i.layers.map((l) => l.bottomM));
    const layers = i.layers.filter((l) => l.topM < L - 1e-9).map((l) => ({ ...l, bottomM: Math.abs(l.bottomM - last) < 1e-9 ? L : Math.min(l.bottomM, L) }));
    change({ lengthM: r3(L), layers });
  };
  const barStep = s.kind === 'concrete-square' ? 4 : 1;
  const addLayer = () => {
    const last = i.layers[i.layers.length - 1], top = last ? r3(Math.min(i.lengthM, (last.topM + last.bottomM) / 2)) : 0;
    const shortened = last ? { ...last, bottomM: top } : undefined;
    const fresh: LateralLayer = { topM: top, bottomM: i.lengthM, springId: 'sand-medium', manualKhKnM3: 20000, frictionDeg: 30, netPressureKpa: 0, ultimate: last?.ultimate ? { ...last.ultimate } : { atSurfaceKnM: 0, gradientKnM2: 60, capKnM: 500 } };
    change({ layers: [...i.layers.slice(0, -1), ...(shortened ? [shortened] : []), fresh] });
  };
  /** Andere doorsnede: maat naar de reeks van dat type, staven per vier bij een vierkante paal. */
  const kindPatch = (kind: SectionKind): Partial<PileSection> => {
    const toTube = kind === 'steel-tube' || kind === 'filled-tube';
    return { kind, barCount: kind === 'concrete-square' ? Math.max(4, Math.round(s.barCount / 4) * 4) : s.barCount,
      ...(toTube && !tube ? { diameterMm: nearest(STEEL_TUBE_OD, s.diameterMm), wallMm: Math.max(s.wallMm, 10) } : {}) };
  };
  const pickSystem = (id: PileSystemId) => {
    const kind = SYSTEM_KINDS[id].includes(s.kind) ? s.kind : SYSTEM_KINDS[id][0];
    onChange?.({ ...i, pileSystemId: id, section: { ...s, ...kindPatch(kind) }, material: { ...i.material, boredPile: CAST_IN_SITU.includes(id) || undefined } });
  };
  const sheetCfg: SheetSection = s.sheet ?? defaultSheet(), profile = findSheetPile(sheetCfg.profileId, sheetCfg.manufacturer);
  const sheetWidth = (cfg: SheetSection) => cfg.widthMode === 'wall' ? 1 : (findSheetPile(cfg.profileId, cfg.manufacturer)?.widthMm ?? 1000) / 1000;
  /** Damwand: de hoogte van het profiel als maat, en de grondveren over de rekenbreedte. */
  const setSheet = (patch: Partial<SheetSection>) => {
    const cfg = { ...sheetCfg, ...patch }, p = findSheetPile(cfg.profileId, cfg.manufacturer);
    onChange?.({ ...i, pileSystemId: undefined, springWidthM: sheetWidth(cfg), section: { ...s, kind: 'sheet-pile', sheet: cfg, diameterMm: p?.wallHeightMm ?? s.diameterMm } });
  };
  const pileWidth = sheet ? sheetWidth(sheetCfg) : s.diameterMm / 1000;
  const sizes = s.kind === 'concrete-square' ? PREFAB_SQUARE : tube ? STEEL_TUBE_OD : null;
  const sizeLabel = s.kind === 'concrete-square' ? t('input.side', 'Zijde') : t('input.diameter', 'Diameter');
  const stirrups = (i.material?.stirrupDiameterMm ?? 0) > 0;

  return <div className="lat-input">
    {i.inherited && <InheritedNote input={i} onChange={onChange} />}
    <Section title={t('input.pile', 'Paal')}>
      <div className="cs-tiles pile-system-tiles" role="radiogroup" aria-label={t('input.pileSystem', 'Paalsysteem')}>
        {PILE_SYSTEMS.map((p) => { const name = pileSystemName(p), ok = systemAvailable(p.id); return <button key={p.id} type="button" role="radio" aria-checked={system === p.id} disabled={!ok}
          className={`cs-tile${system === p.id ? ' active' : ''}`} title={ok ? name : t('input.timberNote', '{{name}}: de horizontale berekening heeft nog geen doorsnedetoets voor hout.', { name })} onClick={() => pickSystem(p.id)}>
          <PileSketch system={p.id} /><span>{name}</span></button>; })}
        <button type="button" role="radio" aria-checked={sheet} className={`cs-tile${sheet ? ' active' : ''}`} onClick={() => setSheet({})}><SheetIcon /><span>{t('input.kinds.sheetPile', 'Damwandprofiel')}</span></button>
      </div>
      <div className="lat-section-grid">
        <div className="lat-section-rows">
          {!sheet && <Row label={t('input.sectionKind', 'Doorsnede')}><select aria-label={t('input.sectionKind', 'Doorsnede')} value={s.kind} disabled={kinds.length < 2} onChange={(e) => section(kindPatch(e.target.value as SectionKind))}>
            {kinds.map((k) => <option key={k} value={k}>{t(`input.kinds.${KIND_NAME[k][0]}`, KIND_NAME[k][1])}</option>)}</select></Row>}
          {!sheet && <Row label={sizeLabel} unit="mm"><NumberInput label={`${sizeLabel} [mm]`} value={s.diameterMm} onChange={(v) => section({ diameterMm: v })} /></Row>}
          {!sheet && sizes && <Row label={t('input.standardSize', 'Standaardmaat')}><select aria-label={t('input.standardSize', 'Standaardmaat')} value={sizes.includes(s.diameterMm) ? String(s.diameterMm) : ''} onChange={(e) => e.target.value && section({ diameterMm: Number(e.target.value) })}>
            {!sizes.includes(s.diameterMm) && <option value="">{t('input.custom', 'Eigen')}</option>}{sizes.map((d) => <option key={d} value={d}>{tube ? 'Ø' : '□'}{sizeText(d)}</option>)}</select></Row>}
          {tube && <Row label={<abbr title={t('input.wallTitle', 'Effectieve restwanddikte na corrosie')}>{t('input.wall', 'Wand')}</abbr>} unit="mm"><NumberInput label={t('input.wallLabel', 'Restwanddikte [mm]')} value={s.wallMm} onChange={(v) => section({ wallMm: v })} /></Row>}
          {hasBars && <>
            <Row label={t('input.bars', 'Staven')} unit={t('input.barsUnit', 'st.')}><NumberInput label={t('input.barCount', 'Aantal langsstaven')} step={String(barStep)} min={0} value={s.barCount} onChange={(v) => section({ barCount: Math.max(0, Math.round(v / barStep) * barStep) })} /></Row>
            <Row label={t('input.barDia', 'Staaf Ø')} unit="mm"><NumberInput label={t('input.barDiaLabel', 'Staafdiameter [mm]')} value={s.barDiameterMm} onChange={(v) => section({ barDiameterMm: v })} /></Row>
            <Row label={<abbr title={t('input.coverTitle', 'Afstand van de betonrand tot het hart van de staaf')}>{t('input.cover', 'Rand–hart')}</abbr>} unit="mm"><NumberInput label={t('input.coverLabel', 'Rand tot staafhart [mm]')} value={s.coverToBarCentreMm} onChange={(v) => section({ coverToBarCentreMm: v })} /></Row>
          </>}
          {sheet && <>
            <Row label={t('input.sheetProfile', 'Profiel')}><select aria-label={t('input.sheetProfile', 'Profiel')} value={`${profile?.manufacturer ?? ''}|${profile?.id ?? ''}`} onChange={(e) => { const [manufacturer, profileId] = e.target.value.split('|'); setSheet({ manufacturer, profileId }); }}>
              {[...sheetPileCatalog()].flatMap(([maker, series]) => [...series].map(([name, list]) => <optgroup key={`${maker}${name}`} label={`${maker} · ${name}`}>
                {list.filter((p) => p.iCm4PerM !== null).map((p) => <option key={p.id} value={`${p.manufacturer}|${p.id}`}>{p.id}</option>)}</optgroup>))}</select></Row>
            <Row label={t('input.steelGrade', 'Staalsoort')}><select aria-label={t('input.steelGrade', 'Staalsoort')} value={sheetCfg.grade} onChange={(e) => setSheet({ grade: e.target.value })}>
              {SHEET_PILE_GRADES.map((g) => <option key={g.grade} value={g.grade}>{g.grade}{profile?.classes?.[g.grade] ? ` · ${t('input.classShort', 'klasse {{cls}}', { cls: profile.classes[g.grade] })}` : ''}</option>)}</select></Row>
            <Row label={t('input.sheetWidth', 'Rekenbreedte')}><select aria-label={t('input.sheetWidth', 'Rekenbreedte')} value={sheetCfg.widthMode} onChange={(e) => setSheet({ widthMode: e.target.value as SheetSection['widthMode'] })}>
              <option value="wall">{t('input.sheetWall', 'Per m wand (1,00 m)')}</option><option value="single">{t('input.sheetSingle', 'Losse plank ({{b}} m)', { b: nl((profile?.widthMm ?? 0) / 1000) })}</option></select></Row>
            <Row label={<>β<sub>B</sub></>} unit="—"><NumberInput label="β_B" value={sheetCfg.betaB} onChange={(v) => setSheet({ betaB: v })} /></Row>
            <Row label={<>β<sub>D</sub></>} unit="—"><NumberInput label="β_D" value={sheetCfg.betaD} onChange={(v) => setSheet({ betaD: v })} /></Row>
          </>}
        </div>
        <SectionSketch section={s} />
      </div>
      {sheet && <Info>{t('input.sheetHint', 'I, W en A komen uit de profielbibliotheek, per m doorgaande wand. Per m wand gelden H, M en N per strekkende meter en grijpen de grondveren aan over 1,00 m. Een losse plank rekent over de plankbreedte, als een smalle paal. β_B (op W) en β_D (op I) verlagen de waarden als de sloten geen schuifkracht overdragen: 1,0 voor Z-profielen en voor U-profielen met gefixeerde sloten; lager voor losse of niet-gefixeerde U-planken, volgens de nationale bijlage van NEN-EN 1993-5. Dit is geen damwandberekening: geen gronddruk aan weerszijden, verankering of fasering.')}{profile?.note ? ` ${profile.note}` : ''}</Info>}
      {s.kind === 'filled-tube' && <label className="cs-check"><input type="checkbox" checked={s.tubeParticipates} onChange={(e) => section({ tubeParticipates: e.target.checked })} /> {t('input.tubeParticipates', 'Buis werkt mee (samengestelde werking aangetoond)')}</label>}
      <Row label={t('input.head', 'Paalkop')} unit="m NAP"><NumberInput label={t('input.headLabel', 'Paalkop [m NAP]')} value={head} onChange={(v) => change({ headNap: r3(v) })} /></Row>
      <Row label={t('input.toe', 'Paalpunt')} unit="m NAP"><NumberInput label={t('input.toeLabel', 'Paalpunt [m NAP]')} value={nap(i.lengthM)} onChange={(v) => setLength(head - v)} /></Row>
      <Hint>{t('input.lengthHint', 'Paallengte {{length}} m.', { length: nl(i.lengthM) })}{i.headNap === undefined ? ` ${t('input.headAssumed', 'Paalkop op NAP 0,00 aangenomen; vul het werkelijke niveau in.')}` : ''}</Hint>
    </Section>

    <Section title={t('input.headLoad', 'Belasting op de kop')}>
      <Row label={t('input.forceH', 'Horizontale kracht H')} unit="kN"><NumberInput label={t('input.forceHLabel', 'Horizontale kopkracht [kN]')} value={i.headForceKn} onChange={(v) => change({ headForceKn: v })} /></Row>
      <Row label={t('input.momentM', 'Moment M')} unit="kNm"><NumberInput label={t('input.momentMLabel', 'Moment op de kop [kNm]')} value={i.headMomentKnM} onChange={(v) => change({ headMomentKnM: v })} /></Row>
      <Row label={t('input.axialN', 'Normaalkracht N (druk +)')} unit="kN"><NumberInput label={t('input.axialNLabel', 'Normaalkracht [kN]')} value={i.nEdKn} onChange={(v) => change({ nEdKn: v })} /></Row>
      <div className="cs-tiles lat-head" role="radiogroup" aria-label={t('input.headCondition', 'Kop')}>
        {([[false, 'freeHead', 'Vrije kop'], [true, 'fixedHead', 'Ingeklemde kop']] as const).map(([fixed, key, label]) => <button key={key} type="button" role="radio" aria-checked={i.headFixedRotation === fixed} className={`cs-tile${i.headFixedRotation === fixed ? ' active' : ''}`} onClick={() => change({ headFixedRotation: fixed })}>{t(`input.${key}`, label)}</button>)}
      </div>
      <Info>{t('input.designValues', 'H, M en N zijn rekenwaarden.')} {t('input.momentHint', 'Teken van M: een positief moment draait de paalkop tegen de klok in en werkt een positieve H tegen. Een kracht H op hoogte e boven de kop geeft M = −H·e.')} {t('input.axialHint', 'N gebruikt de rekenkern alleen voor de N–M-toets van de doorsnede, niet voor tweede-orde-effecten.')}</Info>
    </Section>

    <Section title={t('input.soil', 'Grond')}>
      <Row label={t('input.springs', 'Grondveren')}><select aria-label={t('input.springsAnalysis', 'Analyse grondveren')} value={i.analysisMode ?? 'linear'} onChange={(e) => change({ analysisMode: e.target.value as LateralInput['analysisMode'] })}><option value="nonlinear">{t('input.nonlinear', 'Niet-lineair')} (p = pu tanh(k₀y/pu))</option><option value="linear">{t('input.linear', 'Lineair')} (k₀)</option></select></Row>
      <Row label={t('input.layerCorrection', 'Laagcorrectie')}><select aria-label={t('input.layerCorrection', 'Laagcorrectie')} value={i.layerCorrection ?? 'none'} onChange={(e) => change({ layerCorrection: e.target.value as LateralInput['layerCorrection'] })}><option value="georgiadis">Georgiadis</option><option value="none">{t('input.none', 'Geen')}</option></select></Row>
      <Row label={t('input.subgrade', 'Bedding CUR166')}><select aria-label={t('input.subgradeScenario', 'Beddingsscenario')} value={i.scenario} onChange={(e) => change({ scenario: e.target.value as LateralInput['scenario'] })}><option value="low">{t('input.lowAverage', 'Laag gemiddelde')}</option><option value="high">{t('input.highAverage', 'Hoog gemiddelde')}</option></select></Row>
      <Row label={t('input.width', 'Werkende breedte')} unit="m">
        <NumberInput label={t('input.widthLabel', 'Werkende breedte grondveren [m]')} value={i.springWidthM} onChange={(v) => change({ springWidthM: v })} />
        {Math.abs(i.springWidthM - pileWidth) > 1e-9 && <button type="button" className="lat-mini" onClick={() => change({ springWidthM: pileWidth })} title={t('input.widthPileTitle', 'Gelijk aan de paalbreedte')}>{t('input.widthPile', '= paal')}</button>}
      </Row>
      <table className="cs-layer-table lat-layers" aria-label={t('input.layers', 'Grondlagen')}>
        <thead>
          <tr><th>{t('input.from', 'Van')}<small>m NAP</small></th><th>{t('input.to', 'Tot')}<small>m NAP</small></th><th colSpan={2}>{t('input.soil', 'Grond')}</th><th /></tr>
          <tr className="lat-layers-sub"><th>kh<small>kN/m³</small></th>{nonlinear ? <><th>pu,0<small>kN/m</small></th><th>g<small>kN/m²</small></th><th>pu,max<small>kN/m</small></th></> : <th colSpan={3} />}<th /></tr>
        </thead>
        {i.layers.map((l, k) => <tbody key={k} className="lat-layer">
          <tr>
            <td><NumberInput label={t('input.layerTop', 'Bovenkant laag {{n}} [m NAP]', { n: k + 1 })} value={nap(l.topM)} onChange={(v) => setLayer(k, { topM: depth(v) })} /></td>
            <td><NumberInput label={t('input.layerBottom', 'Onderkant laag {{n}} [m NAP]', { n: k + 1 })} value={nap(l.bottomM)} onChange={(v) => setLayer(k, { bottomM: depth(v) })} /></td>
            <td colSpan={2}><select aria-label={t('input.layerSpring', 'Bedding laag {{n}}', { n: k + 1 })} value={l.springId} onChange={(e) => { const id = e.target.value, profile = i.puDefaults?.[id]; setLayer(k, { springId: id, ...(profile && Object.values(profile).every(Number.isFinite) ? { ultimate: { ...profile } } : {}) }); }}>{SOIL_SPRINGS.map((v) => <option key={v.id} value={v.id}>{t(soilKey(v.id), v.label).split(' (')[0]}</option>)}<option value="manual">{t('soils.manual', 'Eigen waarde')}</option></select></td>
            <td><button type="button" className="lat-mini" aria-label={t('input.removeLayer', 'Laag {{n}} verwijderen', { n: k + 1 })} disabled={i.layers.length < 2} onClick={() => change({ layers: i.layers.filter((_, j) => j !== k) })}><OaIcon id="edit.delete" /></button></td>
          </tr>
          <tr className="lat-layers-sub">
            <td>{l.springId === 'manual'
              ? <NumberInput label={t('input.layerKh', 'kh laag {{n}} [kN/m³]', { n: k + 1 })} value={l.manualKhKnM3} onChange={(v) => setLayer(k, { manualKhKnM3: v })} />
              : <span className="lat-readonly" title={i.springOverrides?.[l.springId]?.[i.scenario] !== undefined ? t('input.khOwn', 'Eigen waarde uit de instellingen') : t('input.khTable', 'CUR166 tabel 3.3, eerste secanttraject')}>{(i.springOverrides?.[l.springId]?.[i.scenario] ?? springValue(l.springId, i.scenario)).toLocaleString(numberLocale())}{i.springOverrides?.[l.springId]?.[i.scenario] !== undefined ? ' *' : ''}</span>}</td>
            {nonlinear ? (['atSurfaceKnM', 'gradientKnM2', 'capKnM'] as const).map((key) => <td key={key}><NumberInput label={t('input.layerPu', '{{symbol}} laag {{n}}', { symbol: key === 'atSurfaceKnM' ? 'pu,0' : key === 'gradientKnM2' ? 'g' : 'pu,max', n: k + 1 })} value={l.ultimate?.[key]}
              onChange={(v) => setLayer(k, { ultimate: { atSurfaceKnM: NaN, gradientKnM2: NaN, capKnM: NaN, ...l.ultimate, [key]: v } })} /></td>) : <td colSpan={3} />}
            <td />
          </tr>
        </tbody>)}
      </table>
      <button type="button" className="lat-add" onClick={addLayer}>{t('input.addLayer', '+ Laag')}</button>
      <Info>{nonlinear ? `${t('input.puHint', 'pu(z) = min(pu,max; pu,0 + g·z), grensweerstand per meter paal.')} ` : ''}{t('input.k0Hint', 'k₀ = kh × werkende breedte. Tussen lagen zonder bedding draagt de grond niet.')}{sheet ? ` ${t('input.sheetSpringHint', 'Doorgaande wand: werkende breedte 1,00 m, zonder spreiding opzij. Losse plank: de plankbreedte, zoals bij een paal.')}` : ''}</Info>
    </Section>

    <More title={t('input.material', 'Materiaal en sterkte')}>
      {hasBars && <>
        <Row label={t('input.concreteClass', 'Betonsterkteklasse')}><select aria-label={t('input.concreteClass', 'Betonsterkteklasse')} value={concreteClassOf(s.fckMpa, s.fcdMpa)} onChange={(e) => { const c = CONCRETE_CLASSES.find((x) => x.id === e.target.value); if (c) section({ fckMpa: c.fckMpa, fcdMpa: designConcrete(c.fckMpa) }); }}>
          {!concreteClassOf(s.fckMpa, s.fcdMpa) && <option value="">{t('input.custom', 'Eigen')}</option>}{CONCRETE_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></Row>
        <Row label={t('input.rebarGrade', 'Betonstaal')}><select aria-label={t('input.rebarGrade', 'Betonstaal')} value={rebarGradeOf(s.fydMpa)} onChange={(e) => { const g = REBAR_GRADES.find((x) => x.id === e.target.value); if (g) section({ fydMpa: designRebar(g.fykMpa) }); }}>
          {!rebarGradeOf(s.fydMpa) && <option value="">{t('input.custom', 'Eigen')}</option>}{REBAR_GRADES.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}</select></Row>
      </>}
      {tube && <Row label={t('input.steelGrade', 'Staalsoort')}><select aria-label={t('input.steelGrade', 'Staalsoort')} value={steelGradeOf(s.tubeFydMpa)} onChange={(e) => { const g = STEEL_GRADES.find((x) => x.id === e.target.value); if (g) section({ tubeFydMpa: g.fyMpa }); }}>
        {!steelGradeOf(s.tubeFydMpa) && <option value="">{t('input.custom', 'Eigen')}</option>}{STEEL_GRADES.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}</select></Row>}
      {hasBars && <>
        <Row label="fck (≤ 50)" unit="MPa"><NumberInput label="fck [MPa]" value={s.fckMpa} onChange={(v) => section({ fckMpa: v })} /></Row>
        <Row label="fcd" unit="MPa"><NumberInput label="fcd [MPa]" value={s.fcdMpa} onChange={(v) => section({ fcdMpa: v })} /></Row>
        <Row label={t('input.fydRebar', 'fyd wapening')} unit="MPa"><NumberInput label={`${t('input.fydRebar', 'fyd wapening')} [MPa]`} value={s.fydMpa} onChange={(v) => section({ fydMpa: v })} /></Row>
        <Row label={t('input.eConcrete', 'E beton')} unit="MPa"><NumberInput label={`${t('input.eConcrete', 'E beton')} [MPa]`} value={s.concreteEMpa} onChange={(v) => section({ concreteEMpa: v })} /></Row>
        <Row label={t('input.concreteFactor', 'Projectfactor betonstijfheid')} unit="—"><NumberInput label={t('input.concreteFactor', 'Projectfactor betonstijfheid')} value={s.concreteFactor} onChange={(v) => section({ concreteFactor: v })} /></Row>
        <Row label={t('input.creep', 'Kruipcoëfficiënt')} unit="—"><NumberInput label={t('input.creep', 'Kruipcoëfficiënt')} value={s.creepCoefficient} onChange={(v) => section({ creepCoefficient: v })} /></Row>
        <Row label={t('input.eRebar', 'E wapening')} unit="MPa"><NumberInput label={`${t('input.eRebar', 'E wapening')} [MPa]`} value={s.rebarEMpa} onChange={(v) => section({ rebarEMpa: v })} /></Row>
      </>}
      {tube && <Row label={t('input.fydTube', 'fyd buisstaal')} unit="MPa"><NumberInput label={`${t('input.fydTube', 'fyd buisstaal')} [MPa]`} value={s.tubeFydMpa} onChange={(v) => section({ tubeFydMpa: v })} /></Row>}
      {(tube || sheet) && <Row label={sheet ? t('input.eSteel', 'E staal') : t('input.eTube', 'E buisstaal')} unit="MPa"><NumberInput label={`${sheet ? t('input.eSteel', 'E staal') : t('input.eTube', 'E buisstaal')} [MPa]`} value={s.steelEMpa} onChange={(v) => section({ steelEMpa: v })} /></Row>}
      {hasBars && !(s.kind === 'filled-tube' && s.tubeParticipates) && <>
        <Row label={t('input.stirrupDia', 'Beugel of spiraal Ø')} unit="mm"><NumberInput label={t('input.stirrupDiaLabel', 'Beugeldiameter [mm], 0 = geen')} min={0} value={i.material?.stirrupDiameterMm ?? 0} onChange={(v) => material({ stirrupDiameterMm: v > 0 ? v : undefined })} /></Row>
        {stirrups && <>
          <Row label={t('input.stirrupSpacing', 'Beugelafstand of spoed')} unit="mm"><NumberInput label={t('input.stirrupSpacingLabel', 'Beugelafstand [mm]')} min={0} value={i.material?.stirrupSpacingMm} onChange={(v) => material({ stirrupSpacingMm: v > 0 ? v : undefined })} /></Row>
          {s.kind === 'concrete-square' && <Row label={t('input.stirrupLegs', 'Beugelsneden')} unit={t('input.barsUnit', 'st.')}><NumberInput label={t('input.stirrupLegs', 'Beugelsneden')} min={1} step="1" value={i.material?.stirrupLegs ?? 2} onChange={(v) => material({ stirrupLegs: Math.max(1, Math.round(v)) })} /></Row>}
          <Row label="cot θ (1,0 – 2,5)" unit="—"><NumberInput label="cot θ" value={i.material?.cotTheta ?? 2.5} onChange={(v) => material({ cotTheta: v })} /></Row>
        </>}
        {s.kind !== 'concrete-square' && <label className="cs-check"><input type="checkbox" checked={!!i.material?.boredPile} onChange={(e) => material({ boredPile: e.target.checked || undefined })} /> {t('input.boredPile', 'In de grond gevormd (minimumwapening boorpaal)')}</label>}
      </>}
      <Info>{sheet ? t('input.sheetMaterialHint', 'De vloeigrens volgt uit de gekozen staalsoort van de bibliotheek; γ_M0 = 1,0.')
        : `${t('input.eiHint', 'EI = Ec,eff·Ic + Es·Is + Ea·Ia met Ec,eff = Ec × projectfactor / (1 + kruip). Ontwerpsterkten inclusief materiaalfactoren invullen.')} ${t('input.gradeHint', 'De keuzelijsten vullen fck en fcd = fck / 1,5, fyd = fyk / 1,15 en fy / 1,0 in; een eigen waarde blijft mogelijk.')}`}</Info>
    </More>

    <More title={t('input.surchargeSection', 'Bovenbelasting en gronddruk')}>
      <Row label={t('input.surcharge', 'Bovenbelasting q')} unit="kPa"><NumberInput label={t('input.surchargeLabel', 'Bovenbelasting [kPa]')} value={i.surchargeKpa} onChange={(v) => change({ surchargeKpa: v })} /></Row>
      <Row label={t('input.model', 'Model')}><select aria-label={t('input.surchargeModel', 'Bovenbelastingmodel')} value={i.surchargeMode} onChange={(e) => change({ surchargeMode: e.target.value as LateralInput['surchargeMode'] })}><option value="unresolved">{t('input.unresolved', 'Vrijstaande paal (niet toegepast)')}</option><option value="retaining">{t('input.retaining', 'Kerend element, eenzijdig q')}</option></select></Row>
      <Row label={t('input.influenceWidth', 'Kerende invloedbreedte')} unit="m"><NumberInput label={`${t('input.influenceWidth', 'Kerende invloedbreedte')} [m]`} value={i.surchargeWidthM} onChange={(v) => change({ surchargeWidthM: v })} /></Row>
      <Row label={t('input.direction', 'Richting')}><select aria-label={t('input.surchargeDirection', 'Richting bovenbelasting')} value={i.surchargeSign} onChange={(e) => change({ surchargeSign: Number(e.target.value) })}><option value={1}>{t('input.withH', 'Met H mee')}</option><option value={-1}>{t('input.againstH', 'Tegen H in')}</option></select></Row>
      <table className="cs-layer-table" aria-label={t('input.pressureTable', 'Gronddruk per laag')}>
        <thead><tr><th>{t('input.layer', 'Laag')}</th><th>φ<small>°</small></th><th>{t('input.netPressure', 'Netto druk')}<small>kPa</small></th></tr></thead>
        <tbody>{i.layers.map((l, k) => <tr key={k}><td>{k + 1}</td>
          <td><NumberInput label={t('input.layerFriction', 'Wrijvingshoek laag {{n}} [°]', { n: k + 1 })} value={l.frictionDeg} onChange={(v) => setLayer(k, { frictionDeg: v })} /></td>
          <td><NumberInput label={t('input.layerPressure', 'Netto gronddruk laag {{n}} [kPa]', { n: k + 1 })} value={l.netPressureKpa} onChange={(v) => setLayer(k, { netPressureKpa: v })} /></td></tr>)}</tbody>
      </table>
      <Info>{t('input.retainingHint', 'Kerend model: Δp = Ka·q met Ka = tan²(45° − φ/2), lijnlast = Δp × invloedbreedte. Alleen de toename door q; geen strookbelasting of grondverplaatsing rond een vrije paal.')}</Info>
    </More>

    <More title={t('input.settings', 'Rekeninstellingen')}>
      <Row label={t('input.maxElement', 'Maximale elementlengte')} unit="m"><NumberInput label={`${t('input.maxElement', 'Maximale elementlengte')} [m]`} value={i.maxElementM} onChange={(v) => change({ maxElementM: v })} /></Row>
      <label className="cs-check"><input type="checkbox" checked={i.toeFixed} onChange={(e) => change({ toeFixed: e.target.checked })} /> {t('input.toeFixed', 'Paalpunt ingeklemd')}</label>
    </More>
  </div>;
}
