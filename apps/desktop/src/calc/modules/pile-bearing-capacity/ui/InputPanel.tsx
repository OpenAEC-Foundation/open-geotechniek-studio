// apps/desktop/src/calc/modules/pile-bearing-capacity/ui/InputPanel.tsx
import { useCptStore } from "../../../../store/useCptStore";
import { PILE_TYPE_CATALOG, SOIL_DEFAULTS, resolvePileType } from "../catalog";
import type { PileInput, PileResult, SoilKind, SoilLayer } from "../types";
import { PILE_STANDARDS, applyStandard, changeStandard, getStandard, usesHistoricalProcedure, type PileStandard } from "../standards";
import "./styles.css";

interface Props {
  input: PileInput;
  result: PileResult;
  onChange?: (next: PileInput) => void;
}

export function InputPanel({ input, onChange }: Props) {
  const cpts = useCptStore((s) => s.cpts);
  const pileType = resolvePileType(input);
  const set = <K extends keyof PileInput>(key: K, value: PileInput[K]) => {
    if (!onChange) return;
    onChange({ ...input, [key]: value });
  };
  const updateLayer = (index: number, patch: Partial<SoilLayer>) => set("soilProfile", input.soilProfile.map((layer, i) => i === index ? { ...layer, ...patch } : layer));

  return (
    <div className="pile-input">
      <fieldset>
        <legend>Rekennorm</legend>
        <label className="pile-standard-field">Normversie<select value={input.standard ?? ""} onChange={e => onChange?.(e.target.value ? changeStandard(input, e.target.value as PileStandard) : { ...input, standard: undefined })}>
          <option value="">Bestaand projectmodel — ongewijzigd</option>
          {PILE_STANDARDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select></label>
        {usesHistoricalProcedure(input.standard) && <p>Historische drukberekening voor één paal bij één sondering. Positieve schachtwrijving in zand, constante doorsnede; zakking en paalgroepen zijn niet geverifieerd. Bij normwissel worden projectfactoren gewist en γm opnieuw ingesteld.</p>}
      </fieldset>
      <fieldset>
        <legend>Sondering</legend>
        <select value={input.cptId ?? ""} onChange={(e) => set("cptId", e.target.value || null)}>
          <option value="">— kies CPT —</option>
          {Array.from(cpts.values()).map((c) => (
            <option key={c.id} value={c.id}>{c.id}</option>
          ))}
        </select>
      </fieldset>

      <fieldset>
        <legend>Paal</legend>
        <label>Type
          <select value={input.pileTypeId} onChange={(e) => onChange?.({ ...input, pileTypeId: e.target.value, projectFactors: undefined, axialStiffnessKn: undefined, baseDiameterMm: undefined })}>
            {PILE_TYPE_CATALOG.map((p) => (
              <option key={p.id} value={p.id} disabled={!applyStandard(p, input.standard)}>{applyStandard(p, input.standard)?.name ?? p.name}</option>
            ))}
          </select>
        </label>
        <label>{pileType?.isCircular === false ? "Zijlengte [mm]" : "Diameter [mm]"}<input type="number" min="1" value={input.diameterMm} onChange={(e) => set("diameterMm", +e.target.value)} /></label>
        <label>Puntafmeting [mm] (leeg = schacht)<input type="number" min="1" value={input.baseDiameterMm ?? ""} onChange={(e) => set("baseDiameterMm", e.target.value === "" ? undefined : +e.target.value)} /></label>
        {pileType?.material === "steel" && !pileType.requiresEA && <label>Wanddikte [mm]<input type="number" min="0.1" step="0.1" value={input.wallThicknessMm} onChange={(e) => set("wallThicknessMm", +e.target.value)} /></label>}
        <label>Axiale stijfheid EA [kN]{pileType?.requiresEA ? " (verplicht)" : " (optioneel)"}<input type="number" min="1" value={input.axialStiffnessKn ?? ""} onChange={(e) => set("axialStiffnessKn", e.target.value === "" ? undefined : +e.target.value)} /></label>
        <p>{pileType?.conditions}</p>
      </fieldset>

      <fieldset>
        <legend>Paalfactoren</legend>
        <p>Normbasis: {pileType?.edition}. {pileType?.source}</p>
        <p>αp = {pileType?.alphaP}; αs = {pileType?.alphaS}; β = {pileType?.beta}; s = {pileType?.s}</p>
        <label><input type="checkbox" checked={!!input.projectFactors} onChange={(e) => set("projectFactors", e.target.checked && pileType ? {
          alphaP: pileType.alphaP, alphaS: pileType.alphaS, alphaT: pileType.alphaT, beta: pileType.beta, s: pileType.s, source: "", edition: getStandard(input.standard)?.edition ?? "2017",
        } : undefined)} />Projectfactoren / zelfverklaring gebruiken</label>
        {input.projectFactors && <>
          <label>Editie<select value={input.projectFactors.edition} onChange={(e) => set("projectFactors", { ...input.projectFactors!, edition: e.target.value })}>{usesHistoricalProcedure(input.standard) ? <option value={getStandard(input.standard)?.edition}>{getStandard(input.standard)?.edition}</option> : <><option value="2017">2017</option><option value="2025">2025 — projectfactoren</option></>}</select></label>
          <label>Bron / verklaring<input value={input.projectFactors.source} onChange={(e) => set("projectFactors", { ...input.projectFactors!, source: e.target.value })} /></label>
          {(["alphaP", "alphaS", "alphaT", "beta", "s"] as const).map((key) => <label key={key}>{({alphaP:"αp",alphaS:"αs",alphaT:"αt (geen trekcontrole)",beta:"β",s:"s"})[key]}<input type="number" min="0" step="0.001" value={input.projectFactors![key]} onChange={(e) => set("projectFactors", { ...input.projectFactors!, [key]: +e.target.value })} /></label>)}
          <p>De bron moet passen bij paalsysteem, uitvoering en afmetingen. Factoren uit 2025 maken de volledige rekenmethode niet automatisch conform 2025.</p>
        </>}
      </fieldset>

      <fieldset>
        <legend>Paalniveaus [m NAP]</legend>
        <label>Paalkop<input type="number" step="0.01" value={input.pileTopNap} onChange={(e) => set("pileTopNap", +e.target.value)} /></label>
        <label>Paalpunt<input type="number" step="0.01" value={input.pileToeNap} onChange={(e) => set("pileToeNap", +e.target.value)} /></label>
        <label>Water<input type="number" step="0.01" value={input.waterNap} onChange={(e) => set("waterNap", +e.target.value)} /></label>
        <label>Ontgraving<input type="number" step="0.01" value={input.excavationNap} onChange={(e) => set("excavationNap", +e.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Belasting [kN]</legend>
        <label>NEd<input type="number" value={input.nEd} onChange={(e) => set("nEd", +e.target.value)} /></label>
        <label>NEk<input type="number" value={input.nEk} onChange={(e) => set("nEk", +e.target.value)} /></label>
        <label>γm<input type="number" step="0.01" value={input.gammaM} onChange={(e) => set("gammaM", +e.target.value)} /></label>
        <label>γf,nk<input type="number" step="0.01" value={input.gammaFnk} onChange={(e) => set("gammaFnk", +e.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Negatieve kleef</legend>
        <label>Onderkant zone [m NAP]
          <input type="number" step="0.01" value={input.negKleefBottomNap} onChange={(e) => set("negKleefBottomNap", +e.target.value)} />
        </label>
        <label>K0·tan(δ) minimum<input type="number" step="0.01" value={input.ksMinFactor} onChange={(e) => set("ksMinFactor", +e.target.value)} /></label>
      </fieldset>

      <fieldset>
        <legend>Grondprofiel</legend>
        {input.soilProfile.map((layer, index) => <fieldset key={index}>
          <legend>Laag {index + 1}</legend>
          <label>Grondsoort laag {index + 1}<select value={layer.kind} onChange={e => {
            const kind = e.target.value as SoilKind;
            const { gammaK, gammaW, phi } = SOIL_DEFAULTS[kind];
            updateLayer(index, { kind, gammaK, gammaW, phi });
          }}>{Object.entries(SOIL_DEFAULTS).map(([kind, values]) => <option key={kind} value={kind}>{values.label}</option>)}</select></label>
          {(["startNap", "endNap", "gammaK", "gammaW", "phi"] as const).map(key => <label key={key}>
            {({ startNap: "Bovenkant [m NAP]", endNap: "Onderkant [m NAP]", gammaK: "γ [kN/m³]", gammaW: "Wateraandeel [kN/m³]", phi: "φ [°]" })[key]}
            <input aria-label={`${key} laag ${index + 1}`} type="number" step="0.1" value={layer[key]} onChange={e => updateLayer(index, { [key]: +e.target.value })} />
          </label>)}
        </fieldset>)}
      </fieldset>

      <fieldset>
        <legend>Positieve kleef</legend>
        <label>Bovenkant traject [m NAP]
          {/* Default = neg-kleef-ondergrens (pos-kleef begint waar neg-kleef
              ophoudt). Engineer kan dit ONAFHANKELIJK omlaag zetten als er
              een zwakke laag in een tussenstuk zit. Ondergrens van pos-kleef
              is altijd paalpunt (vast). */}
          <input
            type="number"
            step="0.01"
            value={input.posKleefTopNap ?? input.negKleefBottomNap}
            onChange={(e) => set("posKleefTopNap", +e.target.value)}
          />
        </label>
      </fieldset>
    </div>
  );
}
