// Rekenblad damwand: invoer, doorsnede met diagrammen, 3D-weergave en de uitkomsten met de vergelijking tegen Blum.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PanelProps } from "../../framework/types";
import { Hint, More, NumberInput, Row, Section } from "../../framework/views/SheetForm";
import { useCptStore } from "../../../store/useCptStore";
import { numberLocale } from "../../i18n";
import { SHEET_PILE_GRADES, sheetPileCatalog } from "../../library/sheetPiles";
import { SOIL_TYPES, getSoilType } from "../spread-foundation/catalog";
import type { BlumCase } from "./blum";
import { DEFAULT_FACTORS, FACTOR_SETS, TIMBER_CLASSES, normalizeWallInput, revetmentExample, wallExample, wallLayersFromCpt, type WallCheck, type WallFactors, type WallInput, type WallLayer, type WallResult, type WallRun } from "./compute";
import { SectionDrawing } from "./SectionDrawing";
import { WallScene3D } from "./WallScene3D";
import { wallScene } from "./scene";
import "./styles.css";

type Props = PanelProps<WallInput, WallResult>;
export const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : "—");
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Veld, symbool of Nederlandse naam, eenheid; een naam wordt vertaald onder input.factor.<veld>. */
const FACTOR_FIELDS: Array<[keyof WallFactors, string, string, boolean?]> = [
  ["gammaPhi", "γφ′ (tan φ′)", ""], ["gammaC", "γc′", ""], ["gammaCu", "γcu", ""], ["gammaGamma", "γγ", ""], ["gammaQ", "γQ (q)", ""], ["gammaK", "γk (kh)", ""], ["gammaM0", "γM0", ""],
  ["deltaAPct", "Toeslag op de kerende hoogte", "%", true], ["deltaAMaxM", "Grootste toeslag", "m", true], ["deltaWaterHighM", "Water hoge zijde hoger", "m", true], ["deltaWaterLowM", "Water lage zijde lager", "m", true],
];

function LayerTable({ layers, onChange, caption }: { layers: WallLayer[]; onChange: (next: WallLayer[]) => void; caption: string }) {
  const { t } = useTranslation("calcWall");
  const set = (k: number, patch: Partial<WallLayer>) => onChange(layers.map((l, j) => (j === k ? { ...l, ...patch } : l)));
  const setSoil = (k: number, id: string) => { const s = getSoilType(id); if (s) set(k, { soilId: s.id, name: s.name, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, cu: s.cu, delta: Math.round((s.phi * 2) / 3 * 10) / 10 }); };
  const add = () => { const last = layers[layers.length - 1], s = SOIL_TYPES[1]; onChange([...layers, { topNap: round2((last?.topNap ?? 0) - 2), name: s.name, soilId: s.id, gamma: s.gamma, gammaSat: s.gammaSat, phi: s.phi, c: s.c, delta: Math.round((s.phi * 2) / 3 * 10) / 10, undrained: false, cu: s.cu, kh: 0 }]); };
  const cell = (k: number, key: "topNap" | "gamma" | "gammaSat" | "phi" | "c" | "delta" | "cu" | "kh", name: string, min?: number) =>
    <td><NumberInput label={`${name} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} min={min} value={layers[k][key]} onChange={(v) => set(k, { [key]: v })} /></td>;
  return <>
    <div className="cs-table-wrap"><table className="cs-layer-table sw-layers" aria-label={caption}>
      <thead><tr><th>{t("input.col.top", "Bovenkant")}<small>m NAP</small></th><th>{t("input.col.soil", "Grondsoort")}</th><th>γ<small>kN/m³</small></th><th>γsat<small>kN/m³</small></th><th>φ′<small>°</small></th><th>c′<small>kPa</small></th><th>δ<small>°</small></th>
        <th><abbr title={t("input.col.undrainedTitle", "Reken deze laag ongedraineerd met cu")}>{t("input.col.undrained", "ongedr.")}</abbr></th><th>cu<small>kPa</small></th><th><abbr title={t("input.col.khTitle", "Horizontale beddingsconstante; eigen invoer")}>kh</abbr><small>kN/m³</small></th><th /></tr></thead>
      <tbody>{layers.map((l, k) => <tr key={k}>
        {cell(k, "topNap", t("input.col.top", "Bovenkant"))}
        <td><select aria-label={`${t("input.col.soil", "Grondsoort")} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} value={l.soilId ?? ""} onChange={(e) => setSoil(k, e.target.value)}>{!l.soilId && <option value="">{l.name || t("input.ownValues", "Eigen waarden")}</option>}{SOIL_TYPES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
        {cell(k, "gamma", "γ", 0)}{cell(k, "gammaSat", "γsat", 0)}{cell(k, "phi", "φ′", 0)}{cell(k, "c", "c′", 0)}{cell(k, "delta", "δ", 0)}
        <td><input type="checkbox" aria-label={`${t("input.col.undrained", "ongedr.")} ${t("input.layerN", "laag {{n}}", { n: k + 1 })}, ${caption}`} checked={l.undrained} onChange={(e) => set(k, { undrained: e.target.checked })} /></td>
        {cell(k, "cu", "cu", 0)}{cell(k, "kh", "kh", 0)}
        <td><button type="button" className="sw-remove" aria-label={`${t("input.removeLayer", "Laag verwijderen")} ${k + 1}, ${caption}`} disabled={layers.length < 2} onClick={() => onChange(layers.filter((_, j) => j !== k))}>×</button></td>
      </tr>)}</tbody></table></div>
    <div className="sw-buttons"><button type="button" onClick={add}>{t("input.addLayer", "Laag toevoegen")}</button></div>
  </>;
}

export function InputPanel({ input: raw, result: r, onChange }: Props) {
  const i = normalizeWallInput(raw), sheet = i.construction === "sheet-pile", posts = i.construction === "posts";
  const { t } = useTranslation("calcWall");
  const cpts = useCptStore((s) => s.cpts);
  const change = (patch: Partial<WallInput>) => onChange?.({ ...i, ...patch });
  const catalog = useMemo(() => sheetPileCatalog(), []);
  const profiles = [...(catalog.get(i.manufacturer)?.values() ?? [])].flat().filter((p) => p.iCm4PerM !== null);
  const cpt = i.cptId ? cpts.get(i.cptId) : undefined;
  const f = { ...DEFAULT_FACTORS, ...i.factors }, a = i.anchor;
  const setAnchor = (patch: Partial<WallInput["anchor"]>) => change({ anchor: { ...a, ...patch } });
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
    </Section>
    {!posts && <Section title={t("input.support", "Anker of stempel")}>
      <label className="cs-check"><input type="checkbox" checked={a.enabled} onChange={(e) => setAnchor({ enabled: e.target.checked })} /> {t("input.supportEnabled", "Eén ankerrij of stempel")}</label>
      {a.enabled && <>
        {num("input.supportLevel", "Niveau", "m NAP", a.levelNap, (v) => setAnchor({ levelNap: v }))}
        {num("input.supportAngle", "Hoek met de horizontaal", "°", a.angleDeg, (v) => setAnchor({ angleDeg: v }), 0, t("input.supportAngleTitle", "Omlaag positief; 0° is een stempel naar de lage zijde"))}
        {num("input.supportSpacing", "Hart-op-hartafstand", "m", a.spacingM, (v) => setAnchor({ spacingM: v }), 0.01)}
        <label className="cs-check"><input type="checkbox" checked={a.rigid} onChange={(e) => setAnchor({ rigid: e.target.checked })} /> {t("input.supportRigid", "Starre steun")}</label>
        {!a.rigid && num("input.supportStiffness", "Veerstijfheid per anker", "kN/m", a.stiffnessKnPerM, (v) => setAnchor({ stiffnessKnPerM: v }), 0.01, t("input.supportStiffnessTitle", "Axiale stijfheid E·A/L van één anker of stempel"))}
      </>}
    </Section>}
    <Section title={t("input.layers", "Grondlagen (representatieve waarden)")}>
      <Row label={t("input.cpt", "Sondering")}><select aria-label={t("input.cptAria", "Sondering voor het laagvoorstel")} value={i.cptId ?? ""} onChange={(e) => change({ cptId: e.target.value || null })}>
        <option value="">{t("input.none", "Geen")}</option>{[...cpts.keys()].map((id) => <option key={id} value={id}>{id}</option>)}</select></Row>
      <div className="sw-buttons"><button type="button" disabled={!cpt} onClick={() => { if (!cpt) return; const layers = wallLayersFromCpt(cpt); if (layers.length) change({ layersHigh: layers }); }}>{t("input.proposal", "Voorstel uit sondering")}</button></div>
      <LayerTable layers={i.layersHigh} caption={t("input.layersHigh", "hoge zijde")} onChange={(layersHigh) => change({ layersHigh })} />
      <label className="cs-check"><input type="checkbox" checked={i.lowSameAsHigh} onChange={(e) => change({ lowSameAsHigh: e.target.checked, layersLow: e.target.checked || i.layersLow.length ? i.layersLow : i.layersHigh.map((l) => ({ ...l })) })} /> {t("input.lowSame", "Lage zijde heeft dezelfde lagen")}</label>
      {!i.lowSameAsHigh && <LayerTable layers={i.layersLow} caption={t("input.layersLow", "lage zijde")} onChange={(layersLow) => change({ layersLow })} />}
      <Hint>{t("input.layersHint", "De bovenste laag loopt door tot het maaiveld, de onderste tot onbeperkte diepte. De beddingsconstante kh vult u zelf in, bijvoorbeeld uit CUR 166 tabel 3.3: dit rekenblad levert daarvoor geen tabelwaarden en rekent met één constante per laag. Een voorstel uit de sondering is indicatief en laat kh open.")}</Hint>
    </Section>
    <More title={t("input.pressure", "Gronddruk")}>
      <Row label={t("input.passiveMethod", "Passieve gronddruk")}><select aria-label={t("input.passiveMethod", "Passieve gronddruk")} value={i.passiveMethod} onChange={(e) => change({ passiveMethod: e.target.value as WallInput["passiveMethod"] })}>
        <option value="auto">{t("input.methodAuto", "Recht glijvlak tot δ = φ′/3, daarboven gekromd")}</option><option value="straight">{t("input.methodStraight", "Altijd recht glijvlak")}</option><option value="curved">{t("input.methodCurved", "Altijd gekromd glijvlak")}</option></select></Row>
      {sheet && num("input.betaB", "Reductiefactor βB", "", i.betaB, (v) => change({ betaB: v }), 0.01, t("input.betaBTitle", "Reductie van het weerstandsmoment bij U-planken zonder volledige schuifkrachtoverdracht in de sloten; 1,0 voor Z-planken"))}
      {sheet && num("input.normalForce", "Extra normaalkracht NEd", "kN/m", i.normalForceKn, (v) => change({ normalForceKn: v }), 0)}
    </More>
    <More title={t("input.factors", "Partiële factoren en toeslagen")}>
      <Row label={t("input.factorSet", "Set")}><select aria-label={t("input.factorSetAria", "Set partiële factoren")} value={setOf?.id ?? ""} onChange={(e) => { const s = FACTOR_SETS.find((x) => x.id === e.target.value); if (s) change({ factors: { ...s.factors } }); }}>
        {!setOf && <option value="">{t("input.ownValues", "Eigen waarden")}</option>}{FACTOR_SETS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Row>
      {FACTOR_FIELDS.map(([key, name, unit, translate]) => { const label = translate ? t(`input.factor.${key}`, name) : name; return <Row key={key} label={label} unit={unit || undefined}><NumberInput label={unit ? `${label} [${unit}]` : label} min={unit ? 0 : 0.01} value={f[key]} onChange={(v) => change({ factors: { ...f, [key]: v } })} /></Row>; })}
      <Hint warn>{t("input.factorsHint", "De sets zijn een voorstel en zijn niet tegen de tekst van NEN 9997-1 en CUR 166 gelegd. Controleer de factoren, de toeslag op de kerende hoogte en de waterstanden bij uw veiligheidsklasse en pas ze aan.")}</Hint>
    </More>
  </div>;
}

export function VisualPanel({ input: i, result: r }: Props) {
  const { t } = useTranslation("calcWall");
  const [view, setView] = useState<"section" | "3d">("section");
  const [design, setDesign] = useState(true);
  if (!r.ok) return <p className="cs-hint">{t("visual.pending", "De tekening verschijnt zodra de invoer compleet is en er evenwicht is.")}</p>;
  const run = design ? r.uls : r.sls;
  const tab = (id: "section" | "3d", label: string) => <button type="button" role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>;
  return <div className="sw-visual">
    <div className="sw-tabs" role="tablist" aria-label={t("visual.viewAria", "Weergave")}>
      {tab("section", t("visual.section", "Doorsnede"))}{tab("3d", "3D")}
      {view === "section" && <select className="sw-run" aria-label={t("visual.runAria", "Waarden in de tekening")} value={design ? "uls" : "sls"} onChange={(e) => setDesign(e.target.value === "uls")}>
        <option value="uls">{t("visual.runUls", "Rekenwaarden")}</option><option value="sls">{t("visual.runSls", "Representatieve waarden")}</option></select>}
    </div>
    {view === "section" ? <>
      <SectionDrawing input={i} result={r} run={run} />
      <p className="cs-hint">{t("visual.sectionHint", "Op schaal. Tegen de wand staat de druk op de wand: bruin de korreldruk, blauw de waterdruk erbovenop; de streeplijnen zijn de actieve grens aan de hoge zijde en de passieve grens aan de lage zijde. Rechts de verplaatsing (positief naar de lage zijde), het moment en de dwarskracht over dezelfde hoogte; de stip is de grootste waarde.")}</p>
    </> : <WallScene3D scene={wallScene(i, r, r.sls)} />}
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
      <tbody>{r.checks.map((c) => <tr key={c.id} className={c.passes ? "" : "sw-row-fail"}><td>{c.title}</td><td>{fmt(c.load, c.unit === "m" ? 2 : 1)} {c.unit}</td><td>{fmt(c.resistance, c.unit === "m" ? 2 : 1)} {c.unit}</td><td className={c.passes ? "sw-ok" : "sw-fail"}>{fmt(c.uc, 2)}</td></tr>)}</tbody>
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

    <h3>{t("result.details", "Uitwerking per toets")}</h3>
    {r.checks.map((c) => <CheckDetails key={c.id} check={c} />)}
    <details className="settlement-reference"><summary>{t("result.method", "Methode, uitgangspunten en wat er niet in zit")}</summary>
      <ul>
        <li>{t("result.method1", "Verenmodel volgens CUR 166: een elastisch ondersteunde ligger met aan beide zijden grondveren die bij de neutrale gronddruk (K0 = 1 − sin φ′) beginnen en begrensd zijn door de actieve en de passieve gronddruk; één beddingsconstante per laag.")}</li>
        <li>{t("result.method2", "Gronddruk: actief met het rechte glijvlak (Coulomb), passief met het rechte glijvlak tot δ = φ′/3 en daarboven met het gekromde glijvlak volgens NEN-EN 1997-1 bijlage C.2. Ongedraineerde lagen met σh = σv ∓ 2·cu.")}</li>
        <li>{t("result.method3", "Veiligheid: rekenwaarden van de grondparameters, een toeslag op de kerende hoogte en eventueel op de waterstanden; verplaatsingen met representatieve waarden.")}</li>
        <li>{t("result.method4", "Staal: buiging, dwarskracht en normaalkracht volgens NEN-EN 1993-5, zonder corrosietoeslag. Hout: buiging en afschuiving volgens NEN-EN 1995-1-1. Kunststof en beton: tegen het opneembare moment dat u invoert.")}</li>
        <li>{t("result.method6", "Palen met schotten: per m wand met de buigstijfheid van de paal gedeeld door de hart-op-hartafstand; onder de schotten de gronddruk over de paalbreedte en de passieve weerstand over de factor voor ruimtelijke werking maal de paalbreedte. Het schot is een ligger op twee steunpunten tussen de palen.")}</li>
        <li>{t("result.method5", "Niet in deze versie: fasering en voorspanning, meer ankerrijen, de drietakkige veer (kh1, kh2, kh3) en het stappenplan 6.1 tot en met 6.5 van CUR 166 met lage en hoge stijfheid, grondwaterstroming, belastingen op afstand, hellend maaiveld en een aflopende waterbodem, verticaal evenwicht, algehele stabiliteit, het ontwerp van anker, ankerschot en gording, corrosie, plooi van koudgevormde profielen, kruip van hout en kunststof, de toets van de vervorming tegen een eis, en beschoeiingen met een verankerde paal.")}</li>
      </ul>
    </details>
  </div>;
}
