// apps/desktop/src/calc/modules/pile-bearing-capacity/ui/InputPanel.tsx
//
// Invoerscherm in rekenblad-stijl: per onderwerp een sectie met een
// kopje, daaronder rijen met het label links en de invoer plus eenheid
// rechts. Het paalsysteem kies je als tegel met een schetsje van de vorm;
// daarna staan alleen de velden die bij dat systeem horen.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCptStore } from "../../../../store/useCptStore";
import { SOIL_DEFAULTS, catalogText, getPileType, pileTypeName, resolvePileType, soilLabel } from "../catalog";
import type { ConcreteExtension, PileInput, PileResult, PileTypeSpec, SoilKind, SoilLayer } from "../types";
import { woodTopNap } from "../parts/geometry";
import { STEEL_TUBE_OD, rectText, seriesFor, sizeText } from "../standard-sizes";
import { CONCRETE_CLASSES, STEEL_GRADES, STRENGTH_DEFAULTS, TIMBER_CLASSES, defaultConcreteClass } from "../parts/strength-check";
import { TIMBER_SPECIES, TIMBER_SPECIES_SOURCE, resolveTimber } from "../parts/timber-species";
import { PILE_STANDARDS, applyStandard, changeStandard, getStandard, standardLabel, usesHistoricalProcedure, type PileStandard } from "../standards";
import { PILE_SYSTEMS, applyPileSystem, pileSystemIdOf, pileSystemName, switchPileType, type PileSystem } from "../pile-systems";
import { PileSketch } from "./PileSketch";
import { Hint, NumField, Row, Section } from "../../../framework/views/SheetForm";
import "./styles.css";

interface Props {
  input: PileInput;
  result: PileResult;
  onChange?: (next: PileInput) => void;
}

/** Niveau in m NAP op mm afgerond voor weergave: rekenen met
 *  standaardwaarden geeft anders ruis als 0.339999999. */
const mm = (v: number) => (Number.isFinite(v) ? +v.toFixed(3) : v);

/** Is een tabelrij bij de gekozen norm te gebruiken? `noTable`: het type
 *  bestaat, maar de tabel van die editie heeft er geen factoren voor. */
type Availability = "ok" | "noTable" | "notInStandard";
function availability(pileTypeId: string, standard: PileInput["standard"]): Availability {
  const type = getPileType(pileTypeId);
  const applied = type && applyStandard(type, standard);
  return !applied ? "notInStandard" : applied.factorsMissing ? "noTable" : "ok";
}
const systemAvailability = (system: PileSystem, standard: PileInput["standard"]): Availability => {
  const all = system.typeIds.map((id) => availability(id, standard));
  return all.includes("ok") ? "ok" : all.includes("noTable") ? "noTable" : "notInStandard";
};

export function InputPanel({ input, onChange }: Props) {
  const { t } = useTranslation("calcPile");
  const cpts = useCptStore((s) => s.cpts);
  const pileType = resolvePileType(input);
  const material: NonNullable<PileTypeSpec["material"]> = pileType?.material ?? "steel";
  const systemId = pileSystemIdOf(input);
  const system = PILE_SYSTEMS.find((s) => s.id === systemId);
  const set = <K extends keyof PileInput>(key: K, value: PileInput[K]) => {
    if (!onChange) return;
    onChange({ ...input, [key]: value });
  };
  const num = (key: keyof PileInput) => (e: { target: { value: string } }) => set(key, +e.target.value as never);
  const updateLayer = (index: number, patch: Partial<SoilLayer>) => set("soilProfile", input.soilProfile.map((layer, i) => i === index ? { ...layer, ...patch } : layer));
  // Wissel binnen hout (rond of gezaagd): de betonopzetter blijft zoals hij was.
  const changeType = (pileTypeId: string) => onChange?.(switchPileType(input, pileTypeId,
    getPileType(pileTypeId)?.material === "wood" && material === "wood" ? !!input.concreteExtension : true));
  const sawn = material === "wood" && pileType?.isCircular === false;
  const timber = material === "wood" ? resolveTimber(input.timberSpecies) : null;
  const strength = input.strengthCheck;
  const setStrength = (patch: Partial<NonNullable<PileInput["strengthCheck"]>>) => set("strengthCheck", { enabled: true, ...strength, ...patch });
  const ext = input.concreteExtension;
  const series = seriesFor(input.pileTypeId, input.presets);
  const sizes = series.sizes ?? (material === "steel" ? STEEL_TUBE_OD : undefined);
  const woodLength = woodTopNap(input) - input.pileToeNap;
  const setExt = (patch: Partial<ConcreteExtension>) => { if (ext) set("concreteExtension", { ...ext, ...patch }); };
  // Een systeem zonder tabelwaarden bij deze editie is niet te kiezen; de
  // tegel legt uit waarom en biedt de weg via projectfactoren.
  const [blocked, setBlocked] = useState<PileSystem | null>(null);
  const edition2025 = input.standard === "nen-9997-2025";
  const projectEdition = getStandard(input.standard)?.edition ?? "2017";
  const pickSystem = (s: PileSystem) => {
    const state = systemAvailability(s, input.standard);
    if (state === "notInStandard") return;
    if (state === "noTable" && !(s.id === systemId && input.projectFactors)) {
      // Wissel tussen hout met en zonder opzetter blijft mogelijk: dezelfde tabelrij.
      if (!(s.typeIds.includes(input.pileTypeId) && s.id !== systemId)) { setBlocked(s); return; }
    }
    setBlocked(null);
    if (s.id === systemId) return;
    const firstOk = s.typeIds.find((id) => availability(id, input.standard) === "ok");
    onChange?.(applyPileSystem(input, s.id, firstOk));
  };
  const pickWithProjectFactors = (s: PileSystem) => {
    setBlocked(null);
    const next = s.id === systemId ? input : applyPileSystem(input, s.id);
    onChange?.({ ...next, projectFactors: { alphaP: 0, alphaS: 0, alphaT: 0, beta: 1, s: 1, source: "", edition: projectEdition } });
  };
  const noTableReason = (name: string) => edition2025
    ? t("system.noTable2025", "Voor {{system}} staan de paalklassefactoren van NEN 9997-1:2025 nog niet in de tabel van dit programma; er wordt niets geschat. Het systeem is daarom bij deze editie niet te kiezen. Kies de editie 2017, of reken met projectfactoren uit een zelfverklaring of proefbelasting.", { system: name })
    : t("system.noTableRow", "{{system}} heeft geen eigen rij in tabel 7.c van deze editie en is daarom niet met tabelwaarden te kiezen. Reken met projectfactoren uit de zelfverklaring van het paalsysteem of uit een proefbelasting.", { system: name });
  const needsEA = !!pileType?.requiresEA && !input.timberTaper && !ext && input.axialStiffnessKn === undefined;
  // Kies je een paaltype dat EA vereist, dan staat de cursor meteen in dat
  // veld: anders rest alleen een melding in de uitdraai.
  const eaRef = useRef<HTMLInputElement>(null);
  const prevType = useRef(input.pileTypeId);
  useEffect(() => {
    if (prevType.current !== input.pileTypeId && needsEA) eaRef.current?.focus();
    prevType.current = input.pileTypeId;
  }, [input.pileTypeId, needsEA]);
  const sizeLabel = ext ? t("pile.woodDiameterAtJoint", "Houtdiameter bij de las") : input.timberTaper ? t("pile.headDiameter", "Kopdiameter") : pileType?.isCircular === false ? t("pile.sideLength", "Zijlengte") : t("pile.diameter", "Diameter");
  // Het standaardprofiel wordt eenmalig tot de begin-paalpunt opgebouwd en
  // groeit niet mee: zet je de paal dieper, dan telt het stuk zonder laag
  // stil niet mee in de schachtwrijving.
  const profileBottom = input.soilProfile.length ? Math.min(...input.soilProfile.map((l) => Math.min(l.startNap, l.endNap))) : null;
  const profileTooShallow = profileBottom !== null && profileBottom > input.pileToeNap + 0.005;

  return (
    <div className="pile-input cs-form">
      <Section title={t("standard.title", "Rekennorm")}>
        <Row label={t("standard.version", "Normversie")}>
          <select aria-label={t("standard.version", "Normversie")} title={standardLabel(getStandard(input.standard)) ?? t("standard.existingModel", "Bestaand projectmodel — ongewijzigd")} value={input.standard ?? ""} onChange={e => onChange?.(e.target.value ? changeStandard(input, e.target.value as PileStandard) : { ...input, standard: undefined })}>
            <option value="">{t("standard.existingModel", "Bestaand projectmodel — ongewijzigd")}</option>
            {PILE_STANDARDS.map(s => <option key={s.id} value={s.id}>{standardLabel(s)}</option>)}
          </select>
        </Row>
        {usesHistoricalProcedure(input.standard) && <Hint>{t("standard.historicalHint", "Historische drukberekening voor één paal bij één sondering. Positieve schachtwrijving in zand, constante doorsnede of expliciete houttapsheid; zakking en paalgroepen zijn niet geverifieerd. Bij normwissel worden projectfactoren gewist en γm opnieuw ingesteld.")}</Hint>}
      </Section>

      <Section title={t("cpt.title", "Sondering")}>
        <Row label={t("cpt.title", "Sondering")}>
          <select aria-label={t("cpt.title", "Sondering")} value={input.cptId ?? ""} onChange={(e) => set("cptId", e.target.value || null)}>
            <option value="">{t("cpt.choose", "— kies sondering —")}</option>
            {Array.from(cpts.values()).map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
        </Row>
      </Section>

      <Section title={t("pile.title", "Paal")}>
        <div className="cs-tiles pile-system-tiles" role="radiogroup" aria-label={t("pile.system", "Paalsysteem")}>
          {PILE_SYSTEMS.map((s) => {
            const state = systemAvailability(s, input.standard), name = pileSystemName(s);
            return (
              <button key={s.id} type="button" role="radio" aria-checked={systemId === s.id}
                className={`cs-tile${systemId === s.id ? " active" : ""}${state === "noTable" ? " pile-system-tile--no-table" : ""}`}
                disabled={state === "notInStandard"}
                title={state === "noTable" ? noTableReason(name) : name}
                onClick={() => pickSystem(s)}>
                <PileSketch system={s.id} /><span>{name}</span>
                {state === "noTable" && <small>{t("system.noTableBadge", "geen tabelwaarde")}</small>}
              </button>
            );
          })}
        </div>
        {blocked && <div role="alert" className="pile-system-blocked">
          <Hint warn>{noTableReason(pileSystemName(blocked))}</Hint>
          <button type="button" className="cs-settings-reset" onClick={() => pickWithProjectFactors(blocked)}>{t("system.useProjectFactors", "Kiezen met projectfactoren")}</button>
        </div>}
        <Row label={t("pile.type", "Paaltype")}>
          <select aria-label={t("pile.type", "Paaltype")} title={pileType ? pileTypeName(pileType) : undefined} value={input.pileTypeId} onChange={(e) => changeType(e.target.value)}>
            {!system && <option value={input.pileTypeId}>{input.pileTypeId}</option>}
            {PILE_SYSTEMS.filter((s) => s.id !== "timber-extension").map((s) => (
              <optgroup key={s.id} label={pileSystemName(s)}>
                {s.typeIds.map((id) => {
                  const p = getPileType(id)!;
                  return <option key={id} value={id} disabled={availability(id, input.standard) !== "ok" && id !== input.pileTypeId}>{pileTypeName(applyStandard(p, input.standard) ?? p)}</option>;
                })}
              </optgroup>
            ))}
          </select>
        </Row>
        {material === "wood" && (
          <Row label={t("pile.woodSection", "Doorsnede")}>
            <select aria-label={t("pile.woodSection", "Doorsnede")} value={sawn ? "timber-square" : "timber-uniform"} onChange={(e) => changeType(e.target.value)}>
              <option value="timber-uniform">{t("pile.woodRound", "Rond (heipaal)")}</option>
              <option value="timber-square" disabled={availability("timber-square", input.standard) !== "ok" && !sawn}>{t("pile.woodSawn", "Vierkant of rechthoekig a × b (gezaagd)")}</option>
            </select>
          </Row>
        )}
        {material === "wood" && <>
          <Row label={t("pile.timberSpecies", "Houtsoort")}>
            <select aria-label={t("pile.timberSpecies", "Houtsoort")} value={timber?.species.id ?? ""}
              onChange={(e) => set("timberSpecies", e.target.value ? { id: e.target.value } : undefined)}>
              <option value="">{t("pile.timberSpeciesOwn", "Eigen sterkteklasse")}</option>
              {TIMBER_SPECIES.map((s) => <option key={s.id} value={s.id}>{t(`pile.species.${s.id}`, s.name)}</option>)}
            </select>
          </Row>
          {timber && timber.species.grades.length > 1 && (
            <Row label={t("pile.timberGrade", "Sorteerklasse")}>
              <select aria-label={t("pile.timberGrade", "Sorteerklasse")} value={timber.grade?.id ?? ""} onChange={(e) => set("timberSpecies", { id: timber.species.id, gradeId: e.target.value })}>
                {timber.species.grades.map((g) => <option key={g.id} value={g.id}>{g.label} → {g.strengthClass}</option>)}
              </select>
            </Row>
          )}
          {timber && <Hint>{timber.grade
            ? t("pile.timberSpeciesHint", "{{grade}} → {{cls}} ({{source}}). Alleen voor de sterktetoets; paalklassefactoren en draagvermogen volgen uit het paaltype.", { grade: timber.grade.label, cls: timber.grade.strengthClass, source: TIMBER_SPECIES_SOURCE })
            : t("pile.timberSpeciesNoClass", "Geen eenduidige sterkteklasse in de bron: kies de klasse bij de sterktetoets. Paalklassefactoren en draagvermogen volgen uit het paaltype.")}</Hint>}
        </>}
        {sawn && (
          <Row label={t("pile.standardSize", "Standaardmaat")}>
            <select aria-label={t("pile.standardSize", "Standaardmaat")} value={series.rect.some(([a, b]) => a === input.diameterMm && b === (input.sideBMm ?? input.diameterMm)) ? `${input.diameterMm}x${input.sideBMm ?? input.diameterMm}` : ""}
              onChange={(e) => { const [a, b] = e.target.value.split("x").map(Number); if (a > 0 && b > 0) onChange?.({ ...input, diameterMm: a, sideBMm: b === a ? undefined : b }); }}>
              {!series.rect.some(([a, b]) => a === input.diameterMm && b === (input.sideBMm ?? input.diameterMm)) && <option value="">{t("pile.customSize", "Eigen maat")}</option>}
              {series.rect.map(([a, b]) => <option key={`${a}x${b}`} value={`${a}x${b}`}>{rectText(a, b)} mm</option>)}
            </select>
          </Row>
        )}
        {sizes && !sawn && (
          <Row label={material === "steel" ? t("pile.tubeSize", "Buismaat") : t("pile.standardSize", "Standaardmaat")}>
            <select aria-label={material === "steel" ? t("pile.tubeSize", "Buismaat") : t("pile.standardSize", "Standaardmaat")} value={sizes.includes(input.diameterMm) ? String(input.diameterMm) : ""} onChange={(e) => e.target.value && set("diameterMm", Number(e.target.value))}>
              {!sizes.includes(input.diameterMm) && <option value="">{t("pile.customSize", "Eigen maat")}</option>}
              {sizes.map((d) => <option key={d} value={d}>{pileType?.isCircular === false ? `${sizeText(d)}×${sizeText(d)}` : `Ø${sizeText(d)}`} mm</option>)}
            </select>
          </Row>
        )}
        <Row label={sawn ? t("pile.sideA", "Zijde a") : sizeLabel} unit="mm">
          <NumField aria-label={`${sawn ? t("pile.sideA", "Zijde a") : sizeLabel} [mm]`} min="1" step="any" value={input.diameterMm} onChange={num("diameterMm")} />
        </Row>
        {sawn && <>
          <Row label={t("pile.sideB", "Zijde b")} unit="mm">
            <NumField aria-label={`${t("pile.sideB", "Zijde b")} [mm]`} min="1" step="any" value={input.sideBMm ?? input.diameterMm} onChange={(e) => set("sideBMm", e.target.value === "" || +e.target.value === input.diameterMm ? undefined : +e.target.value)} />
          </Row>
          {input.sideBMm !== undefined && input.sideBMm !== input.diameterMm && <Hint warn>{t("pile.rectHint", "Rechthoek a ≠ b: oppervlak, omtrek en Deq volgen uit a en b; de vormfactor s voor een rechthoekige paalvoet bepaalt het programma niet. Vul s zo nodig in als projectfactor.")}</Hint>}
        </>}
        {pileType?.material === "wood" && <>
          {ext && <div className="cs-subgroup">
            <Row label={t("extension.joint", "Las (onderkant opzetter)")} unit="m NAP">
              <NumField aria-label={t("extension.jointAria", "Las [m NAP]")} step="0.05" value={mm(ext.jointNap)} onChange={e => setExt({ jointNap: +e.target.value })} />
            </Row>
            <Row label={t("extension.size", "Opzetter")}>
              <select aria-label={t("extension.size", "Opzetter")} value={series.extensions.find((p) => p.sizeMm === ext.sizeMm && p.isCircular === ext.isCircular)?.id ?? "eigen"}
                onChange={e => { const p = series.extensions.find((x) => x.id === e.target.value); if (p) setExt({ sizeMm: p.sizeMm, isCircular: p.isCircular }); }}>
                {series.extensions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="eigen">{t("pile.customSize", "Eigen maat")}</option>
              </select>
            </Row>
            <Row label={t("extension.length", "Lengte opzetter")} unit="m">
              <select aria-label={t("extension.lengthAria", "Lengte opzetter [m]")} value={series.extensionLengths.find((l) => Math.abs(input.pileTopNap - l - ext.jointNap) < 0.005)?.toString() ?? "eigen"}
                onChange={e => { const l = Number(e.target.value); if (Number.isFinite(l)) { const jointNap = +(input.pileTopNap - l).toFixed(2); const woodLen = +(jointNap - input.pileToeNap).toFixed(2);
                  onChange?.({ ...input, concreteExtension: { ...ext, jointNap }, timberTaper: input.timberTaper && { ...input.timberTaper, lengthM: Math.min(input.timberTaper.lengthM, woodLen) } }); } }}>
                {series.extensionLengths.map((l) => <option key={l} value={l}>{sizeText(l)} m</option>)}
                <option value="eigen">{t("extension.customJoint", "Eigen las")}</option>
              </select>
            </Row>
            {!series.extensions.some((p) => p.sizeMm === ext.sizeMm && p.isCircular === ext.isCircular) && <>
              <Row label={t("extension.shape", "Vorm")}>
                <select aria-label={t("extension.shapeAria", "Vorm opzetter")} value={ext.isCircular ? "rond" : "vierkant"} onChange={e => setExt({ isCircular: e.target.value === "rond" })}>
                  <option value="vierkant">{t("shape.square", "Vierkant")}</option>
                  <option value="rond">{t("shape.round", "Rond")}</option>
                </select>
              </Row>
              <Row label={ext.isCircular ? t("extension.diameter", "Diameter opzetter") : t("extension.side", "Zijde opzetter")} unit="mm">
                <NumField aria-label={t("extension.sizeAria", "Maat opzetter [mm]")} min="1" value={ext.sizeMm} onChange={e => setExt({ sizeMm: +e.target.value })} />
              </Row>
            </>}
            {ext.jointNap > input.waterNap - 0.5 + 1e-9 && <Hint warn>{t("extension.jointTooHigh", "De las ligt minder dan 0,5 m onder de grondwaterstand (NAP {{water}}): het hout blijft daar niet permanent nat. Kies een langere opzetter.", { water: mm(input.waterNap) })}</Hint>}
            <Hint>{t("extension.perimeterHint", "Boven de las rekent de omtrek van de opzetter, eronder die van het hout.")}</Hint>
          </div>}
          {!sawn && <label className="cs-check">
            <input type="checkbox" checked={!!input.timberTaper} onChange={e => onChange?.({ ...input, baseDiameterMm: undefined, timberTaper: e.target.checked ? { toeDiameterMm: input.diameterMm, lengthM: +woodLength.toFixed(2) } : undefined })} />
            {t("taper.title", "Tapse houten paal")}
          </label>}
        </>}
        {input.timberTaper ? <>
          <Row label={t("taper.toeDiameter", "Puntdiameter")} unit="mm">
            <NumField aria-label={t("taper.toeDiameterAria", "Puntdiameter hout [mm]")} min="1" max={input.diameterMm} value={input.timberTaper.toeDiameterMm} onChange={e => set("timberTaper", { ...input.timberTaper!, toeDiameterMm: +e.target.value })} />
          </Row>
          <Row label={ext ? t("taper.lengthFromJoint", "Tapse lengte vanaf de las") : t("taper.lengthFromHead", "Tapse lengte vanaf kop")} unit="m">
            <NumField aria-label={ext ? t("taper.lengthFromJointAria", "Tapse lengte vanaf de las [m]") : t("taper.lengthFromHeadAria", "Tapse lengte vanaf kop [m]")} min="0.01" step="0.1" max={woodLength} value={input.timberTaper.lengthM} onChange={e => set("timberTaper", { ...input.timberTaper!, lengthM: +e.target.value })} />
          </Row>
          <Hint>{ext
            ? t("taper.hintFromJoint", "De houtdiameter neemt lineair af vanaf de las; onder het tapse deel blijft de puntdiameter constant. De kleefomtrek volgt het gekozen traject; zakking en veerwaarden worden niet bepaald.")
            : t("taper.hintFromHead", "De houtdiameter neemt lineair af vanaf de kop; onder het tapse deel blijft de puntdiameter constant. De kleefomtrek volgt het gekozen traject; zakking en veerwaarden worden niet bepaald.")}</Hint>
        </> : !ext && (system?.fields.base || !system || input.baseDiameterMm !== undefined) && (
          <Row label={t("pile.baseSize", "Puntafmeting")} unit="mm">
            <NumField aria-label={t("pile.baseSizeAria", "Puntafmeting [mm] (leeg = schacht)")} min="1" placeholder={t("pile.baseSizePlaceholder", "schacht")} value={input.baseDiameterMm ?? ""} onChange={(e) => set("baseDiameterMm", e.target.value === "" ? undefined : +e.target.value)} />
          </Row>
        )}
        {pileType?.material === "steel" && !pileType.requiresEA && (
          <Row label={t("pile.wallThickness", "Wanddikte")} unit="mm">
            <NumField aria-label={t("pile.wallThicknessAria", "Wanddikte [mm]")} min="0.1" step="0.1" value={input.wallThicknessMm} onChange={num("wallThicknessMm")} />
          </Row>
        )}
        {pileType?.openEnd && <>
          <Row label={t("openTube.tip", "Punt")}>
            <select aria-label={t("openTube.tip", "Punt")} value={input.openTube?.plug ? "plug" : "ring"} onChange={(e) => set("openTube", e.target.value === "plug" ? { plug: true, plugFactor: input.openTube?.plugFactor } : { plug: false, plugFactor: input.openTube?.plugFactor })}>
              <option value="ring">{t("openTube.noPlug", "Zonder prop: alleen de staalring")}</option>
              <option value="plug">{t("openTube.plug", "Met prop: staalring + η × binnendoorsnede")}</option>
            </select>
          </Row>
          {input.openTube?.plug && (
            <Row label={<>{t("openTube.plugFactor", "Propfactor")} η</>} unit="—"
              missing={!(input.openTube.plugFactor! > 0 && input.openTube.plugFactor! <= 1) ? t("openTube.plugFactorMissing", "Vul η in (0 tot en met 1) — zonder η wordt er niet gerekend.") : undefined}>
              <NumField aria-label={t("openTube.plugFactorAria", "Propfactor η [-]")} min="0.01" max="1" step="0.05" placeholder={t("openTube.plugFactorPlaceholder", "invullen")} value={input.openTube.plugFactor ?? ""}
                onChange={(e) => set("openTube", { plug: true, plugFactor: e.target.value === "" ? undefined : +e.target.value })} />
            </Row>
          )}
          <Hint>{input.openTube?.plug
            ? t("openTube.hintPlug", "Met prop telt de staalring plus η maal de binnendoorsnede; η = 1 is de volle doorsnede. De norm geeft geen waarde voor η: onderbouw hem, bijvoorbeeld met de wrijving binnen in de buis (NEN 9997-1 art. 7.6.2.3(d); boven 500 mm ook art. 7.6.2.1(13)).")
            : t("openTube.hintNoPlug", "Zonder prop telt alleen de staalring en blijft de wrijving binnen in de buis buiten beschouwing; dat is een ondergrens van NEN 9997-1 art. 7.6.2.3(d).")}</Hint>
        </>}
        <label className="cs-check">
          <input type="checkbox" checked={!!input.capPointQc15} onChange={(e) => set("capPointQc15", e.target.checked || undefined)} />
          {t("point.cap15", "qc in traject I en II begrenzen op 15 MPa")}
        </label>
        <Hint>{t("point.cap15Hint", "Conservatief, eigen keuze. De norm begrenst alleen qb;max op 15 MPa; traject III volgt via het lopende minimum.")}</Hint>
        {!input.timberTaper && !ext && (
          <Row label={<>{t("pile.axialStiffness", "Axiale stijfheid EA")}{pileType?.requiresEA && <span className="cs-required"> · {t("pile.required", "verplicht")}</span>}</>} unit="kN"
            missing={needsEA ? t("pile.eaMissing", "Vereist voor dit paaltype — zonder EA wordt er niet gerekend.") : undefined}>
            <NumField ref={eaRef} aria-invalid={needsEA || undefined} aria-label={pileType?.requiresEA ? t("pile.eaAriaRequired", "Axiale stijfheid EA [kN] (verplicht)") : t("pile.eaAriaOptional", "Axiale stijfheid EA [kN] (optioneel)")} min="1" placeholder={pileType?.requiresEA ? "" : t("pile.optional", "optioneel")} value={input.axialStiffnessKn ?? ""} onChange={(e) => set("axialStiffnessKn", e.target.value === "" ? undefined : +e.target.value)} />
          </Row>
        )}
        {pileType?.conditions && <Hint>{catalogText(pileType.conditions)}</Hint>}
      </Section>

      <Section title={t("levels.title", "Paalniveaus")}>
        <Row label={t("levels.pileTop", "Paalkop")} unit="m NAP"><NumField aria-label={t("levels.pileTopAria", "Paalkop [m NAP]")} step="0.01" value={mm(input.pileTopNap)} onChange={num("pileTopNap")} /></Row>
        <Row label={t("levels.pileToe", "Paalpunt")} unit="m NAP"><NumField aria-label={t("levels.pileToeAria", "Paalpunt [m NAP]")} step="0.01" value={mm(input.pileToeNap)} onChange={num("pileToeNap")} /></Row>
        <Row label={t("levels.water", "Grondwater")} unit="m NAP"><NumField aria-label={t("levels.waterAria", "Grondwater [m NAP]")} step="0.01" value={mm(input.waterNap)} onChange={num("waterNap")} /></Row>
        <Row label={t("levels.excavation", "Ontgraving")} unit="m NAP"><NumField aria-label={t("levels.excavationAria", "Ontgraving [m NAP]")} step="0.01" value={mm(input.excavationNap)} onChange={num("excavationNap")} /></Row>
      </Section>

      <Section title={t("load.title", "Belasting")}>
        <Row label={<>N<sub>Ed</sub> {t("load.design", "ontwerpbelasting")}</>} unit="kN"><NumField aria-label="NEd [kN]" value={input.nEd} onChange={num("nEd")} /></Row>
        <Row label={<>N<sub>Ek</sub> {t("load.characteristic", "karakteristiek")}</>} unit="kN"><NumField aria-label="NEk [kN]" value={input.nEk} onChange={num("nEk")} /></Row>
        <Row label={<>γ<sub>m</sub> {t("load.materialFactor", "materiaalfactor")}</>}><NumField aria-label="γm" step="0.01" value={input.gammaM} onChange={num("gammaM")} /></Row>
        <Row label={<>γ<sub>f,nk</sub> {t("load.negativeSkinFriction", "negatieve kleef")}</>}><NumField aria-label="γf,nk" step="0.01" value={input.gammaFnk} onChange={num("gammaFnk")} /></Row>
      </Section>

      <Section title={t("strength.title", "Sterkte van de paal")}>
        <label className="cs-check">
          <input type="checkbox" checked={!!strength?.enabled} onChange={(e) => set("strengthCheck", e.target.checked ? { ...strength, enabled: true } : strength ? { ...strength, enabled: false } : undefined)} />
          {t("strength.enable", "Sterkte van de paal toetsen")}
        </label>
        {strength?.enabled && <>
          {material === "steel" && !pileType?.requiresEA && (
            <Row label={t("strength.steelGrade", "Staalsoort")}>
              <select aria-label={t("strength.steelGrade", "Staalsoort")} value={strength.steelGrade ?? STRENGTH_DEFAULTS.steelGrade} onChange={(e) => setStrength({ steelGrade: e.target.value })}>
                {STEEL_GRADES.map((g) => <option key={g.id} value={g.id}>{g.id}</option>)}
              </select>
            </Row>
          )}
          {material === "wood" && <>
            {timber?.grade ? <Row label={t("strength.timberClass", "Sterkteklasse hout")}>
              <span>{timber.grade.strengthClass} · {sizeText(TIMBER_CLASSES.find((c) => c.id === timber.grade!.strengthClass)?.fc0kMpa ?? 0)} MPa</span>
            </Row> : <>
            <Row label={t("strength.timberClass", "Sterkteklasse hout")}>
              <select aria-label={t("strength.timberClass", "Sterkteklasse hout")} value={strength.timberFc0kMpa !== undefined ? "eigen" : strength.timberClass ?? STRENGTH_DEFAULTS.timberClass}
                onChange={(e) => e.target.value === "eigen" ? setStrength({ timberFc0kMpa: TIMBER_CLASSES.find((c) => c.id === (strength.timberClass ?? STRENGTH_DEFAULTS.timberClass))?.fc0kMpa ?? 18 }) : setStrength({ timberClass: e.target.value, timberFc0kMpa: undefined })}>
                {TIMBER_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.id} · {sizeText(c.fc0kMpa)} MPa</option>)}
                <option value="eigen">{t("strength.ownValue", "Eigen waarde")}</option>
              </select>
            </Row>
            {strength.timberFc0kMpa !== undefined && <Row label={<>f<sub>c,0,k</sub></>} unit="MPa"><NumField aria-label="fc,0,k [MPa]" min="0.1" step="0.5" value={strength.timberFc0kMpa} onChange={(e) => setStrength({ timberFc0kMpa: +e.target.value })} /></Row>}
            </>}
            <Row label={<>k<sub>mod</sub></>}><NumField aria-label="kmod" min="0.05" max="1.1" step="0.05" value={strength.kMod ?? STRENGTH_DEFAULTS.kMod} onChange={(e) => setStrength({ kMod: +e.target.value })} /></Row>
            <Row label={<>γ<sub>M</sub> {t("strength.timber", "hout")}</>}><NumField aria-label={`γM ${t("strength.timber", "hout")}`} min="1" step="0.05" value={strength.gammaMTimber ?? STRENGTH_DEFAULTS.gammaMTimber} onChange={(e) => setStrength({ gammaMTimber: +e.target.value })} /></Row>
          </>}
          {(material === "concrete" || ext) && pileType && (
            <Row label={ext ? t("strength.concreteClassExtension", "Betonklasse opzetter") : t("strength.concreteClass", "Betonsterkteklasse")}>
              <select aria-label={ext ? t("strength.concreteClassExtension", "Betonklasse opzetter") : t("strength.concreteClass", "Betonsterkteklasse")} value={strength.concreteClass ?? defaultConcreteClass(pileType)} onChange={(e) => setStrength({ concreteClass: e.target.value })}>
                {CONCRETE_CLASSES.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
              </select>
            </Row>
          )}
          <Hint>{material === "wood"
            ? t("strength.hintTimber", "Druk evenwijdig aan de vezel op N_Ed + F_nk;d (NEN-EN 1995-1-1). k_mod en γ_M: standaard voor permanent nat hout en blijvende belasting. Knik is niet getoetst.")
            : material === "steel"
              ? t("strength.hintSteel", "Doorsnedeklasse en normaalkracht van de buis op N_Ed + F_nk;d (NEN-EN 1993-1-1). Knik is niet getoetst: het programma kent geen vrije of slap gesteunde lengte.")
              : t("strength.hintConcrete", "Normaalkracht van de betondoorsnede op N_Ed + F_nk;d (NEN-EN 1992-1-1), zonder wapening. Knik is niet getoetst.")}</Hint>
        </>}
      </Section>

      <Section title={t("report.title", "Uitdraai")}>
        <Row label={t("report.detail", "Omvang")}>
          <select aria-label={t("report.detailAria", "Omvang van de uitdraai")} value={input.reportDetail ?? "compact"} onChange={(e) => set("reportDetail", e.target.value === "full" ? "full" : undefined)}>
            <option value="compact">{t("report.compact", "Beknopt: tabellen")}</option>
            <option value="full">{t("report.full", "Uitgebreid: volledige afleiding")}</option>
          </select>
        </Row>
      </Section>

      <Section title={t("skin.title", "Kleefzones")}>
        <Row label={t("skin.negBottom", "Onderkant negatieve kleef")} unit="m NAP"><NumField aria-label={t("skin.negBottomAria", "Onderkant negatieve kleef [m NAP]")} step="0.01" value={mm(input.negKleefBottomNap)} onChange={num("negKleefBottomNap")} /></Row>
        {/* Standaard begint positieve kleef waar negatieve kleef ophoudt;
            los te verlagen als er een zwakke tussenlaag zit. De onderkant
            is altijd de paalpunt. */}
        <Row label={t("skin.posTop", "Bovenkant positieve kleef")} unit="m NAP"><NumField aria-label={t("skin.posTopAria", "Bovenkant positieve kleef [m NAP]")} step="0.01" value={mm(input.posKleefTopNap ?? input.negKleefBottomNap)} onChange={num("posKleefTopNap")} /></Row>
        <Row label={<>K<sub>0</sub>·tan δ {t("skin.minimum", "minimum")}</>}><NumField aria-label={t("skin.ksMinAria", "K0·tan(δ) minimum")} step="0.01" value={input.ksMinFactor} onChange={num("ksMinFactor")} /></Row>
        <Hint>{t("skin.dragHint", "Paalniveaus en kleefzones zijn ook te verslepen in de sondering.")}</Hint>
      </Section>

      <Section title={t("profile.title", "Grondprofiel")}>
        {profileTooShallow && <p className="cs-hint cs-hint--warn" role="status">{t("profile.tooShallow", "Het grondprofiel stopt op NAP {{bottom}} m, boven de paalpunt op NAP {{toe}} m. Over dat stuk telt geen schachtwrijving mee; verleng de onderste laag.", { bottom: profileBottom!.toFixed(2), toe: input.pileToeNap.toFixed(2) })}</p>}
        <div className="cs-table-wrap">
          <table className="cs-layer-table">
            <thead>
              <tr>
                <th>#</th><th>{t("profile.soilType", "Grondsoort")}</th>
                <th>{t("profile.top", "Boven")}<small>m NAP</small></th><th>{t("profile.bottom", "Onder")}<small>m NAP</small></th>
                <th>γ<small>kN/m³</small></th><th>γ<sub>w</sub><small>kN/m³</small></th><th>φ<small>°</small></th>
              </tr>
            </thead>
            <tbody>
              {input.soilProfile.map((layer, index) => (
                <tr key={index}>
                  <td className="cs-layer-index">{index + 1}</td>
                  <td>
                    <select aria-label={t("profile.soilTypeAria", "Grondsoort laag {{n}}", { n: index + 1 })} value={layer.kind} onChange={e => {
                      const kind = e.target.value as SoilKind;
                      const { gammaK, gammaW, phi } = SOIL_DEFAULTS[kind];
                      updateLayer(index, { kind, gammaK, gammaW, phi });
                    }}>{(Object.keys(SOIL_DEFAULTS) as SoilKind[]).map((kind) => <option key={kind} value={kind}>{soilLabel(kind)}</option>)}</select>
                  </td>
                  {(["startNap", "endNap", "gammaK", "gammaW", "phi"] as const).map(key => (
                    <td key={key}><NumField aria-label={t("profile.fieldAria", "{{field}} laag {{n}}", { field: key, n: index + 1 })} step="0.1" value={layer[key]} onChange={e => updateLayer(index, { [key]: +e.target.value })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={t("factors.title", "Paalfactoren")}>
        <dl className="cs-factors">
          <div><dt>α<sub>p</sub></dt><dd>{pileType && !pileType.factorsMissing ? pileType.alphaP : "—"}</dd></div>
          <div><dt>α<sub>s</sub></dt><dd>{pileType && !pileType.factorsMissing ? pileType.alphaS : "—"}</dd></div>
          <div><dt>β</dt><dd>{pileType?.beta ?? "—"}</dd></div>
          <div><dt>s</dt><dd>{pileType?.s ?? "—"}</dd></div>
        </dl>
        {pileType?.factorsMissing && <Hint warn>{noTableReason(system ? pileSystemName(system) : input.pileTypeId)}</Hint>}
        <Hint>{t("factors.basis", "Normbasis: {{edition}}. {{source}}", { edition: catalogText(pileType?.edition), source: catalogText(pileType?.source) })}</Hint>
        <label className="cs-check">
          <input type="checkbox" checked={!!input.projectFactors} onChange={(e) => set("projectFactors", e.target.checked && pileType ? {
            alphaP: pileType.alphaP, alphaS: pileType.alphaS, alphaT: pileType.alphaT, beta: pileType.beta, s: pileType.s, source: "", edition: getStandard(input.standard)?.edition ?? "2017",
          } : undefined)} />
          {t("factors.useProject", "Projectfactoren / zelfverklaring gebruiken")}
        </label>
        {input.projectFactors && <>
          <Row label={t("factors.edition", "Editie")}>
            <select aria-label={t("factors.edition", "Editie")} value={input.projectFactors.edition} onChange={(e) => set("projectFactors", { ...input.projectFactors!, edition: e.target.value })}>
              {usesHistoricalProcedure(input.standard)
                ? <option value={getStandard(input.standard)?.edition}>{getStandard(input.standard)?.edition}</option>
                : <>{!edition2025 && <option value="2017">2017</option>}<option value="2025">{t("factors.edition2025", "2025 — projectfactoren")}</option></>}
            </select>
          </Row>
          <Row label={t("factors.source", "Bron / verklaring")}><input aria-label={t("factors.source", "Bron / verklaring")} value={input.projectFactors.source} onChange={(e) => set("projectFactors", { ...input.projectFactors!, source: e.target.value })} /></Row>
          {(["alphaP", "alphaS", "alphaT", "beta", "s"] as const).map((key) => {
            const label = ({ alphaP: "αp", alphaS: "αs", alphaT: t("factors.alphaTLabel", "αt (geen trekcontrole)"), beta: "β", s: "s" })[key];
            return <Row key={key} label={label}><NumField aria-label={label} min="0" step="0.001" value={input.projectFactors![key]} onChange={(e) => set("projectFactors", { ...input.projectFactors!, [key]: +e.target.value })} /></Row>;
          })}
          <Hint>{t("factors.sourceHint", "De bron moet passen bij paalsysteem, uitvoering en afmetingen. Factoren uit 2025 maken de volledige rekenmethode niet automatisch conform 2025.")}</Hint>
        </>}
      </Section>
    </div>
  );
}
