// Invoer van de ankerstaaf met verankering (ankerschot, ankerpaal of ankerplaat) en de uitkomst van de liggingcontrole.
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Hint, NumberInput, Row } from "../../framework/views/SheetForm";
import { numberLocale } from "../../i18n";
import { E_STEEL_MPA, sheetPileCatalog } from "../../library/sheetPiles";
import { DEFAULT_TIE, type WallAnchor, type WallInput, type WallOk } from "./compute";
import { TIE_GRADES, coarsePitch, defaultAnchorage, rodSection, tieGradeValues, tieGeometry, type RodType, type TieAnchorage, type TieAnchorageType } from "./tie-anchorage";

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");

/** Type verankering, de maten per type en de staaf zelf, voor één ankerstaaf. */
export function TieAnchorageFields({ input: i, anchor: a, id, onChange }: { input: WallInput; anchor: WallAnchor; id: string; onChange: (patch: Partial<WallAnchor>) => void }) {
  const { t } = useTranslation("calcWall");
  const catalog = useMemo(() => sheetPileCatalog(), []);
  const an = a.anchorage, tie = { ...DEFAULT_TIE, ...a.tie }, rod = rodSection(tie), rodType = tie.rodType ?? "custom";
  const setAn = (patch: Partial<TieAnchorage>) => onChange({ anchorage: { ...an!, ...patch } });
  const setTie = (patch: Partial<typeof tie>) => onChange({ tie: { ...tie, ...patch } });
  const suffix = id === "A1" ? "" : `, ${id}`;
  const num = (label: string, unit: string, value: number, apply: (v: number) => void, min?: number) =>
    <Row key={label} label={label} unit={unit || undefined}><NumberInput label={`${label}${unit ? ` [${unit}]` : ""}${suffix}`} min={min} value={value} onChange={apply} /></Row>;
  const pickType = (v: string) => {
    if (!v) { onChange({ anchorage: undefined }); return; }
    const type = v as TieAnchorageType;
    onChange({ anchorage: an ? { ...an, type } : defaultAnchorage(type, { levelNap: a.levelNap, groundNap: i.groundHighNap, toeNap: i.toeNap, profileId: i.construction === "sheet-pile" ? i.profileId : "", manufacturer: i.manufacturer }) });
  };
  const geometry = an ? tieGeometry(a.levelNap, a.angleDeg, an) : null;
  const profiles = [...catalog.entries()].flatMap(([m, series]) => [...series.values()].flat().map((p) => ({ m, id: p.id })));
  return <div className="sw-tie">
    <Row label={t("tie.type", "Verankering")}><select aria-label={`${t("tie.type", "Verankering")}${suffix}`} value={an?.type ?? ""} onChange={(e) => pickType(e.target.value)}>
      <option value="">{t("tie.typeNone", "Niet opgegeven (schematisch)")}</option>
      <option value="wall">{t("tie.typeWallLong", "Ankerschot (korte damwand of ankerwand)")}</option>
      <option value="pile">{t("tie.typePileLong", "Ankerpaal (schuin of verticaal)")}</option>
      <option value="plate">{t("tie.typePlateLong", "Ankerplaat of betonblok")}</option></select></Row>
    {an && <>
      {num(t("tie.length", "Lengte staaf tot verankering"), "m", an.lengthM, (v) => setAn({ lengthM: v }), 0.01)}
      {an.type === "wall" && <>
        {num(t("tie.wallTop", "Bovenkant schot"), "m NAP", an.wallTopNap, (v) => setAn({ wallTopNap: v }))}
        {num(t("tie.wallBottom", "Onderkant schot"), "m NAP", an.wallBottomNap, (v) => setAn({ wallBottomNap: v }))}
        <Row label={t("tie.wallProfile", "Profiel van het schot")}><select aria-label={`${t("tie.wallProfile", "Profiel van het schot")}${suffix}`} value={an.wallProfileId ? `${an.wallManufacturer ?? ""}|${an.wallProfileId}` : ""} onChange={(e) => { const [m, p] = e.target.value.split("|"); setAn({ wallProfileId: p ?? "", wallManufacturer: m || undefined }); }}>
          <option value="">{t("tie.wallPlate", "Geen profiel: plaat per anker")}</option>
          {profiles.map((p) => <option key={`${p.m}|${p.id}`} value={`${p.m}|${p.id}`}>{`${p.id} (${p.m})`}</option>)}</select></Row>
        {!an.wallProfileId && <>
          {num(t("tie.width", "Breedte per anker"), "m", an.wallWidthM, (v) => setAn({ wallWidthM: v }), 0.01)}
          {num(t("tie.thickness", "Dikte"), "m", an.wallThicknessM, (v) => setAn({ wallThicknessM: v }), 0.001)}
        </>}
      </>}
      {an.type === "pile" && <>
        {num(t("tie.pileLength", "Lengte van de paal"), "m", an.pileLengthM, (v) => setAn({ pileLengthM: v }), 0.01)}
        {num(t("tie.pileRake", "Helling met de verticaal"), "°", an.pileRakeDeg, (v) => setAn({ pileRakeDeg: v }))}
        {num(t("tie.pileDiameter", "Diameter van de paal"), "mm", an.pileDiameterMm, (v) => setAn({ pileDiameterMm: v }), 1)}
      </>}
      {an.type === "plate" && <>
        {num(t("tie.width", "Breedte per anker"), "m", an.plateWidthM, (v) => setAn({ plateWidthM: v }), 0.01)}
        {num(t("tie.height", "Hoogte"), "m", an.plateHeightM, (v) => setAn({ plateHeightM: v }), 0.01)}
        {num(t("tie.thickness", "Dikte"), "m", an.plateThicknessM, (v) => setAn({ plateThicknessM: v }), 0.001)}
      </>}
      {geometry && <Hint>{t("tie.where", "Voorkant van de verankering {{x}} m achter de wand op NAP {{z}} m; {{what}} van NAP {{top}} tot {{bottom}} m.", { x: fmt(geometry.front.x, 2), z: fmt(geometry.front.z, 2), what: an.type === "pile" ? t("tie.pileFromTo", "paal") : an.type === "wall" ? t("tie.typeWall", "ankerschot") : t("tie.typePlate", "ankerplaat"), top: fmt(geometry.topNap, 2), bottom: fmt(geometry.bottomNap, 2) })}</Hint>}
    </>}
    <Row label={t("tie.rodType", "Staaf")}><select aria-label={`${t("tie.rodType", "Staaf")}${suffix}`} value={rodType} onChange={(e) => { const v = e.target.value as RodType; setTie(v === "custom" ? { rodType: v } : { rodType: v, diameterMm: tie.diameterMm ?? Math.round(rod.diameterMm), pitchMm: tie.pitchMm ?? coarsePitch(tie.threadDiameterMm ?? Math.round(rod.diameterMm)) }); }}>
      <option value="custom">{t("tie.rodCustom", "Eigen doorsneden A_g en A_s (tabel van de leverancier)")}</option>
      <option value="plain">{t("tie.rodPlain", "Gladde staaf met gesneden draad")}</option>
      <option value="upset">{t("tie.rodUpset", "Staaf met opgestuikte draad")}</option></select></Row>
    {rodType === "custom" ? <>
      {num(t("stage.tieGross", "Bruto doorsnede A_g"), "mm²", tie.grossMm2, (v) => setTie({ grossMm2: v }), 1)}
      {num(t("stage.tieThread", "Spanningsdoorsnede draad A_s"), "mm²", tie.threadMm2, (v) => setTie({ threadMm2: v }), 1)}
    </> : <>
      {num(t("tie.diameter", "Diameter van de staaf"), "mm", tie.diameterMm ?? 0, (v) => setTie({ diameterMm: v }), 1)}
      {rodType === "upset" && num(t("tie.threadDiameter", "Draaddiameter"), "mm", tie.threadDiameterMm ?? 0, (v) => setTie({ threadDiameterMm: v }), 1)}
      {num(t("tie.pitch", "Spoed van de draad"), "mm", tie.pitchMm ?? coarsePitch(rodType === "upset" ? tie.threadDiameterMm ?? 0 : tie.diameterMm ?? 0), (v) => setTie({ pitchMm: v }), 0.1)}
    </>}
    <Row label={t("tie.grade", "Staalsoort")}><select aria-label={`${t("tie.grade", "Staalsoort")}${suffix}`} value={TIE_GRADES.some((g) => g.id === tie.gradeId) && tieGradeValues(tie.gradeId!, rod.diameterMm)?.fyMPa === tie.fyMPa ? tie.gradeId : ""} onChange={(e) => { const v = tieGradeValues(e.target.value, rod.diameterMm); if (v) setTie({ gradeId: e.target.value, ...v }); }}>
      <option value="">{t("input.ownValues", "Eigen waarden")}</option>{TIE_GRADES.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}</select></Row>
    {num("f_y", "N/mm²", tie.fyMPa, (v) => setTie({ fyMPa: v }), 1)}
    {num("f_ua", "N/mm²", tie.fuMPa, (v) => setTie({ fuMPa: v }), 1)}
    <Hint>{t("tie.rodHint", "A_g = {{ag}} mm², A_s = {{as}} mm²; A_s = π/4 · (d − 0,9382 · P)² volgens NEN-EN ISO 898-1, spoed standaard de grove draad van ISO 261. f_y en f_u uit NEN-EN 1993-1-1 tabel 3.1 (tot 40 mm en van 40 tot 80 mm; daarboven eigen invoer). Ter vergelijking: E · A_g / L = {{k}} kN/m per anker.", { ag: fmt(rod.grossMm2, 0), as: fmt(rod.threadMm2, 0), k: an ? fmt((E_STEEL_MPA * rod.grossMm2) / 1000 / an.lengthM, 0) : "—" })}</Hint>
  </div>;
}

/** Uitkomst van de liggingcontrole per ankerstaaf. */
export function TieResult({ result: r }: { result: WallOk }) {
  const { t } = useTranslation("calcWall");
  if (!r.ties?.length) return null;
  const typeName = (x: TieAnchorageType) => (x === "wall" ? t("tie.typeWall", "ankerschot") : x === "pile" ? t("tie.typePile", "ankerpaal") : t("tie.typePlate", "ankerplaat"));
  return <>
    <h3>{t("tie.result", "Ankerstaaf en verankering")}</h3>
    <table className="cs-layer-table sw-summary" aria-label={t("tie.resultAria", "Ligging van de verankering")}>
      <thead><tr><th /><th>{t("tie.activeX", "Actief glijvlak")}<small>m</small></th><th>{t("tie.requiredX", "Nodig met passief glijvlak")}<small>m</small></th><th>{t("tie.frontX", "Aanwezig")}<small>m</small></th><th /></tr></thead>
      <tbody>{r.ties.map((x) => <tr key={x.id}><td>{`${x.id}: ${typeName(x.type)}`}</td><td>{fmt(x.activeXM, 2)}</td><td>{x.passive ? fmt(x.passive.requiredXM, 2) : "—"}</td><td>{fmt(x.frontXM, 2)}</td><td>{x.passes ? t("tie.ok", "voldoet") : t("tie.notOk", "voldoet niet")}</td></tr>)}</tbody>
    </table>
    <p className="cs-hint">{t("tie.resultHint", "Afstanden achter de wand: het actieve glijvlak vanaf de teen onder 45° + φ′/2 op het niveau van de voorkant van de verankering; bij een schot of plaat de afstand waarbij het passieve glijvlak (45° − φ′/2 vanaf de onderkant) het actieve glijvlak niet onder het maaiveld snijdt (CUR 166; Terzaghi, 1943). Niet in deze versie: de sterkte van het schot, de paal of de plaat zelf.")}</p>
  </>;
}
