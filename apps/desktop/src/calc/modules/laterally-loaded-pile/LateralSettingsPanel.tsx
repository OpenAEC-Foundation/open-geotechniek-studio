// Instellingen van een horizontale paalberekening: beddingswaarden per
// grondsoort (tabel of eigen waarde) en een pu-profiel per grondsoort dat
// een laag krijgt zodra je die grondsoort kiest.
import type { PanelProps } from '../../framework/types';
import { Hint, NumberInput, Section } from '../../framework/views/SheetForm';
import type { LateralInput, LateralResult } from './compute';
import type { UltimateProfile } from './spring-types';
import { SOIL_SPRINGS } from './soil';
import { soilColor } from './report-data';
import { OaIcon } from '../../../components/icons/oaIcon';

const PU_KEYS: Array<[keyof UltimateProfile, string]> = [['atSurfaceKnM', 'pu,0'], ['gradientKnM2', 'g'], ['capKnM', 'pu,max']];

export function LateralSettingsPanel({ input: i, onChange }: PanelProps<LateralInput, LateralResult>) {
  const change = (patch: Partial<LateralInput>) => onChange?.({ ...i, ...patch });
  const overrides = i.springOverrides ?? {}, pu = i.puDefaults ?? {};
  const setKh = (id: string, scenario: 'low' | 'high', v: number | undefined) => {
    const row = { ...overrides[id], [scenario]: v };
    if (row.low === undefined && row.high === undefined) { const next = { ...overrides }; delete next[id]; change({ springOverrides: next }); }
    else change({ springOverrides: { ...overrides, [id]: row } });
  };
  const setPu = (id: string, key: keyof UltimateProfile, v: number) =>
    change({ puDefaults: { ...pu, [id]: { ...(pu[id] ?? { atSurfaceKnM: NaN, gradientKnM2: NaN, capKnM: NaN }), [key]: v } } });
  const used = (id: string) => i.layers.filter((l) => l.springId === id).length;
  // pu-profielen van de huidige lagen overnemen als standaard per grondsoort.
  const fromLayers = () => {
    const next = { ...pu };
    i.layers.forEach((l) => { if (l.ultimate && l.springId !== 'manual' && !next[l.springId]) next[l.springId] = { ...l.ultimate }; });
    change({ puDefaults: next });
  };
  const applyToLayers = (id: string) => {
    const profile = pu[id];
    if (!profile || !Object.values(profile).every(Number.isFinite)) return;
    change({ layers: i.layers.map((l) => l.springId === id ? { ...l, ultimate: { ...profile } } : l) });
  };

  return <div className="cs-settings">
    <Section title="Beddingswaarden kh [kN/m³]">
      <table className="cs-layer-table cs-settings-table" aria-label="Beddingswaarden per grondsoort">
        <thead><tr><th /><th>Grondsoort</th><th>Laag gem.<small>tabel · eigen</small></th><th>Hoog gem.<small>tabel · eigen</small></th><th>Lagen</th></tr></thead>
        <tbody>{SOIL_SPRINGS.map((s) => <tr key={s.id} className={i.scenario === 'low' ? 'cs-settings-low' : 'cs-settings-high'}>
          <td><span className="lateral-swatch" style={{ background: soilColor(s.id).fill }} /></td>
          <td>{s.label}</td>
          {(['low', 'high'] as const).map((sc) => <td key={sc} className={i.scenario === sc ? 'cs-settings-active' : ''}>
            <span className="cs-settings-default">{s[sc].toLocaleString('nl-NL')}</span>
            <NumberInput label={`kh ${s.id} ${sc === 'low' ? 'laag' : 'hoog'} [kN/m³]`} value={overrides[s.id]?.[sc]} onChange={(v) => setKh(s.id, sc, v)} />
            {overrides[s.id]?.[sc] !== undefined && <button type="button" className="lat-mini" aria-label={`Tabelwaarde ${s.id} ${sc === 'low' ? 'laag' : 'hoog'}`} title="Terug naar tabelwaarde" onClick={() => setKh(s.id, sc, undefined)}><OaIcon id="input.reset-default" /></button>}
          </td>)}
          <td className="cs-settings-default">{used(s.id) || ''}</td>
        </tr>)}</tbody>
      </table>
      <Hint>CUR166 deel 1, tabel 3.3, eerste secanttraject (wandbedding). De kolom van het gekozen scenario ({i.scenario === 'low' ? 'laag' : 'hoog'} gemiddelde) is gemarkeerd. Een eigen waarde geldt voor alle lagen met die grondsoort in deze berekening.</Hint>
    </Section>

    <Section title="Grensweerstand pu per grondsoort [kN/m]">
      <table className="cs-layer-table cs-settings-table" aria-label="pu-profiel per grondsoort">
        <thead><tr><th /><th>Grondsoort</th>{PU_KEYS.map(([k, l]) => <th key={k}>{l}<small>{k === 'gradientKnM2' ? 'kN/m²' : 'kN/m'}</small></th>)}<th /></tr></thead>
        <tbody>{SOIL_SPRINGS.map((s) => <tr key={s.id}>
          <td><span className="lateral-swatch" style={{ background: soilColor(s.id).fill }} /></td><td>{s.label.split(' (')[0]}</td>
          {PU_KEYS.map(([k, l]) => <td key={k}><NumberInput label={`${l} ${s.id}`} value={pu[s.id]?.[k]} onChange={(v) => setPu(s.id, k, v)} /></td>)}
          <td>{used(s.id) > 0 && pu[s.id] && <button type="button" className="lat-mini" onClick={() => applyToLayers(s.id)}>Op {used(s.id)} {used(s.id) === 1 ? 'laag' : 'lagen'}</button>}</td>
        </tr>)}</tbody>
      </table>
      <div className="cs-settings-actions">
        <button type="button" className="lat-add" onClick={fromLayers}>Overnemen uit de lagen</button>
        {i.puDefaults && <button type="button" className="cs-settings-reset" onClick={() => change({ puDefaults: undefined })}>Leegmaken</button>}
      </div>
      <Hint>pu(zeq) = min(pu,max; pu,0 + g·zeq) is een projectaanname, geen normwaarde. Kies je in de invoer een grondsoort met een profiel, dan krijgt de laag dat profiel.</Hint>
    </Section>
  </div>;
}
