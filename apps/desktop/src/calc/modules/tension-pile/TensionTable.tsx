// Trekweerstand per puntniveau en sondering, per paalmaat. Elke cel is te openen als rekenblad.
import { useEffect, useMemo, useState } from "react";
import type { Cpt } from "../../../types/cpt";
import type { TablePanelProps } from "../../framework/types";
import { levelRange, parseSizes, parseToeLevels } from "../pile-bearing-capacity/capacity-table";
import "../pile-bearing-capacity/ui/capacity-table.css";
import { OaIcon } from "../../../components/icons/oaIcon";
import { getTensionPileType } from "./catalog";
import type { TensionInput, TensionTableConfig } from "./compute";
import { cellInput, computeTensionTable, sizeLabel, type TensionCell, type TensionTable as Table } from "./table";
import { fmt } from "./panels";
import "./styles.css";

const num = (text: string) => Number(text.replace(",", "."));
const level = (v: number) => fmt(v, 2);

export function TensionTable({ input, ctx, onChange, onOpen, focus, onFocus }: TablePanelProps<TensionInput>) {
  const cpts = ctx.cpts;
  const computed = useMemo(() => {
    try { return { table: computeTensionTable(input, cpts), error: "" }; }
    catch (e) { return { table: null, error: e instanceof Error ? e.message : String(e) }; }
  }, [input, cpts]);
  const table = computed.table;
  if (!table) return <section className="capacity-grid"><p role="alert" className="capacity-grid-error">{computed.error}</p></section>;
  const config = table.config;
  const update = (patch: Partial<TensionTableConfig>) => onChange({ ...input, table: { ...config, ...patch } });
  const open = (cptId: string, sizeMm: number, toeNap: number) => { onChange({ ...cellInput(input, cptId, sizeMm, toeNap), table: config }); onOpen(); };
  const shown = focus && config.cptIds.includes(focus) ? focus : null;
  return <section className="capacity-grid tp-table" aria-label="Trekweerstandtabel">
    {shown
      ? <nav className="capacity-crumbs" aria-label="Kruimelpad"><button type="button" onClick={() => onFocus(null)}>Trekweerstandtabel</button><span aria-hidden="true">›</span><span>Sondering {shown}</span></nav>
      : <><h2>Trekweerstand per sondering en puntniveau</h2>
        <p className="capacity-intro">Eén paalsysteem in een reeks maten en puntniveaus, gerekend op iedere sondering. De eindwaarde per niveau is het laagste van het gemiddelde met ξ3 = {fmt(table.xi3, 2)} en de laagste sondering met ξ4 = {fmt(table.xi4, 2)}.</p></>}
    <Settings input={input} cpts={cpts} config={config} update={update} />
    {table.missing.length > 0 && <p role="status" className="capacity-grid-error">Ontbreekt in het project: {table.missing.join(", ")}.</p>}
    {!config.cptIds.length && <p role="status">Selecteer ten minste één sondering.</p>}
    {config.sizesMm.map((sizeMm, si) => <SizeTable key={sizeMm} input={input} table={table} cells={table.cells[si]} sizeMm={sizeMm} only={shown} open={open} focus={onFocus} />)}
  </section>;
}

function SizeTable({ input, table, cells, sizeMm, only, open, focus }: { input: TensionInput; table: Table; cells: TensionCell[]; sizeMm: number; only: string | null; open: (cptId: string, sizeMm: number, toeNap: number) => void; focus: (id: string | null) => void }) {
  const ids = (cells[0]?.perCpt.map((p) => p.cptId) ?? []).filter((id) => !only || id === only);
  const target = input.ftDKn;
  return <div className="capacity-cpt">
    <h3>{sizeLabel(input, sizeMm)} mm</h3>
    <div className="capacity-grid-scroll"><table aria-label={`Trekweerstand ${sizeLabel(input, sizeMm)} mm`}>
      <caption>Rt;d per sondering [kN], gerekend met ξ3. {target > 0 ? `Groen: Rt;d ≥ Ft;d = ${fmt(target, 0)} kN.` : "Vul Ft;d in om de toets te zien."} Klik een waarde voor het rekenblad.</caption>
      <thead><tr><th scope="col">Punt [m NAP]</th>
        {ids.map((id) => <th scope="col" key={id}><button type="button" className="capacity-link" onClick={() => focus(only ? null : id)}>{id}</button></th>)}
        {!only && <><th scope="col" className="capacity-sum">Gemiddeld (ξ3)</th><th scope="col" className="capacity-sum">Laagste (ξ4)</th><th scope="col" className="capacity-sum">Rt;d</th>{target > 0 && <th scope="col" className="capacity-sum">u.c.</th>}</>}
      </tr></thead>
      <tbody>{cells.map((cell) => <tr key={cell.toeNap}>
        <th scope="row">{level(cell.toeNap)}</th>
        {cell.perCpt.filter((p) => ids.includes(p.cptId)).map((p) => <td key={p.cptId} className={p.mean.ok ? (target > 0 ? (p.mean.rtDKn >= target ? "band-within" : "band-under") : "") : "is-invalid"}>
          <button type="button" onClick={() => open(p.cptId, sizeMm, cell.toeNap)} aria-label={`Open ${p.cptId}, ${sizeMm} mm op ${level(cell.toeNap)} m NAP`} title={p.mean.ok ? (p.mean.warnings.join("\n") || undefined) : p.mean.error}>
            {p.mean.ok ? fmt(p.mean.rtDKn, 0) : <span className="capacity-reason">niet berekend</span>}</button></td>)}
        {!only && <>
          <td className="capacity-sum">{cell.meanKn === null ? "—" : fmt(cell.meanKn, 0)}</td>
          <td className="capacity-sum">{cell.minKn === null ? "—" : fmt(cell.minKn, 0)}</td>
          <td className={`capacity-sum${cell.rtDKn !== null && target > 0 ? (cell.rtDKn >= target ? " band-within" : " band-under") : ""}`}><strong>{cell.rtDKn === null ? "—" : fmt(cell.rtDKn, 0)}</strong>{cell.governing && table.config.cptIds.length > 1 ? <small> {cell.governing === "mean" ? "gem." : "min."}</small> : null}</td>
          {target > 0 && <td className="capacity-sum">{cell.unityCheck === null ? "—" : fmt(cell.unityCheck, 2)}</td>}
        </>}
      </tr>)}</tbody>
    </table></div>
  </div>;
}

function Settings({ input, cpts, config, update }: { input: TensionInput; cpts: Map<string, Cpt>; config: Required<TensionTableConfig>; update: (p: Partial<TensionTableConfig>) => void }) {
  const names = [...new Set([...cpts.keys(), ...config.cptIds])];
  const std = getTensionPileType(input.pileTypeId)?.sizesMm;
  const sorted = [...config.toeNaps].sort((a, b) => b - a);
  const step = sorted.length > 1 ? Math.abs(sorted[0] - sorted[1]) : 0.5;
  const sizesKey = config.sizesMm.join(" "), levelsKey = config.toeNaps.join(";");
  const [sizes, setSizes] = useState(sizesKey);
  const [range, setRange] = useState({ from: String(sorted[0]), to: String(sorted[sorted.length - 1]), step: String(step) });
  const [list, setList] = useState(() => config.toeNaps.join("\n"));
  const [error, setError] = useState("");
  const [pickState, setPick] = useState({ cptId: input.cptId ?? config.cptIds[0] ?? "", sizeMm: input.sizeMm, toeNap: input.pileToeNap });
  const pick = {
    cptId: config.cptIds.includes(pickState.cptId) ? pickState.cptId : config.cptIds[0] ?? "",
    sizeMm: config.sizesMm.includes(pickState.sizeMm) ? pickState.sizeMm : config.sizesMm[0],
    toeNap: config.toeNaps.includes(pickState.toeNap) ? pickState.toeNap : sorted[0],
  };
  useEffect(() => setSizes(sizesKey), [sizesKey]);
  useEffect(() => { setList(config.toeNaps.join("\n")); setRange({ from: String(sorted[0]), to: String(sorted[sorted.length - 1]), step: String(step) }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [levelsKey]);
  const tryApply = (fn: () => void) => { try { fn(); setError(""); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } };
  return <div className="capacity-settings">
    <fieldset><legend>Paalmaten</legend>
      <label>Paalmaten [mm]<input value={sizes} onChange={(e) => setSizes(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") tryApply(() => update({ sizesMm: parseSizes(sizes) })); }} /></label>
      <div className="capacity-buttons">
        <button type="button" onClick={() => tryApply(() => update({ sizesMm: parseSizes(sizes) }))}>Maten toepassen</button>
        {std && <button type="button" onClick={() => update({ sizesMm: std })}>Standaardreeks</button>}
      </div>
    </fieldset>
    <fieldset><legend>Puntniveaus</legend>
      <div className="capacity-range">
        <label>Van [m NAP]<input inputMode="decimal" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></label>
        <label>Tot [m NAP]<input inputMode="decimal" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></label>
        <label>Stap [m]<input inputMode="decimal" value={range.step} onChange={(e) => setRange({ ...range, step: e.target.value })} /></label>
      </div>
      <div className="capacity-buttons"><button type="button" onClick={() => tryApply(() => update({ toeNaps: levelRange(num(range.from), num(range.to), num(range.step)) }))}>Reeks toepassen</button>
        <span className="capacity-count">{config.toeNaps.length} niveaus</span></div>
      <details><summary>Eigen niveaus</summary>
        <label>Puntniveaus [m NAP]<textarea rows={4} value={list} onChange={(e) => setList(e.target.value)} /></label>
        <button type="button" onClick={() => tryApply(() => update({ toeNaps: parseToeLevels(list) }))}>Niveaus toepassen</button>
      </details>
    </fieldset>
    <fieldset className="capacity-examples"><legend>Uitdraai</legend>
      <p>Volledig uitgewerkt in het rapport; daarna volgen de tabellen. Zonder keuze gaat het huidige rekenblad mee.</p>
      {config.examples.length > 0 && <ul aria-label="Voorbeeldberekeningen">{config.examples.map((e, k) => <li key={k}><span>{e.cptId} · {e.sizeMm} mm · NAP {level(e.toeNap)}</span>
        <button type="button" aria-label={`Verwijder voorbeeld ${e.cptId}, ${e.sizeMm} mm op ${level(e.toeNap)} m NAP`} onClick={() => update({ examples: config.examples.filter((_, j) => j !== k) })}><OaIcon id="list.item-remove" /></button></li>)}</ul>}
      <div className="capacity-example-add">
        <select aria-label="Voorbeeld: sondering" value={pick.cptId} onChange={(e) => setPick({ ...pick, cptId: e.target.value })}>{config.cptIds.map((id) => <option key={id} value={id}>{id}</option>)}</select>
        <select aria-label="Voorbeeld: maat" value={pick.sizeMm} onChange={(e) => setPick({ ...pick, sizeMm: Number(e.target.value) })}>{config.sizesMm.map((v) => <option key={v} value={v}>{v} mm</option>)}</select>
        <select aria-label="Voorbeeld: puntniveau" value={pick.toeNap} onChange={(e) => setPick({ ...pick, toeNap: Number(e.target.value) })}>{sorted.map((v) => <option key={v} value={v}>{level(v)}</option>)}</select>
        <button type="button" disabled={!config.cptIds.includes(pick.cptId) || config.examples.some((e) => e.cptId === pick.cptId && e.sizeMm === pick.sizeMm && e.toeNap === pick.toeNap)}
          onClick={() => update({ examples: [...config.examples, { ...pick }] })}>Voorbeeld toevoegen</button>
      </div>
    </fieldset>
    <fieldset><legend>Sonderingen</legend>
      <div className="capacity-cpt-options">{names.map((id) => <label key={id}><input type="checkbox" checked={config.cptIds.includes(id)} onChange={(e) => update({ cptIds: e.target.checked ? [...config.cptIds, id] : config.cptIds.filter((v) => v !== id) })} />{cpts.has(id) ? id : `${id} (ontbreekt)`}</label>)}</div>
      <div className="capacity-buttons"><button type="button" onClick={() => update({ cptIds: [...cpts.keys()] })}>Alle sonderingen</button></div>
    </fieldset>
    {error && <p role="alert" className="capacity-grid-error">{error}</p>}
  </div>;
}
