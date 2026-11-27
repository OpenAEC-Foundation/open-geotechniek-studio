// Invoerblok "Grondlagen uit de sondering": een sondering per zijde, de kleinste laagdikte, het voorstel (met
// bevestiging) en per laag de herkomst. De omzetting zelf staat in cpt-layers.ts.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Hint, NumberInput, Row } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { zoneName } from "../../../utils/soilZones";
import { fmt } from "./panels";
import type { WallInput, WallLayer } from "./compute";
import { DEFAULT_MIN_THICKNESS_M, TABLE_3_3, getTableRow, khRowFor, overriddenKeys, wallProfileFromCpt, zoneColor, zoneForSoil } from "./cpt-layers";

/** Waarden van een regel van tabel 2.b met de beddingsconstanten uit tabel 3.3 (met de tabel-qc als ingang). */
export function tableRowValues(id: string): Partial<WallLayer> | undefined {
  const r = getTableRow(id);
  if (!r) return undefined;
  const kh = khRowFor(r, r.qcMpa);
  return { soilId: r.id, name: r.name, zone: zoneForSoil(r.id), source: undefined, gamma: r.gamma, gammaSat: r.gammaSat, phi: r.phi, c: r.c, cu: r.cu,
    delta: r.main === "veen" ? 0 : Math.round(((r.phi * 2) / 3) * 10) / 10, kh: kh?.kh1 ?? 0, kh2: kh?.kh2 && kh.kh3 ? kh.kh2 : undefined, kh3: kh?.kh2 && kh.kh3 ? kh.kh3 : undefined };
}

export function SoilProfileBlock({ input: i, onChange }: { input: WallInput; onChange: (patch: Partial<WallInput>) => void }) {
  const { t } = useTranslation("calcWall");
  const cpts = useCptStore((s) => s.cpts);
  const [warnings, setWarnings] = useState<string[]>([]);
  const high = i.cptId ? cpts.get(i.cptId) : undefined, low = i.cptIdLow ? cpts.get(i.cptIdLow) : undefined;
  const minT = i.layerMinThicknessM ?? DEFAULT_MIN_THICKNESS_M;
  const propose = () => {
    if (!high) return;
    if (i.layersHigh.length && !window.confirm(t("soilProfile.confirm", "De ingevoerde lagen worden vervangen door het voorstel uit de sondering. Doorgaan?"))) return;
    const opts = { minThicknessM: minT, gammaWater: i.gammaWater };
    const h = wallProfileFromCpt(high, { ...opts, waterNap: i.waterHighNap });
    if (!h.layers.length) { setWarnings(h.warnings); return; }
    const patch: Partial<WallInput> = { layersHigh: h.layers };
    let notes = h.warnings;
    if (low) {
      const l = wallProfileFromCpt(low, { ...opts, waterNap: i.waterLowNap });
      if (l.layers.length) Object.assign(patch, { layersLow: l.layers, lowSameAsHigh: false });
      notes = [...notes, ...l.warnings];
    } else if (!i.lowSameAsHigh) patch.layersLow = h.layers.map((l) => ({ ...l }));
    setWarnings(notes);
    onChange(patch);
  };
  const options = <>{[...cpts.keys()].map((id) => <option key={id} value={id}>{id}</option>)}</>;
  return <>
    <Row label={t("soilProfile.cptHigh", "Sondering hoge zijde")}><select aria-label={t("input.cptAria", "Sondering voor het laagvoorstel")} value={i.cptId ?? ""} onChange={(e) => onChange({ cptId: e.target.value || null })}>
      <option value="">{t("input.none", "Geen")}</option>{options}</select></Row>
    <Row label={t("soilProfile.cptLow", "Sondering lage zijde")}><select aria-label={t("soilProfile.cptLow", "Sondering lage zijde")} value={i.cptIdLow ?? ""} onChange={(e) => onChange({ cptIdLow: e.target.value || null })}>
      <option value="">{t("soilProfile.sameCpt", "Dezelfde als hoge zijde")}</option>{options}</select></Row>
    <Row label={t("soilProfile.minThickness", "Kleinste laagdikte")} unit="m"><NumberInput label={`${t("soilProfile.minThickness", "Kleinste laagdikte")} [m]`} min={0} value={minT} onChange={(v) => onChange({ layerMinThicknessM: v })} /></Row>
    <div className="sw-buttons"><button type="button" disabled={!high} onClick={propose}>{t("input.proposal", "Voorstel uit sondering")}</button></div>
    {warnings.map((w, k) => <Hint key={k} warn>{w}</Hint>)}
  </>;
}

/** Per laag uit de sondering: diepte, zone, gemiddelde qc en Rf, σ′v, de tabel-qc en de gekozen tabelregels. */
export function LayerSources({ layers, caption }: { layers: WallLayer[]; caption: string }) {
  const { t } = useTranslation("calcWall");
  if (!layers.some((l) => l.source)) return null;
  return <div className="cs-table-wrap"><table className="cs-layer-table sw-sources" aria-label={`${t("soilProfile.sources", "Herkomst")}, ${caption}`}>
    <thead><tr><th>{t("soilProfile.layer", "Laag")}</th><th>{t("soilProfile.depth", "Diepte")}<small>m −mv</small></th><th>{t("soilProfile.zone", "Zone sondering")}</th><th>qc<small>MPa</small></th><th>Rf<small>%</small></th>
      <th><abbr title={t("soilProfile.sigmaTitle", "Verticale korrelspanning in het midden van de laag, voor de omrekening van qc (NEN 9997-1 tabel 2.b, voetnoot g)")}>σ′v</abbr><small>kPa</small></th>
      <th><abbr title={t("soilProfile.qcEntryTitle", "qc waarmee tabel 2.b is ingegaan: bij zand en grind omgerekend naar σ′v = 100 kPa")}>qc;tabel</abbr><small>MPa</small></th>
      <th>{t("soilProfile.row", "Tabel 2.b")}</th><th>{t("soilProfile.khRow", "Tabel 3.3")}</th><th>{t("soilProfile.own", "Eigen invoer")}</th></tr></thead>
    <tbody>{layers.map((l, k) => { const s = l.source; const own = overriddenKeys(l); const color = zoneColor(s?.zone ?? l.zone);
      return <tr key={k}><td>{k + 1}</td>{s ? <>
        <td>{`${fmt(s.depthTopM, 2)} – ${fmt(s.depthBottomM, 2)}`}</td>
        <td><span className="sw-swatch" style={{ background: color }} />{zoneName(s.zone)}</td>
        <td>{fmt(s.qcMeanMpa, 2)}</td><td>{fmt(s.rfMeanPct, 1)}</td><td>{fmt(s.sigmaVEffKpa, 0)}</td><td>{fmt(s.qcEntryMpa, 1)}</td>
        <td>{getTableRow(s.rowId)?.name ?? s.rowId}</td><td>{s.khRowId ? TABLE_3_3.find((r) => r.id === s.khRowId)?.label : t("soilProfile.noKh", "geen regel: kh zelf invullen")}</td>
        <td>{own.length ? own.join(", ") : "—"}</td>
      </> : <td colSpan={9}>{t("soilProfile.manual", "handmatig")}</td>}</tr>; })}</tbody></table></div>;
}
