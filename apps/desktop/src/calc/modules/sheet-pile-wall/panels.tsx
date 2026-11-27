// Rekenblad damwand: invoer, doorsnede met diagrammen, 3D-weergave en de uitkomsten met de vergelijking tegen Blum.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PanelProps } from "../../framework/types";
import { Hint, More, NumField, NumberInput, Row, Section } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { numberLocale } from "../../i18n";
import { SHEET_PILE_GRADES, sheetPileCatalog } from "../../library/sheetPiles";
import { SOIL_TYPES, getSoilType } from "../spread-foundation/catalog";
import type { BlumCase } from "./blum";
import { CorrosionFaceInput } from "../../shared/CorrosionFace";
import { CorrosionVerification } from "../../shared/CorrosionVerification";
import { DEFAULT_CORROSION, DEFAULT_FACTORS, FACTOR_SETS, GAMMA_WATER, TENDON_GRADES, TIMBER_CLASSES, normalizeWallInput, revetmentExample, wallExample, type WallCheck, type WallCorrosion, type WallFactors, type WallInput, type WallLayer, type WallOk, type WallResult, type WallRun } from "./compute";
import { ProfileDetail } from "./ProfileDetail";
import { SectionDrawing, type QcTrace } from "./SectionDrawing";
import { WallScene3D } from "./WallScene3D";
import { envelopeLines, phaseOf, wallScene } from "./scene";
import { CurBlock, ExtraChecksBlock, GeometryBlock, PhasesBlock, StageOverview, SupportsBlock, caseLabel } from "./stage-panels";
import { TABLE_2B } from "./cpt-layers";
import { LayerSources, SoilProfileBlock, tableRowValues } from "./soil-profile-panel";
import "./styles.css";

type Props = PanelProps<WallInput, WallResult>;
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Veld, symbool of Nederlandse naam, eenheid; een naam wordt vertaald onder input.factor.<veld>. */
const FACTOR_FIELDS: Array<[keyof WallFactors, string, string, boolean?]> = [
  ["gammaPhi", "γφ′ (tan φ′)", ""], ["gammaC", "γc′", ""], ["gammaCu", "γcu", ""], ["gammaGamma", "γγ", ""], ["gammaQ", "γQ (q)", ""], ["gammaK", "γk (kh)", ""], ["gammaM0", "γM0", ""],
  ["deltaAPct", "Toeslag op de kerende hoogte", "%", true], ["deltaAMaxM", "Grootste toeslag", "m", true], ["deltaWaterHighM", "Water hoge zijde hoger", "m", true], ["deltaWaterLowM", "Water lage zijde lager", "m", true],
];

function ExcessTable({ layers, onChange, caption }: { layers: WallLayer[]; onChange: (next: WallLayer[]) => void; caption: string }) {
  const { t } = useTranslation("calcWall");
  const cell = (k: number, key: "excessTop" | "excessBottom", name: string) =>
    <td><NumberInput label={`${name}, ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} value={layers[k][key] ?? 0} onChange={(v) => onChange(layers.map((l, j) => (j === k ? { ...l, [key]: v } : l)))} /></td>;
  return <div className="cs-table-wrap"><table className="cs-layer-table sw-excess" aria-label={`${t("input.excess", "Wateroverspanning")}, ${caption}`}>
    <thead><tr><th>{t("input.excess", "Wateroverspanning")} ({caption})</th><th>{t("input.excessTop", "boven")}<small>kPa</small></th><th>{t("input.excessBottom", "onder")}<small>kPa</small></th></tr></thead>
    <tbody>{layers.map((l, k) => <tr key={k}><td>{l.name}</td>{cell(k, "excessTop", t("input.excessTop", "boven"))}{cell(k, "excessBottom", t("input.excessBottom", "onder"))}</tr>)}</tbody></table></div>;
}

function LayerTable({ layers, onChange, caption }: { layers: WallLayer[]; onChange: (next: WallLayer[]) => void; caption: string }) {
  const { t } = useTranslation("calcWall");
  const set = (k: number, patch: Partial<WallLayer>) => onChange(layers.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const setSoil = (k: number, id: string) => { const s = getSoilType(id), row = tableRowValues(id); if (row) set(k, row); else if (s) set(k, { soilId: s.id, name: s.name, zone: undefined, source: undefined, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, cu: s.cu, delta: Math.round((s.phi * 2) / 3 * 10) / 10 }); };
  const add = () => { const last = layers[layers.length - 1], s = SOIL_TYPES[1]; onChange([...layers, { topNap: round2((last?.topNap ?? 0) - 2), name: s.name, soilId: s.id, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, delta: Math.round((s.phi * 2) / 3 * 10) / 10, undrained: false, cu: s.cu, kh: 0 }]); };
  const cell = (k: number, key: "topNap" | "gamma" | "gammaSat" | "phi" | "c" | "delta" | "cu" | "kh", name: string, min?: number) =>
    <td><NumberInput label={`${name} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} min={min} value={layers[k][key]} onChange={(v) => set(k, { [key]: v })} /></td>;
  const optional = (k: number, key: "kh2" | "kh3", name: string) =>
    <td><NumField aria-label={`${name} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} placeholder="–" value={layers[k][key] ?? ""} onChange={(e) => { const v = Number(e.target.value); set(k, { [key]: e.target.value === "" || !(v > 0) ? undefined : v }); }} /></td>;
  return <>
    <div className="cs-table-wrap"><table className="cs-layer-table sw-layers" aria-label={caption}>
      <thead><tr><th>{t("input.col.top", "Bovenkant")}<small>m NAP</small></th><th>{t("input.col.soil", "Grondsoort")}</th><th>γ<small>kN/m³</small></th><th>γsat<small>kN/m³</small></th><th>φ′<small>°</small></th><th>c′<small>kPa</small></th><th>δ<small>°</small></th>
        <th><abbr title={t("input.col.undrainedTitle", "Reken deze laag ongedraineerd met cu")}>{t("input.col.undrained", "ongedr.")}</abbr></th><th>cu<small>kPa</small></th><th><abbr title={t("input.col.khTitle", "Horizontale beddingsconstante; eigen invoer")}>kh1</abbr><small>kN/m³</small></th><th><abbr title={t("input.col.kh2Title", "Tweede en derde tak van de veer (tot 80 % en tot 100 % van passief min actief); leeg = één tak")}>kh2</abbr><small>kN/m³</small></th><th>kh3<small>kN/m³</small></th><th /></tr></thead>
      <tbody>{layers.map((l, k) => <tr key={k}>
        {cell(k, "topNap", t("input.col.top", "Bovenkant"))}
        <td><select aria-label={`${t("input.col.soil", "Grondsoort")} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} value={l.soilId ?? ""} onChange={(e) => setSoil(k, e.target.value)}>{!l.soilId && <option value="">{l.name || t("input.ownValues", "Eigen waarden")}</option>}<optgroup label={t("soilProfile.table2b", "NEN 9997-1 tabel 2.b")}>{TABLE_2B.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup><optgroup label={t("soilProfile.startValues", "Startwaarden")}>{SOIL_TYPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select></td>
        {cell(k, "gamma", "γ", 0)}{cell(k, "gammaSat", "γsat", 0)}{cell(k, "phi", "φ′", 0)}{cell(k, "c", "c′", 0)}{cell(k, "delta", "δ", 0)}
        <td><input type="checkbox" aria-label={`${t("input.col.undrained", "ongedr.")} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} checked={l.undrained} onChange={(e) => set(k, { undrained: e.target.checked })} /></td>
        {cell(k, "cu", "cu", 0)}{cell(k, "kh", "kh1", 0)}{optional(k, "kh2", "kh2")}{optional(k, "kh3", "kh3")}
        <td><button type="button" className="sw-remove" aria-label={`${t("input.removeLayer", "Laag verwijderen")} ${k + 1}, ${caption}`} disabled={layers.length < 2} onClick={() => onChange(layers.filter((_, j) => j !== k))}>×</button></td>
      </tr>)}</tbody></table></div>
    <div className="sw-buttons"><button type="button" onClick={add}>{t("input.addLayer", "Laag toevoegen")}</button></div>
  </>;
}

export function InputPanel({ input: raw, result: r, onChange }: Props) {
  const i = normalizeWallInput(raw), sheet = i.construction === "sheet-pile", posts = i.construction === "posts";
  const { t } = useTranslation("calcWall");
  const change = (patch: Partial<WallInput>) => onChange?.({ ...i, ...patch });
  const catalog = useMemo(() => sheetPileCatalog(), []);
  const profiles = [...(catalog.get(i.manufacturer)?.values() ?? [])].flat().filter((p) => p.iCm4PerM !== null);
  const f = { ...DEFAULT_FACTORS, ...i.factors }, a = i.anchor;
  const setAnchor = (patch: Partial<WallInput["anchor"]>) => change({ anchor: { ...a, ...patch } });
  const kind = a.kind ?? "tie", g = a.grout!;
  const setGrout = (patch: Partial<NonNullable<WallInput["anchor"]["grout"]>>) => setAnchor({ grout: { ...g, ...patch } });
  const setPosts = (patch: Partial<WallInput["posts"]>) => change({ posts: { ...i.posts, ...patch } });
  const setTimber = (patch: Partial<WallInput["timber"]>) => change({ timber: { ...i.timber, ...patch } });
  const setCustom = (patch: Partial<WallInput["custom"]>) => change({ custom: { ...i.custom, ...patch } });
  const setOf = FACTOR_SETS.find((s) => FACTOR_FIELDS.every(([key]) => Math.abs(s.factors[key] - f[key]) < 1e-9));
  const num = (key: string, nl: string, unit: string, value: number, set: (v: number) => void, min?: number, title?: string) => {
    const label = t(key, nl);
    return <Row label={title ? <abbr title={title}>{label}</abbr> : label} unit={unit}><NumberInput label={unit ? `${label} [${unit}]` : label} min={min} value={value} onChange={set} /></Row>;
  };
  return <div className="sw-input">
    <Section title={t("input.situation", "Situatie")}>
      {num("input.groundHigh", "Maaiveld hoge zijde", "m NAP", i.groundHighNap, (v) => change({ groundHighNap: v }))}
      {sheet && num("input.groundLow", "Maaiveld lage zijde, vóór ontgraven", "m NAP", i.groundLowNap, (v) => change({ groundLowNap: v }))}
      {num(sheet ? "input.excavation" : "input.bed", sheet ? "Ontgravingsniveau" : "Bodem van de watergang", "m NAP", i.excavationNap, (v) => change({ excavationNap: v }))}
      {num("input.waterHigh", "Waterstand hoge zijde", "m NAP", i.waterHighNap, (v) => change({ waterHighNap: v }))}
      {num("input.waterLow", "Waterstand lage zijde", "m NAP", i.waterLowNap, (v) => change({ waterLowNap: v }))}
      {num("input.surcharge", "Bovenbelasting hoge zijde", "kPa", i.surchargeKpa, (v) => change({ surchargeKpa: v }), 0)}
      {r.ok && <Hint>{t("input.situationHint", "Kerende hoogte {{h}} m; met rekenwaarden ligt het niveau aan de lage zijde {{da}} m lager, op NAP {{nap}} m.", { h: fmt(i.groundHighNap - i.excavationNap, 2), da: fmt(r.uls.scenario.deltaAM, 2), nap: fmt(r.uls.scenario.low.surfaceNap, 2) })}</Hint>}
    </Section>
    <Section title={t("input.wall", "Wand")}>
      <Row label={t("input.construction", "Soort constructie")}><select aria-label={t("input.construction", "Soort constructie")} value={i.construction} onChange={(e) => change({ construction: e.target.value as WallInput["construction"] })}>
        <option value="sheet-pile">{t("input.kindSheetPile", "Stalen damwand (profielbibliotheek)")}</option><option value="plank">{t("input.kindPlank", "Beschoeiing: doorgaande wand van planken")}</option><option value="posts">{t("input.kindPosts", "Beschoeiing: palen met schotten")}</option></select></Row>
      <div className="sw-buttons"><span>{t("input.examples", "Voorbeeld laden:")}</span>
        <button type="button" onClick={() => onChange?.(wallExample(i.groundHighNap))}>{t("input.exampleSheetPile", "damwand")}</button>
        <button type="button" onClick={() => onChange?.(revetmentExample("plank", i.groundHighNap))}>{t("input.examplePlank", "planken")}</button>
        <button type="button" onClick={() => onChange?.(revetmentExample("posts", i.groundHighNap))}>{t("input.examplePosts", "palen met schotten")}</button></div>
      {sheet && <>
        <Row label={t("input.manufacturer", "Fabrikant")}><select aria-label={t("input.manufacturer", "Fabrikant")} value={i.manufacturer} onChange={(e) => { const first = [...(catalog.get(e.target.value)?.values() ?? [])].flat().find((p) => p.iCm4PerM !== null); change({ manufacturer: e.target.value, profileId: first?.id ?? "" }); }}>
          {[...catalog.keys()].map((m) => <option key={m} value={m}>{m}</option>)}</select></Row>
        <Row label={t("input.profile", "Profiel")}><select aria-label={t("input.profile", "Profiel")} value={i.profileId} onChange={(e) => change({ profileId: e.target.value })}>
          {!profiles.some((p) => p.id === i.profileId) && <option value={i.profileId}>{i.profileId || "—"}</option>}
          {[...(catalog.get(i.manufacturer)?.entries() ?? [])].map(([series, list]) => <optgroup key={series} label={series}>{list.filter((p) => p.iCm4PerM !== null).map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}</optgroup>)}</select></Row>
        <Row label={t("input.grade", "Staalsoort")}><select aria-label={t("input.grade", "Staalsoort")} value={i.grade} onChange={(e) => change({ grade: e.target.value })}>{SHEET_PILE_GRADES.map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}</select></Row>
      </>}
      {!sheet && <Row label={posts ? t("input.materialPost", "Materiaal van de paal") : t("input.materialPlank", "Materiaal van de plank")}><select aria-label={t("input.material", "Materiaal")} value={i.material} onChange={(e) => change({ material: e.target.value as WallInput["material"] })}>
        <option value="timber">{t("input.materialTimber", "Hout")}</option><option value="custom">{t("input.materialCustom", "Kunststof, beton of anders: eigen waarden")}</option></select></Row>}
      {i.construction === "plank" && num("input.plank", "Dikte van de plank", "mm", i.plankMm, (v) => change({ plankMm: v }), 1)}
      {posts && <>
        <Row label={t("input.postShape", "Vorm van de paal")}><select aria-label={t("input.postShape", "Vorm van de paal")} value={i.posts.shape} onChange={(e) => setPosts({ shape: e.target.value as "round" | "square" })}><option value="round">{t("input.round", "Rond")}</option><option value="square">{t("input.square", "Vierkant")}</option></select></Row>
        {num("input.postSize", "Diameter of zijde van de paal", "mm", i.posts.sizeMm, (v) => setPosts({ sizeMm: v }), 1)}
        {num("input.postSpacing", "Hart-op-hartafstand van de palen", "m", i.posts.spacingM, (v) => setPosts({ spacingM: v }), 0.01)}
        {num("input.board", "Dikte van de schotten", "mm", i.posts.boardMm, (v) => setPosts({ boardMm: v }), 1)}
        {num("input.boardBottom", "Onderkant van de schotten", "m NAP", i.posts.boardBottomNap, (v) => setPosts({ boardBottomNap: v }))}
        {num("input.spatial", "Factor ruimtelijke werking", "", i.posts.spatialFactor, (v) => setPosts({ spatialFactor: v }), 0.01, t("input.spatialTitle", "Onder de schotten telt de passieve weerstand en de bedding over deze factor maal de paalbreedte, niet meer dan de hart-op-hartafstand"))}
        <Hint>{t("input.postsHint", "De schotten brengen de grond- en waterdruk over de hart-op-hartafstand naar de palen; onder de schotten werkt de grond alleen op de paal. Voor de passieve weerstand van een losse paal rekent de literatuur met een grotere breedte dan de paal zelf: Broms (1964) gebruikt in niet-cohesieve grond driemaal de paalbreedte. Kies de factor bij uw grond en paalafstand; de schotten zijn altijd van hout gerekend.")}</Hint>
      </>}
      {!sheet && i.material === "custom" && <>
        {num(posts ? "input.customEiPost" : "input.customEi", posts ? "Buigstijfheid EI per paal" : "Buigstijfheid EI per m wand", posts ? "kNm²" : "kNm²/m", i.custom.eiKnM2, (v) => setCustom({ eiKnM2: v }), 0.001)}
        {num(posts ? "input.customMPost" : "input.customM", posts ? "Opneembaar moment per paal" : "Opneembaar moment per m wand", posts ? "kNm" : "kNm/m", i.custom.mRdKnM, (v) => setCustom({ mRdKnM: v }), 0.001)}
        {num(posts ? "input.customVPost" : "input.customV", posts ? "Opneembare dwarskracht per paal" : "Opneembare dwarskracht per m wand", posts ? "kN" : "kN/m", i.custom.vRdKn, (v) => setCustom({ vRdKn: v }), 0)}
        <Hint>{t("input.customHint", "Buigstijfheid en opneembaar moment (rekenwaarde) verschillen per leverancier en per profiel: neem ze over uit de productgegevens. Bij kunststof hoort daar de langeduurwaarde bij. Een dwarskracht van 0 slaat die toets over.")}</Hint>
      </>}
      {!sheet && (i.material === "timber" || posts) && <>
        <Row label={t("input.timberClass", "Sterkteklasse hout")}><select aria-label={t("input.timberClass", "Sterkteklasse hout")} value={TIMBER_CLASSES.some((c) => c.id === i.timber.classId && c.fmK === i.timber.fmK && c.fvK === i.timber.fvK && c.eMeanMPa === i.timber.eMeanMPa) ? i.timber.classId : ""} onChange={(e) => { const c = TIMBER_CLASSES.find((x) => x.id === e.target.value); if (c) setTimber({ classId: c.id, fmK: c.fmK, fvK: c.fvK, eMeanMPa: c.eMeanMPa }); }}>
          <option value="">{t("input.ownValues", "Eigen waarden")}</option>{TIMBER_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}</select></Row>
        {num("input.fmK", "Buigsterkte fm;k", "N/mm²", i.timber.fmK, (v) => setTimber({ fmK: v }), 0.01)}
        {num("input.fvK", "Schuifsterkte fv;k", "N/mm²", i.timber.fvK, (v) => setTimber({ fvK: v }), 0.01)}
        {num("input.eMean", "Elasticiteitsmodulus E0;mean", "N/mm²", i.timber.eMeanMPa, (v) => setTimber({ eMeanMPa: v }), 1)}
        {num("input.kmod", "kmod", "", i.timber.kmod, (v) => setTimber({ kmod: v }), 0.01, t("input.kmodTitle", "Klimaatklasse 3 (nat): 0,50 blijvend, 0,55 lang, 0,65 middellang, 0,70 kort"))}
        {num("input.gammaMTimber", "γM hout", "", i.timber.gammaM, (v) => setTimber({ gammaM: v }), 0.01)}
        {num("input.kcr", "kcr", "", i.timber.kcr, (v) => setTimber({ kcr: v }), 0.01, t("input.kcrTitle", "Scheurfactor op de breedte bij afschuiving"))}
        <Hint>{t("input.timberHint", "Toets volgens NEN-EN 1995-1-1 met fd = kmod · fk / γM. De standaard is natte toepassing (klimaatklasse 3) met blijvende belasting: kmod = 0,50 en γM = 1,3 voor massief hout. De sterkteklassen en kcr zijn niet tegen de normtekst gelegd; controleer ze en houd rekening met aantasting op de waterlijn.")}</Hint>
      </>}
      {num("input.wallTop", "Bovenkant wand", "m NAP", i.wallTopNap, (v) => change({ wallTopNap: v }))}
      {num("input.toe", "Teenniveau", "m NAP", i.toeNap, (v) => change({ toeNap: v }))}
      {r.ok && <Hint>{t("input.wallHint", "{{name}}: lengte {{l}} m; EI = {{ei}} kNm²/m wand; {{props}}.", { name: r.section.label, l: fmt(r.lengthM, 2), ei: fmt(r.eiKnM2, r.eiKnM2 < 100 ? 1 : 0), props: r.section.properties.map(([k, v]) => `${k.replace(/_/g, "")} = ${v}`).join("; ") })}</Hint>}
      {r.ok && sheet && r.section.profile && <ProfileDetail profile={r.section.profile} corroded={worstZone(r)?.sheet} />}
    </Section>
    {sheet && <CorrosionBlock input={i} result={r} onChange={(corrosion) => change({ corrosion })} />}
    {!posts && <Section title={t("input.support", "Anker of stempel")}>
      <label className="cs-check"><input type="checkbox" checked={a.enabled} onChange={(e) => setAnchor({ enabled: e.target.checked })} /> {t("input.supportEnabled", "Eén ankerrij of stempel")}</label>
      {a.enabled && <>
        <Row label={t("input.supportKind", "Soort steun")}><select aria-label={t("input.supportKind", "Soort steun")} value={kind} onChange={(e) => setAnchor({ kind: e.target.value as NonNullable<WallInput["anchor"]["kind"]> })}>
          <option value="strut">{t("input.kindStrut", "Stempel")}</option><option value="tie">{t("input.kindTie", "Ankerstaaf naar ankerschot of ankerpaal")}</option><option value="grout">{t("input.kindGrout", "Groutanker")}</option></select></Row>
        {num("input.supportLevel", "Niveau", "m NAP", a.levelNap, (v) => setAnchor({ levelNap: v }))}
        {kind !== "strut" && num("input.supportAngle", "Hoek met de horizontaal", "°", a.angleDeg, (v) => setAnchor({ angleDeg: v }), 0, t("input.supportAngleTitle", "Omlaag positief"))}
        {num("input.supportSpacing", "Hart-op-hartafstand", "m", a.spacingM, (v) => setAnchor({ spacingM: v }), 0.01)}
        {kind !== "grout" && <label className="cs-check"><input type="checkbox" checked={a.rigid} onChange={(e) => setAnchor({ rigid: e.target.checked })} /> {t("input.supportRigid", "Starre steun")}</label>}
        {kind !== "grout" && !a.rigid && num("input.supportStiffness", "Veerstijfheid per anker", "kN/m", a.stiffnessKnPerM, (v) => setAnchor({ stiffnessKnPerM: v }), 0.01, t("input.supportStiffnessTitle", "Axiale stijfheid E·A/L van één anker of stempel"))}
        {kind !== "grout" && num("stage.prestressOne", "Voorspankracht per anker", "kN", a.prestressKn ?? 0, (v) => setAnchor({ prestressKn: v }), 0, t("input.prestressTitle", "0 = niet voorgespannen"))}
        {kind === "grout" && <>
          {num("input.groutFree", "Vrije ankerlengte", "m", g.freeLengthM, (v) => setGrout({ freeLengthM: v }), 0.01)}
          {num("input.groutLength", "Lengte van het groutlichaam", "m", g.groutLengthM, (v) => setGrout({ groutLengthM: v }), 0.01)}
          {num("input.groutDiameter", "Diameter van het groutlichaam", "mm", g.diameterMm, (v) => setGrout({ diameterMm: v }), 1)}
          <Row label={t("input.tendon", "Trekelement")}><select aria-label={t("input.tendon", "Trekelement")} value={TENDON_GRADES.some((x) => x.id === g.gradeId && x.fMPa === g.fMPa && x.eMPa === g.eMPa) ? g.gradeId : ""} onChange={(e) => { const x = TENDON_GRADES.find((y) => y.id === e.target.value); if (x) setGrout({ gradeId: x.id, tendonType: x.type, fMPa: x.fMPa, eMPa: x.eMPa }); }}>
            <option value="">{t("input.ownValues", "Eigen waarden")}</option>{TENDON_GRADES.map((x) => <option key={x.id} value={x.id}>{`${x.type === "strand" ? t("input.strands", "Strengen") : t("input.bar", "Staaf")} ${x.name}`}</option>)}</select></Row>
          {num("input.tendonArea", "Doorsnede staal A", "mm²", g.areaMm2, (v) => setGrout({ areaMm2: v }), 1, t("input.tendonAreaTitle", "Staaf: π·d²/4. Strengen: aantal maal de doorsnede van één streng (bijvoorbeeld 150 mm² voor 15,7 mm)"))}
          {num("input.tendonStrength", "Rekgrens fp0,1k of fy", "N/mm²", g.fMPa, (v) => setGrout({ fMPa: v }), 1)}
          {num("input.tendonE", "Elasticiteitsmodulus staal", "N/mm²", g.eMPa, (v) => setGrout({ eMPa: v }), 1)}
          {num("input.prestress", "Voorspankracht per anker", "kN", g.prestressKn, (v) => setGrout({ prestressKn: v }), 0, t("input.prestressTitle", "0 = niet voorgespannen"))}
          {num("input.shaftFriction", "Schachtwrijving groutlichaam", "kPa", g.shaftFrictionKpa, (v) => setGrout({ shaftFrictionKpa: v }), 0, t("input.shaftFrictionTitle", "Representatieve wrijving langs het groutlichaam, uit proefbelastingen, ervaring of de conusweerstand; eigen invoer"))}
          {num("input.anchorLoadFactor", "Extra factor op de ankerkracht", "", g.loadFactor, (v) => setGrout({ loadFactor: v }), 0.01)}
          {num("input.gammaSteel", "γs staal", "", g.gammaSteel, (v) => setGrout({ gammaSteel: v }), 0.01)}
          {num("input.gammaPullout", "γa groutlichaam", "", g.gammaPullout, (v) => setGrout({ gammaPullout: v }), 0.01)}
          <Hint>{t("input.groutHint", "In de wand is het anker een veer met k = E·A / vrije lengte, met de voorspankracht als beginkracht. De schachtwrijving vult u zelf in: dit rekenblad leidt haar niet af uit de sondering. De extra factor op de ankerkracht (1,25), γs (1,15) en γa (1,1) zijn een voorstel en zijn niet tegen de tekst van NEN 9997-1 en CUR 166 gelegd.")}</Hint>
          {r.ok && r.grout && <Hint>{t("input.groutSummary", "k = {{k}} kN/m per anker; groutlichaam van NAP {{top}} tot {{bottom}} m, {{x}} m achter de wand; vrije lengte minstens {{req}} m.", { k: fmt(r.grout.stiffnessKnPerM, 0), top: fmt(r.grout.start.nap, 2), bottom: fmt(r.grout.end.nap, 2), x: fmt(r.grout.start.xM, 2), req: fmt(r.grout.requiredFreeM, 2) })}</Hint>}
        </>}
      </>}
      <SupportsBlock input={i} onChange={change} />
    </Section>}
    <Section title={t("stage.phases", "Bouwfasen")}>
      <PhasesBlock input={i} onChange={change} />
    </Section>
    <Section title={t("input.layers", "Grondlagen (representatieve waarden)")}>
      <SoilProfileBlock input={i} onChange={change} />
      <LayerTable layers={i.layersHigh} caption={t("input.layersHigh", "hoge zijde")} onChange={(layersHigh) => change({ layersHigh })} />
      <LayerSources layers={i.layersHigh} caption={t("input.layersHigh", "hoge zijde")} />
      <label className="cs-check"><input type="checkbox" checked={i.lowSameAsHigh} onChange={(e) => change({ lowSameAsHigh: e.target.checked, layersLow: e.target.checked || i.layersLow.length ? i.layersLow : i.layersHigh.map((l) => ({ ...l })) })} /> {t("input.lowSame", "Lage zijde heeft dezelfde lagen")}</label>
      {!i.lowSameAsHigh && <LayerTable layers={i.layersLow} caption={t("input.layersLow", "lage zijde")} onChange={(layersLow) => change({ layersLow })} />}
      {!i.lowSameAsHigh && <LayerSources layers={i.layersLow} caption={t("input.layersLow", "lage zijde")} />}
      <GeometryBlock input={i} onChange={change} />
      <Hint>{t("soilProfile.hint", "De bovenste laag loopt door tot het maaiveld, de onderste tot onbeperkte diepte. Het voorstel uit de sondering neemt de laagindeling van het paneel Grondopbouw, voegt gelijke lagen samen en lagen dunner dan de kleinste dikte bij de dikste buurlaag, en vult per laag de lage karakteristieke waarden van NEN 9997-1 tabel 2.b in (vastheid uit de gemiddelde qc, bij zand omgerekend naar σ′v = 100 kPa) en kh uit CUR 166 tabel 3.3 (laag gemiddelde). Bij zand blijven kh2 en kh3 open, bij leem ook kh1. Met alleen kh1 rekent het met één tak; met kh2 en kh3 erbij met de drietakkige veer. Het voorstel is indicatief: controleer en overschrijf de waarden.")}</Hint>
    </Section>
    <More title={t("input.pressure", "Gronddruk, water en stijfheid")}>
      <Row label={t("input.passiveMethod", "Passieve gronddruk")}><select aria-label={t("input.passiveMethod", "Passieve gronddruk")} value={i.passiveMethod} onChange={(e) => change({ passiveMethod: e.target.value as WallInput["passiveMethod"] })}>
        <option value="auto">{t("input.methodAuto", "Recht glijvlak tot δ = φ′/3, daarboven gekromd")}</option><option value="straight">{t("input.methodStraight", "Altijd recht glijvlak")}</option><option value="curved">{t("input.methodCurved", "Altijd gekromd glijvlak")}</option></select></Row>
      {num("input.gammaWater", "Volumegewicht water", "kN/m³", i.gammaWater ?? GAMMA_WATER, (v) => change({ gammaWater: v }), 0.01)}
      <ExcessTable layers={i.layersHigh} caption={t("input.layersHigh", "hoge zijde")} onChange={(layersHigh) => change({ layersHigh })} />
      {!i.lowSameAsHigh && <ExcessTable layers={i.layersLow} caption={t("input.layersLow", "lage zijde")} onChange={(layersLow) => change({ layersLow })} />}
      <Hint>{t("input.excessHint", "Wateroverspanning: extra waterdruk boven op de hydrostatische druk, lineair van de bovenkant naar de onderkant van de laag (de onderste laag houdt de bovenwaarde). Daarmee voert u stroming onder de teen door of een hogere stijghoogte in een diepere laag in; aan de lage zijde verlaagt dat de korrelspanning en de passieve weerstand. Vink 'dezelfde lagen' uit om de lage zijde apart in te vullen.")}</Hint>
      {sheet && num("input.eiFactor", "Reductiefactor op EI", "", i.eiFactor ?? 1, (v) => change({ eiFactor: v }), 0.01, t("input.eiFactorTitle", "U-planken zonder volledige schuifkrachtoverdracht in de sloten; 1,0 voor Z-planken"))}
      {sheet && num("input.betaB", "Reductiefactor βB", "", i.betaB, (v) => change({ betaB: v }), 0.01, t("input.betaBTitle", "Reductie van het weerstandsmoment bij U-planken zonder volledige schuifkrachtoverdracht in de sloten; 1,0 voor Z-planken"))}
      {sheet && num("input.normalForce", "Extra normaalkracht NEd", "kN/m", i.normalForceKn, (v) => change({ normalForceKn: v }), 0)}
    </More>
    <More title={t("input.factors", "Partiële factoren en toeslagen")}>
      <Row label={t("input.factorSet", "Set")}><select aria-label={t("input.factorSetAria", "Set partiële factoren")} value={setOf?.id ?? ""} onChange={(e) => { const s = FACTOR_SETS.find((x) => x.id === e.target.value); if (s) change({ factors: { ...s.factors } }); }}>
        {!setOf && <option value="">{t("input.ownValues", "Eigen waarden")}</option>}{FACTOR_SETS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Row>
      {FACTOR_FIELDS.map(([key, name, unit, translate]) => { const label = translate ? t(`input.factor.${key}`, name) : name; return <Row key={key} label={label} unit={unit || undefined}><NumberInput label={unit ? `${label} [${unit}]` : label} min={unit ? 0 : 0.01} value={f[key]} onChange={(v) => change({ factors: { ...f, [key]: v } })} /></Row>; })}
      <Hint warn>{t("input.factorsHint", "De sets zijn een voorstel en zijn niet tegen de tekst van NEN 9997-1 en CUR 166 gelegd. Controleer de factoren, de toeslag op de kerende hoogte en de waterstanden bij uw veiligheidsklasse en pas ze aan.")}</Hint>
    </More>
    <CurBlock input={i} onChange={change} />
    <ExtraChecksBlock input={i} onChange={change} />
  </div>;
}

/** De zone met het grootste dikteverlies, voor het plankdetail. */
const worstZone = (r: WallOk) => r.corrosion?.zones.reduce((a, b) => (b.lossHighMm + b.lossLowMm > a.lossHighMm + a.lossLowMm ? b : a));

/** Invoerblok "Afroesting": per zijde, optioneel in twee zones, met het vinkje voor de buigstijfheid. */
function CorrosionBlock({ input: i, result: r, onChange }: { input: WallInput; result: WallResult; onChange: (c: WallCorrosion) => void }) {
  const { t } = useTranslation("calcWall");
  const c = { ...DEFAULT_CORROSION, ...i.corrosion }, set = (patch: Partial<WallCorrosion>) => onChange({ ...c, ...patch });
  const zone = (above: boolean) => (c.zoned ? ` (${above ? t("corrosion.above", "boven") : t("corrosion.below", "onder")})` : "");
  const zones = r.ok ? r.corrosion?.zones ?? [] : [];
  return <More title={t("corrosion.title", "Afroesting")}>
    <CorrosionFaceInput label={t("corrosion.highSide", "Hoge zijde") + zone(true)} face={c.high} onChange={(high) => set({ high })} />
    <CorrosionFaceInput label={t("corrosion.lowSide", "Lage zijde") + zone(true)} face={c.low} onChange={(low) => set({ low })} />
    <label className="cs-check"><input type="checkbox" checked={c.zoned} onChange={(e) => set({ zoned: e.target.checked, zoneNap: e.target.checked && !i.corrosion?.zoned ? i.waterLowNap : c.zoneNap, highBelow: c.highBelow ?? c.high, lowBelow: c.lowBelow ?? c.low })} /> {t("corrosion.zoned", "Andere afroesting onder een niveau (waterlijn)")}</label>
    {c.zoned && <>
      <Row label={t("corrosion.zoneNap", "Grens van de zones")} unit="m NAP"><NumberInput label={`${t("corrosion.zoneNap", "Grens van de zones")} [m NAP]`} value={c.zoneNap} onChange={(v) => set({ zoneNap: v })} /></Row>
      <CorrosionFaceInput label={t("corrosion.highSide", "Hoge zijde") + zone(false)} face={c.highBelow} onChange={(highBelow) => set({ highBelow })} />
      <CorrosionFaceInput label={t("corrosion.lowSide", "Lage zijde") + zone(false)} face={c.lowBelow} onChange={(lowBelow) => set({ lowBelow })} />
    </>}
    <label className="cs-check"><input type="checkbox" checked={c.reducedStiffness} onChange={(e) => set({ reducedStiffness: e.target.checked })} /> {t("corrosion.reducedStiffness", "EI na afroesting")}</label>
    <Row label={t("corrosion.classChoice", "Klasse na afroesting")}><select aria-label={t("corrosion.classChoice", "Klasse na afroesting")} value={c.classChoice ?? ""} onChange={(e) => set({ classChoice: e.target.value ? (Number(e.target.value) as 2 | 3 | 4) : undefined })}>
      <option value="">{t("corrosion.classAuto", "Uit de catalogus (bij twijfel de ongunstigste)")}</option>{[2, 3, 4].map((k) => <option key={k} value={k}>{t("corrosion.classN", "Klasse {{cls}}", { cls: k })}</option>)}</select></Row>
    {zones.map((z, k) => z.sheet.basis !== "none" && <Hint key={k}>{t("corrosion.summary", "{{zone}}t {{t0}} → {{t1}} mm, s {{s0}} → {{s1}} mm; A {{a0}} → {{a1}} cm²/m; W_el {{w0}} → {{w1}} cm³/m ({{basis}}).", {
      zone: z.label ? `${z.label}: ` : "", t0: fmt(z.sheet.original.flangeMm ?? 0, 1), t1: fmt(z.sheet.profile.flangeMm ?? 0, 2), s0: fmt(z.sheet.original.webMm ?? 0, 1), s1: fmt(z.sheet.profile.webMm ?? 0, 2),
      a0: fmt(z.sheet.original.areaCm2PerM ?? 0, 1), a1: fmt(z.sheet.profile.areaCm2PerM ?? 0, 1), w0: fmt(z.sheet.original.welCm3PerM ?? 0, 0), w1: fmt(z.sheet.profile.welCm3PerM ?? 0, 0),
      basis: z.sheet.basis === "contour" ? t("corrosion.basisContour", "uit de contour") : t("corrosion.basisApprox", "benadering") })}</Hint>)}
    <Hint>{t("corrosion.hint", "Dikteverlies per zijde. De tabelwaarden zijn de aanbevolen waarden van NEN-EN 1993-5 tabel 4-1 en 4-2 en zijn niet tegen de normtekst of de Nederlandse bijlage gelegd; verdichte aanvulling is de helft van niet verdicht. De afroesting telt in de toetsen van de doorsnede, met de doorsnedeklasse bij de verkleinde flensdikte; in de gronddruk niet, en in de krachtsverdeling alleen met het vinkje. Bij twee zones wordt elke zone getoetst met het grootste moment en de grootste dwarskracht in die zone.")}</Hint>
    <CorrosionVerification set="sheet" />
  </More>;
}

export function VisualPanel({ input: i, result: r }: Props) {
  const { t } = useTranslation("calcWall");
  const [view, setView] = useState<"section" | "3d">("section");
  const [pick, setPick] = useState("uls");
  const [showQc, setShowQc] = useState(false);
  const cpts = useCptStore((s) => s.cpts);
  const traces = useMemo(() => {
    const out: QcTrace[] = [];
    for (const [side, id] of [["high", i.cptId], ["low", i.cptIdLow]] as const) {
      const cpt = id ? cpts.get(id) : undefined;
      if (!cpt || !id) continue;
      const ground = cpt.metadata.ground_level_nap ?? 0;
      out.push({ side, cptId: id, points: cpt.points.filter((p) => typeof p.qc === "number" && Number.isFinite(p.qc) && Number.isFinite(p.depth)).map((p) => ({ nap: ground - Math.abs(p.depth), qc: p.qc as number })) });
    }
    return out;
  }, [cpts, i.cptId, i.cptIdLow]);
  if (!r.ok) return <p className="cs-hint">{t("visual.pending", "De tekening verschijnt zodra de invoer compleet is en er evenwicht is.")}</p>;
  // Keuze: de omhullende van de rekenwaarden, de maatgevende representatieve berekening, of één fase en stap.
  const many = r.cases.length > 2, chosen = pick.startsWith("c") ? r.cases[Number(pick.slice(1))] : undefined;
  const run = chosen ? chosen.run : pick === "sls" ? r.sls : r.uls, phase = chosen ? r.phases[chosen.phase] : phaseOf(r, run);
  const design = r.cases.filter((c) => c.design), envelope = pick === "uls" && design.length > 1 ? envelopeLines(design, i.wallTopNap, i.toeNap) : undefined;
  const tab = (id: "section" | "3d", label: string) => <button type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>;
  return <div className="sw-visual">
    <div className="sw-tabs" role="tablist" aria-label={t("visual.viewAria", "Weergave")}>
      {tab("section", t("visual.section", "Doorsnede"))}{tab("3d", "3D")}
      <select className="sw-run" aria-label={t("visual.runAria", "Waarden in de tekening")} value={chosen || pick === "sls" ? pick : "uls"} onChange={(e) => setPick(e.target.value)}>
        <option value="uls">{many ? t("stage.envelope", "Omhullende") : t("visual.runUls", "Rekenwaarden")}</option><option value="sls">{many ? t("stage.slsGoverning", "Grootste verplaatsing") : t("visual.runSls", "Representatieve waarden")}</option>
        {many && r.cases.map((c, k) => <option key={k} value={`c${k}`}>{caseLabel(c, r.phases.length, t)}</option>)}</select>
    </div>
    {view === "section" ? <>
      {traces.length > 0 && <div className="sw-visual-options"><label><input type="checkbox" checked={showQc} onChange={(e) => setShowQc(e.target.checked)} /> {t("soilProfile.showQc", "qc van de sondering naast de doorsnede")}</label></div>}
      <SectionDrawing input={i} result={r} run={run} phase={phase} envelope={envelope} qc={showQc ? traces : undefined} />
      <p className="cs-hint">{t("visual.sectionHint", "Op schaal. Tegen de wand staat de druk op de wand: bruin de korreldruk, blauw de waterdruk erbovenop; de streeplijnen zijn de actieve grens aan de hoge zijde en de passieve grens aan de lage zijde. Rechts de verplaatsing (positief naar de lage zijde), het moment en de dwarskracht over dezelfde hoogte; de stip is de grootste waarde.")}{envelope ? ` ${t("stage.envelopeHint", "De band is de omhullende over alle fasen en stappen.")}` : ""}</p>
    </> : <WallScene3D scene={wallScene(i, r, chosen ? chosen.run : r.sls, chosen ? phase : undefined)} />}
  </div>;
}

function CheckDetails({ check }: { check: WallCheck }) {
  return <details className="sw-check">
    <summary><span>{check.title}</span><span className={check.passes ? "sw-ok" : "sw-fail"}>u.c. {fmt(check.uc, 2)}</span></summary>
    <p className="sw-article">{check.article}</p>
    <dl className="sw-steps">{check.steps.map((s, k) => <div key={k}><dt>{s.symbol.replace(/_/g, "")}</dt><dd>{s.formula && <>= {s.formula}<br /></>}{s.filled && <>= {s.filled}<br /></>}<strong>= {s.result}</strong></dd></div>)}</dl>
  </details>;
}

export function ResultPanel({ input: i, result: r }: Props) {
  const { t } = useTranslation("calcWall");
  if (!r.ok) return <div className="sw-result"><p className="cs-hint cs-hint--warn" role="alert">{r.error}</p></div>;
  const u = r.uls, s = r.sls, nap = (z: number) => fmt(i.wallTopNap - z, 2);
  const pair = (label: string, unit: string, a: number, b: number, d = 1) => <tr><td>{label}</td><td>{fmt(a, d)} {unit}</td><td>{fmt(b, d)} {unit}</td></tr>;
  const blumCases: Array<[string, BlumCase | null]> = r.blum.kind === "cantilever" ? [[t("result.blumCantilever", "Blum, onverankerd (ingeklemd)"), r.blum.cantilever]] : [[t("result.blumFree", "Blum, vrij opgelegde voet"), r.blum.free], [t("result.blumFixed", "Blum, ingeklemde voet"), r.blum.fixed]];
  const stateName = (run: WallRun) => { const low = run.rows.filter((row) => row.low); return low.length ? fmt((100 * low.filter((row) => row.low!.state === "passive").reduce((sum, row) => sum + row.topNap - row.bottomNap, 0)) / low.reduce((sum, row) => sum + row.topNap - row.bottomNap, 0), 0) : "—"; };
  return <div className="sw-result">
    <h3>{t("result.checks", "Toetsen")}</h3>
    <table className="cs-layer-table sw-summary" aria-label={t("result.checksAria", "Overzicht van de toetsen")}>
      <thead><tr><th>{t("result.check", "Toets")}</th><th>{t("result.effect", "Optredend")}</th><th>{t("result.resistance", "Weerstand")}</th><th>u.c.</th></tr></thead>
      <tbody>{r.checks.map((c, k) => <tr key={k} className={c.passes ? "" : "sw-row-fail"}><td>{c.title}</td><td>{fmt(c.load, c.unit === "m" ? 2 : 1)} {c.unit}</td><td>{fmt(c.resistance, c.unit === "m" ? 2 : 1)} {c.unit}</td><td className={c.passes ? "sw-ok" : "sw-fail"}>{fmt(c.uc, 2)}</td></tr>)}</tbody>
    </table>
    <p className="cs-hint">{t("result.governing", "Maatgevend: {{title}} (u.c. {{uc}}).", { title: r.governing.title.toLowerCase(), uc: fmt(r.governing.uc, 2) })} {r.passes ? t("result.allPass", "Alle toetsen voldoen.") : t("result.notAllPass", "Niet alle toetsen voldoen.")}</p>
    {r.warnings.map((w) => <p key={w} className="cs-hint cs-hint--warn">{w}</p>)}

    <h3>{t("result.spring", "Verenmodel")}</h3>
    <table className="cs-layer-table sw-summary" aria-label={t("result.springAria", "Uitkomsten van het verenmodel")}>
      <thead><tr><th /><th>{t("visual.runUls", "Rekenwaarden")}</th><th>{t("visual.runSls", "Representatieve waarden")}</th></tr></thead>
      <tbody>
        {pair(t("result.maxMoment", "Grootste moment"), "kNm/m", Math.abs(u.maxMoment.value), Math.abs(s.maxMoment.value))}
        {pair(t("result.maxShear", "Grootste dwarskracht"), "kN/m", Math.abs(u.maxShear.value), Math.abs(s.maxShear.value))}
        {u.anchor && s.anchor && pair(t("result.anchorPerM", "Ankerkracht per m wand"), "kN/m", u.anchor.axialKn, s.anchor.axialKn)}
        {u.anchor && s.anchor && pair(t("result.anchorEach", "Ankerkracht per anker"), "kN", u.anchor.perAnchorKn, s.anchor.perAnchorKn)}
        {pair(t("result.head", "Verplaatsing aan de kop"), "mm", u.headDisplacementM * 1000, s.headDisplacementM * 1000)}
        {pair(t("result.maxDisplacement", "Grootste verplaatsing"), "mm", u.maxDisplacement.value * 1000, s.maxDisplacement.value * 1000)}
        {pair(t("result.mobilised", "Aangesproken passieve weerstand"), "%", 100 * u.passive.ratio, 100 * s.passive.ratio, 0)}
        <tr><td>{t("result.plastic", "Deel van de inheidiepte op de passieve grens")}</td><td>{stateName(u)} %</td><td>{stateName(s)} %</td></tr>
      </tbody>
    </table>
    <p className="cs-hint">{t("result.springHint", "Moment op NAP {{m}} m, dwarskracht op NAP {{v}} m (rekenwaarden). Verplaatsingen beoordeelt u met de representatieve waarden. Het verenmodel kwam in {{n}} stappen tot rust.", { m: fmt(u.maxMoment.nap, 2), v: fmt(u.maxShear.nap, 2), n: u.iterations })}</p>
    <StageOverview result={r} />

    {r.grout && <>
      <h3>{t("result.grout", "Groutanker")}</h3>
      <table className="cs-layer-table sw-summary" aria-label={t("result.groutAria", "Uitwerking van het groutanker")}>
        <tbody>
          <tr><td>{t("result.groutStiffness", "Veerstijfheid E·A / vrije lengte")}</td><td>{fmt(r.grout.stiffnessKnPerM, 0)} kN/m</td></tr>
          <tr><td>{t("result.groutHorizontal", "Horizontaal per m wand")}</td><td>{fmt(r.grout.horizontalStiffness, 0)} kN/m</td></tr>
          <tr><td>{t("result.groutForce", "Ankerkracht per anker (rekenwaarden)")}</td><td>{fmt(r.grout.forceKn, 1)} kN</td></tr>
          <tr><td>{t("result.groutDesign", "Met de extra factor")}</td><td>{fmt(r.grout.designForceKn, 1)} kN</td></tr>
          <tr><td>{t("result.groutSteel", "Staalweerstand")}</td><td>{fmt(r.grout.steelRdKn, 1)} kN</td></tr>
          <tr><td>{t("result.groutPullout", "Houdkracht groutlichaam (rekenwaarde)")}</td><td>{fmt(r.grout.pulloutRdKn, 1)} kN</td></tr>
          <tr><td>{t("result.groutElongation", "Verlenging van de vrije lengte")}</td><td>{fmt(r.grout.elongationMm, 1)} mm</td></tr>
          <tr><td>{t("result.groutSlip", "Actief glijvlak vanaf de teen")}</td><td>{fmt(r.grout.slipAngleDeg, 1)}°</td></tr>
          <tr><td>{t("result.groutFree", "Vrije lengte: aanwezig en minstens nodig")}</td><td>{fmt(i.anchor.grout?.freeLengthM ?? 0, 2)} m / {fmt(r.grout.requiredFreeM, 2)} m</td></tr>
          <tr><td>{t("result.groutBody", "Groutlichaam: van en tot")}</td><td>NAP {fmt(r.grout.start.nap, 2)} / {fmt(r.grout.end.nap, 2)} m</td></tr>
          {r.grout.layers.map((l) => <tr key={l.name}><td>{t("result.groutIn", "Groutlichaam in {{name}}", { name: l.name })}</td><td>{fmt(l.lengthM, 2)} m</td></tr>)}
        </tbody>
      </table>
    </>}
    <h3>{t("result.compare", "Vergelijking met Blum (rekenwaarden)")}</h3>
    <table className="cs-layer-table sw-summary" aria-label={t("result.compareAria", "Verenmodel naast de methode van Blum")}>
      <thead><tr><th /><th>{t("result.mMax", "M;max")}<small>kNm/m</small></th><th>{t("result.anchorH", "Anker, horizontaal")}<small>kN/m</small></th><th>{t("result.toeNeeded", "Benodigde teen")}<small>m NAP</small></th></tr></thead>
      <tbody>
        <tr><td>{t("result.spring", "Verenmodel")}</td><td>{fmt(Math.abs(u.maxMoment.value), 1)}</td><td>{u.anchor ? fmt(u.anchor.horizontalKn, 1) : "—"}</td><td>{t("result.toeActual", "{{nap}} (aanwezig)", { nap: fmt(i.toeNap, 2) })}</td></tr>
        {blumCases.map(([label, c]) => <tr key={label}><td>{label}</td>{c ? <><td>{fmt(c.maxMomentKnM, 1)}</td><td>{c.anchorKn ? fmt(c.anchorKn, 1) : "—"}</td><td>{nap(c.requiredToeM)}</td></> : <td colSpan={3}>{t("result.blumNone", "geen evenwicht binnen het rekenbereik")}</td>}</tr>)}
      </tbody>
    </table>
    <p className="cs-hint">{t("result.compareHint", "Blum rekent met volledig actieve en passieve gronddruk en een starre steun; het verenmodel spreekt de gronddruk aan naar de verplaatsing. De uitkomsten horen in dezelfde orde te liggen, niet gelijk te zijn.")}</p>

    <h3>{t("result.coefficients", "Gronddrukcoëfficiënten (rekenwaarden)")}</h3>
    <div className="cs-table-wrap"><table className="cs-layer-table sw-rows" aria-label={t("result.coefficientsAria", "Gronddrukcoëfficiënten per laag")}>
      <thead><tr><th>{t("result.layer", "Laag")}</th><th>φ′d</th><th>δd</th><th>K0</th><th>Ka</th><th>Kp</th><th>{t("result.slip", "Glijvlak passief")}</th><th>kh;d</th></tr></thead>
      <tbody>{r.coefficients.map((c, k) => <tr key={k}><td>{c.name}{r.coefficients.some((x) => x.side === "low") ? ` (${c.side === "high" ? t("input.layersHigh", "hoge zijde") : t("input.layersLow", "lage zijde")})` : ""}</td>
        <td>{fmt(c.phiD, 2)}</td><td>{fmt(c.deltaD, 2)}</td><td>{fmt(c.coef.k0, 3)}</td><td>{c.undrained ? "cu" : fmt(c.coef.ka, 3)}</td><td>{c.undrained ? "cu" : fmt(c.coef.kp, 3)}</td><td>{c.undrained ? t("result.undrained", "ongedraineerd") : c.coef.passive === "curved" ? t("result.curved", "gekromd") : t("result.straight", "recht")}</td><td>{fmt(c.khD, 0)}</td></tr>)}</tbody></table></div>

    <h3>{t("result.levels", "Spanningen op de kenmerkende niveaus (rekenwaarden)")}</h3>
    <div className="cs-table-wrap"><table className="cs-layer-table sw-rows" aria-label={t("result.levelsAria", "Spanningen per niveau")}>
      <thead><tr><th>NAP</th><th>{t("result.at", "Net onder")}</th><th>σ′v;h</th><th>u;h</th><th>σ′a;h</th><th>σ′0;h</th><th>σ′v;l</th><th>u;l</th><th>σ′0;l</th><th>σ′p;l</th></tr></thead>
      <tbody>{r.levels.map((l, k) => <tr key={k}><td>{fmt(l.nap, 2)}</td><td>{l.label}</td><td>{fmt(l.high.sigmaVEff)}</td><td>{fmt(l.high.u)}</td><td>{l.high.soil ? fmt(l.high.soil.pa) : "—"}</td><td>{l.high.soil ? fmt(l.high.soil.p0) : "—"}</td>
        <td>{fmt(l.low.sigmaVEff)}</td><td>{fmt(l.low.u)}</td><td>{l.low.soil ? fmt(l.low.soil.p0) : "—"}</td><td>{l.low.soil ? fmt(l.low.soil.pp) : "—"}</td></tr>)}</tbody></table></div>
    <p className="cs-hint">{t("result.levelsHint", "h = hoge zijde, l = lage zijde; alle waarden in kPa.")}</p>

    {r.corrosion && <>
      <h3>{t("corrosion.resultTitle", "Doorsnede na afroesting")}</h3>
      <div className="cs-table-wrap"><table className="cs-layer-table sw-rows" aria-label={t("corrosion.resultTitle", "Doorsnede na afroesting")}>
        <thead><tr><th>{t("corrosion.zone", "Zone")}</th><th>Δ {t("corrosion.high", "hoge zijde")}<small>mm</small></th><th>Δ {t("corrosion.low", "lage zijde")}<small>mm</small></th><th>t / s<small>mm</small></th><th>A<small>cm²/m</small></th><th>I<small>cm⁴/m</small></th><th>W_el<small>cm³/m</small></th><th>W_pl<small>cm³/m</small></th><th>{t("corrosion.class", "klasse")}</th></tr></thead>
        <tbody>{r.corrosion.zones.map((z, k) => { const a = z.sheet.original, b = z.sheet.profile, arrow = (x: number | null, y: number | null, d: number) => (x === null ? "—" : `${fmt(x, d)} → ${fmt(y ?? 0, d)}`), g = i.grade;
          return <tr key={k}><td>{z.label || t("corrosion.wholeWall", "hele wand")}</td><td>{fmt(z.lossHighMm, 2)}</td><td>{fmt(z.lossLowMm, 2)}</td><td>{`${arrow(a.flangeMm, b.flangeMm, 1)} / ${arrow(a.webMm, b.webMm, 1)}`}</td><td>{arrow(a.areaCm2PerM, b.areaCm2PerM, 1)}</td><td>{arrow(a.iCm4PerM, b.iCm4PerM, 0)}</td><td>{arrow(a.welCm3PerM, b.welCm3PerM, 0)}</td><td>{arrow(a.wplCm3PerM, b.wplCm3PerM, 0)}</td><td>{`${a.classes?.[g] ?? "–"} → ${b.classes?.[g] ?? "–"}`}</td></tr>; })}</tbody></table></div>
      <p className="cs-hint">{r.corrosion.reducedStiffness ? t("corrosion.eiReduced", "Krachtsverdeling met EI na afroesting: {{ei}} kNm²/m (zonder afroesting {{ei0}}).", { ei: fmt(r.eiKnM2, 0), ei0: fmt(r.corrosion.eiOriginalKnM2, 0) }) : t("corrosion.eiOriginal", "Krachtsverdeling met de EI zonder afroesting; de afroesting telt in de toetsen van de doorsnede.")}</p>
    </>}
    <h3>{t("result.details", "Uitwerking per toets")}</h3>
    {r.checks.map((c, k) => <CheckDetails key={k} check={c} />)}
    <details className="settlement-reference"><summary>{t("result.method", "Methode, uitgangspunten en wat er niet in zit")}</summary>
      <ul>
        <li>{t("result.method1", "Verenmodel volgens CUR 166: een elastisch ondersteunde ligger met aan beide zijden grondveren die bij de neutrale gronddruk (K0 = 1 − sin φ′) beginnen en begrensd zijn door de actieve en de passieve gronddruk; één beddingsconstante per laag.")}</li>
        <li>{t("result.method2", "Gronddruk: actief met het rechte glijvlak (Coulomb), passief met het rechte glijvlak tot δ = φ′/3 en daarboven met het gekromde glijvlak volgens NEN-EN 1997-1 bijlage C.2. Ongedraineerde lagen met σh = σv ∓ 2·cu.")}</li>
        <li>{t("result.method3", "Veiligheid: rekenwaarden van de grondparameters, een toeslag op de kerende hoogte en eventueel op de waterstanden; verplaatsingen met representatieve waarden.")}</li>
        <li>{t("result.method4", "Staal: buiging, dwarskracht en normaalkracht volgens NEN-EN 1993-5, met de afroesting als die is ingevoerd. Hout: buiging en afschuiving volgens NEN-EN 1995-1-1. Kunststof en beton: tegen het opneembare moment dat u invoert.")}</li>
        <li>{t("result.method6", "Palen met schotten: per m wand met de buigstijfheid van de paal gedeeld door de hart-op-hartafstand; onder de schotten de gronddruk over de paalbreedte en de passieve weerstand over de factor voor ruimtelijke werking maal de paalbreedte. Het schot is een ligger op twee steunpunten tussen de palen.")}</li>
        <li>{t("stage.method7", "Fasering: elke fase rekent verder vanaf de vervormde wand; een veer begint op zijn druk aan het eind van de vorige fase, met K0 maal de verandering van de verticale korrelspanning erbij. Stappenplan: zie het blok Stappenplan CUR 166.")}</li>
        <li>{t("stage.method5", "Niet in deze versie: de stabiliteit van het diepe glijvlak (Kranz), algehele stabiliteit (Bishop), een glijvlakberekening (Culmann) met het werkelijke maaiveld en gelaagde grond, een ontlasttak van de veer, uitval van een anker, rekenwaarden alleen in de getoetste fase, een berekening van de grondwaterstroming, plooi van koudgevormde profielen, kruip van hout en kunststof, en beschoeiingen met een verankerde paal.")}</li>
      </ul>
    </details>
  </div>;
}
