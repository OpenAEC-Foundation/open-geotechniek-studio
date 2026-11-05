// Instellingen van een paaldraagvermogenberekening: paalfactoren (tabel of
// projectwaarde), partiële factoren en de standaardreeksen die de invoer en
// de draagvermogentabel aanbieden. Alles wordt bij deze berekening bewaard.
import { useEffect, useState } from "react";
import type { PanelProps } from "../../../framework/types";
import { Hint, NumberInput, Row, Section } from "../../../framework/views/SheetForm";
import { resolvePileType } from "../catalog";
import type { PileInput, PileResult, ProjectPileFactors } from "../types";
import { DEFAULT_SIZES, seriesFor, sizeText } from "../standard-sizes";

const FACTORS: Array<[keyof Pick<ProjectPileFactors, "alphaP" | "alphaS" | "alphaT" | "beta" | "s">, string]> = [
  ["alphaP", "αp"], ["alphaS", "αs"], ["alphaT", "αt"], ["beta", "β"], ["s", "s"],
];
const parseList = (text: string) => {
  const v = text.split(/[;\s]+/).map((t) => Number(t.replace(",", "."))).filter((x) => Number.isFinite(x) && x > 0);
  return [...new Set(v)].sort((a, b) => a - b);
};

/** Tekstveld voor een reeks getallen, toegepast bij Enter of verlaten. */
function ListField({ label, value, onApply }: { label: string; value: number[]; onApply: (v: number[]) => void }) {
  const key = value.join(" ");
  const [text, setText] = useState(value.map(sizeText).join(" "));
  useEffect(() => setText(value.map(sizeText).join(" ")), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = () => { const v = parseList(text); if (v.length) onApply(v); else setText(value.map(sizeText).join(" ")); };
  return <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={apply} onKeyDown={(e) => { if (e.key === "Enter") apply(); }} />;
}

export function SettingsPanel({ input, onChange }: PanelProps<PileInput, PileResult>) {
  const type = resolvePileType(input);
  const set = (patch: Partial<PileInput>) => onChange?.({ ...input, ...patch });
  const presets = input.presets ?? {};
  const series = seriesFor(input.pileTypeId, input.presets);
  const own = input.projectFactors;
  const setFactor = (key: (typeof FACTORS)[number][0], v: number) => set({
    projectFactors: {
      alphaP: own?.alphaP ?? type?.alphaP ?? 0, alphaS: own?.alphaS ?? type?.alphaS ?? 0, alphaT: own?.alphaT ?? type?.alphaT ?? 0,
      beta: own?.beta ?? type?.beta ?? 1, s: own?.s ?? type?.s ?? 1,
      source: own?.source ?? "Instellingen van de berekening", edition: own?.edition ?? type?.edition ?? "2017", [key]: v,
    },
  });
  const sizesOwn = presets.sizesMm?.[input.pileTypeId];

  return <div className="cs-settings">
    <Section title={`Paalfactoren · ${type?.name ?? input.pileTypeId}`}>
      <table className="cs-layer-table cs-settings-table" aria-label="Paalfactoren">
        <thead><tr><th>Factor</th><th>Tabel</th><th>Project</th></tr></thead>
        <tbody>{FACTORS.map(([key, label]) => <tr key={key}><td>{label}</td><td className="cs-settings-default">{type?.[key] === undefined ? "—" : sizeText(type[key])}</td>
          <td><NumberInput label={`${label} project`} value={own?.[key]} onChange={(v) => setFactor(key, v)} /></td></tr>)}</tbody>
      </table>
      {own && <>
        <Row label="Bron / verklaring"><input aria-label="Bron projectfactoren" value={own.source} onChange={(e) => set({ projectFactors: { ...own, source: e.target.value } })} /></Row>
        <button type="button" className="cs-settings-reset" onClick={() => set({ projectFactors: undefined })}>Tabelwaarden gebruiken</button>
      </>}
      <Hint>Leeg = tabelwaarde van de gekozen norm ({type?.edition ?? "bestaand model"}). Een projectwaarde vraagt een onderbouwing, bijvoorbeeld een proefbelasting.</Hint>
    </Section>

    <Section title="Partiële factoren">
      <Row label="γm materiaalfactor" unit="—"><NumberInput label="γm materiaalfactor" value={input.gammaM} onChange={(v) => set({ gammaM: v })} /></Row>
      <Row label="γf;nk negatieve kleef" unit="—"><NumberInput label="γf;nk negatieve kleef" value={input.gammaFnk} onChange={(v) => set({ gammaFnk: v })} /></Row>
    </Section>

    <Section title="Standaardreeksen">
      <Row label={`Maten ${type?.name.split(" —")[0] ?? ""}`} unit="mm">
        <ListField label="Maatreeks paaltype [mm]" value={series.sizes ?? []} onApply={(v) => set({ presets: { ...presets, sizesMm: { ...presets.sizesMm, [input.pileTypeId]: v } } })} />
      </Row>
      {sizesOwn && <button type="button" className="cs-settings-reset" onClick={() => { const next = { ...presets.sizesMm }; delete next[input.pileTypeId]; set({ presets: { ...presets, sizesMm: next } }); }}>
        Standaardreeks herstellen{DEFAULT_SIZES[input.pileTypeId] ? "" : " (geen)"}</button>}
      <Hint>De reeks voor de keuzelijst in de invoer (buismaten) en de knop Standaardreeks in de draagvermogentabel.</Hint>

      <h5 className="cs-settings-sub">Betonopzetters op hout</h5>
      <table className="cs-layer-table cs-settings-table" aria-label="Betonopzetters">
        <thead><tr><th>Vorm</th><th>Maat [mm]</th><th /></tr></thead>
        <tbody>{series.extensions.map((e, k) => <tr key={k}>
          <td><select aria-label={`Vorm opzetter ${k + 1}`} value={e.isCircular ? "rond" : "vierkant"} onChange={(ev) => set({ presets: { ...presets, extensions: series.extensions.map((x, j) => ({ sizeMm: x.sizeMm, isCircular: j === k ? ev.target.value === "rond" : x.isCircular })) } })}>
            <option value="rond">Rond</option><option value="vierkant">Vierkant</option></select></td>
          <td><NumberInput label={`Maat opzetter ${k + 1} [mm]`} value={e.sizeMm} onChange={(v) => set({ presets: { ...presets, extensions: series.extensions.map((x, j) => ({ sizeMm: j === k ? v : x.sizeMm, isCircular: x.isCircular })) } })} /></td>
          <td><button type="button" className="lat-mini" aria-label={`Opzetter ${k + 1} verwijderen`} disabled={series.extensions.length < 2}
            onClick={() => set({ presets: { ...presets, extensions: series.extensions.filter((_, j) => j !== k).map((x) => ({ sizeMm: x.sizeMm, isCircular: x.isCircular })) } })}>×</button></td>
        </tr>)}</tbody>
      </table>
      <button type="button" className="lat-add" onClick={() => set({ presets: { ...presets, extensions: [...series.extensions.map((x) => ({ sizeMm: x.sizeMm, isCircular: x.isCircular })), { sizeMm: 220, isCircular: true }] } })}>+ Opzetter</button>
      <Row label="Lengtes opzetter" unit="m">
        <ListField label="Lengtes opzetter [m]" value={series.extensionLengths} onApply={(v) => set({ presets: { ...presets, extensionLengthsM: v } })} />
      </Row>
      <Row label="Puntdiameter hout" unit="mm"><NumberInput label="Puntdiameter hout [mm]" value={series.timberToeMm} onChange={(v) => set({ presets: { ...presets, timberToeMm: v } })} /></Row>
      {input.presets && <button type="button" className="cs-settings-reset" onClick={() => set({ presets: undefined })}>Alle reeksen terug naar standaard</button>}
    </Section>
  </div>;
}
