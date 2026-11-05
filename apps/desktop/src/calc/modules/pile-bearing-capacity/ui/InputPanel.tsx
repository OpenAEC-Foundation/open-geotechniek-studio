// apps/desktop/src/calc/modules/pile-bearing-capacity/ui/InputPanel.tsx
//
// Invoerscherm in rekenblad-stijl: per onderwerp een sectie met een
// kopje, daaronder rijen met het label links en de invoer plus eenheid
// rechts. Keuzes die je visueel herkent (materiaal) staan als tegels.
import { useEffect, useRef, type ChangeEvent, type ReactNode } from "react";
import { useCptStore } from "../../../../store/useCptStore";
import { PILE_TYPE_CATALOG, SOIL_DEFAULTS, resolvePileType } from "../catalog";
import type { ConcreteExtension, PileInput, PileResult, PileTypeSpec, SoilKind, SoilLayer } from "../types";
import { woodTopNap } from "../parts/geometry";
import { EXTENSION_LENGTHS_M, EXTENSION_PRESETS, STEEL_TUBE_OD, TIMBER_HEAD, TIMBER_TOE_MM, nearest, sizeText } from "../standard-sizes";
import { PILE_STANDARDS, applyStandard, changeStandard, getStandard, usesHistoricalProcedure, type PileStandard } from "../standards";
import { Hint, Row, Section } from "../../../framework/views/SheetForm";
import "./styles.css";

interface Props {
  input: PileInput;
  result: PileResult;
  onChange?: (next: PileInput) => void;
}

type Material = NonNullable<PileTypeSpec["material"]>;

const MATERIALS: { id: Material; label: string; icon: ReactNode }[] = [
  {
    id: "concrete", label: "Beton",
    icon: <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="10" y="3" width="12" height="22" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.5" /><path d="M10 25l6 5 6-5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M10 9l12 6M10 15l12 6" stroke="currentColor" strokeWidth=".8" opacity=".6" /></svg>,
  },
  {
    id: "steel", label: "Staal",
    icon: <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="11" y="3" width="10" height="24" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="13" y="3" width="6" height="24" fill="currentColor" opacity=".12" /><path d="M11 27h10" stroke="currentColor" strokeWidth="3" /></svg>,
  },
  {
    id: "wood", label: "Hout",
    icon: <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 3h14l-3 25h-8z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M14 6l1 19M18 6l-1 19" stroke="currentColor" strokeWidth=".8" opacity=".6" /></svg>,
  },
];

const materialOf = (p: PileTypeSpec | undefined): Material => p?.material ?? "steel";

/** Standaard betonopzetter voor een houten paal: rond Ø280, met de kortste
 *  gangbare lengte (1,5 / 2 / 2,5 / 4 m) waarbij de las minstens 0,5 m onder
 *  de grondwaterstand komt, zodat het hout permanent nat blijft. */
function defaultExtension(input: PileInput): ConcreteExtension {
  const length = EXTENSION_LENGTHS_M.find((l) => input.pileTopNap - l <= input.waterNap - 0.5) ?? EXTENSION_LENGTHS_M[EXTENSION_LENGTHS_M.length - 1];
  const joint = Math.max(input.pileToeNap + 1, input.pileTopNap - length);
  return { jointNap: +joint.toFixed(2), sizeMm: 280, isCircular: true };
}

/** Niveau in m NAP op mm afgerond voor weergave: rekenen met
 *  standaardwaarden geeft anders ruis als 0.339999999. */
const mm = (v: number) => (Number.isFinite(v) ? +v.toFixed(3) : v);

export function InputPanel({ input, onChange }: Props) {
  const cpts = useCptStore((s) => s.cpts);
  const pileType = resolvePileType(input);
  const material = materialOf(pileType);
  const set = <K extends keyof PileInput>(key: K, value: PileInput[K]) => {
    if (!onChange) return;
    onChange({ ...input, [key]: value });
  };
  const num = (key: keyof PileInput) => (e: ChangeEvent<HTMLInputElement>) => set(key, +e.target.value as never);
  const updateLayer = (index: number, patch: Partial<SoilLayer>) => set("soilProfile", input.soilProfile.map((layer, i) => i === index ? { ...layer, ...patch } : layer));
  // Een ander paaltype erft geen projectfactoren, voetmaat, EA of
  // tapsheid van het vorige: die horen bij één paalsysteem.
  const changeType = (pileTypeId: string) => {
    // Een houten paal krijgt standaard een betonopzetter; andere palen nooit.
    const nextMaterial = materialOf(PILE_TYPE_CATALOG.find((p) => p.id === pileTypeId)), wood = nextMaterial === "wood";
    // Houten paal: gangbare kopmaat, punt Ø150 over het hele houten deel. Staal: maat uit de buisreeks.
    const diameterMm = wood ? (TIMBER_HEAD.includes(input.diameterMm) ? input.diameterMm : 220)
      : nextMaterial === "steel" ? nearest(STEEL_TUBE_OD, input.diameterMm) : input.diameterMm;
    const extension = wood ? defaultExtension(input) : undefined;
    const woodTop = extension?.jointNap ?? input.pileTopNap;
    const timberTaper = wood ? { toeDiameterMm: TIMBER_TOE_MM, lengthM: +(woodTop - input.pileToeNap).toFixed(2) } : undefined;
    onChange?.({ ...input, pileTypeId, diameterMm, projectFactors: undefined, axialStiffnessKn: undefined, baseDiameterMm: undefined, timberTaper, concreteExtension: extension });
  };
  const ext = input.concreteExtension;
  const woodLength = woodTopNap(input) - input.pileToeNap;
  const toggleExtension = (on: boolean) => {
    const next = on ? defaultExtension(input) : undefined;
    const woodTop = next?.jointNap ?? input.pileTopNap;
    // Een bestaande tapsheid moet binnen het (nieuwe) houten deel blijven.
    const timberTaper = input.timberTaper && { ...input.timberTaper, lengthM: Math.min(input.timberTaper.lengthM, +(woodTop - input.pileToeNap).toFixed(2)) };
    onChange?.({ ...input, concreteExtension: next, timberTaper });
  };
  const setExt = (patch: Partial<ConcreteExtension>) => { if (ext) set("concreteExtension", { ...ext, ...patch }); };
  const allowed = (p: PileTypeSpec) => !!applyStandard(p, input.standard);
  const pickMaterial = (m: Material) => {
    if (m === material) return;
    const first = PILE_TYPE_CATALOG.find((p) => materialOf(p) === m && allowed(p));
    if (first) changeType(first.id);
  };
  const needsEA = !!pileType?.requiresEA && !input.timberTaper && !ext && input.axialStiffnessKn === undefined;
  // Kies je een paaltype dat EA vereist, dan staat de cursor meteen in dat
  // veld: anders rest alleen een melding in de uitdraai.
  const eaRef = useRef<HTMLInputElement>(null);
  const prevType = useRef(input.pileTypeId);
  useEffect(() => {
    if (prevType.current !== input.pileTypeId && needsEA) eaRef.current?.focus();
    prevType.current = input.pileTypeId;
  }, [input.pileTypeId, needsEA]);
  const sizeLabel = ext ? "Houtdiameter bij de las" : input.timberTaper ? "Kopdiameter" : pileType?.isCircular === false ? "Zijlengte" : "Diameter";
  // Het standaardprofiel wordt eenmalig tot de begin-paalpunt opgebouwd en
  // groeit niet mee: zet je de paal dieper, dan telt het stuk zonder laag
  // stil niet mee in de schachtwrijving.
  const profileBottom = input.soilProfile.length ? Math.min(...input.soilProfile.map((l) => Math.min(l.startNap, l.endNap))) : null;
  const profileTooShallow = profileBottom !== null && profileBottom > input.pileToeNap + 0.005;

  return (
    <div className="pile-input cs-form">
      <Section title="Rekennorm">
        <Row label="Normversie">
          <select aria-label="Normversie" title={getStandard(input.standard)?.label ?? "Bestaand projectmodel — ongewijzigd"} value={input.standard ?? ""} onChange={e => onChange?.(e.target.value ? changeStandard(input, e.target.value as PileStandard) : { ...input, standard: undefined })}>
            <option value="">Bestaand projectmodel — ongewijzigd</option>
            {PILE_STANDARDS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Row>
        {usesHistoricalProcedure(input.standard) && <Hint>Historische drukberekening voor één paal bij één sondering. Positieve schachtwrijving in zand, constante doorsnede of expliciete houttapsheid; zakking en paalgroepen zijn niet geverifieerd. Bij normwissel worden projectfactoren gewist en γm opnieuw ingesteld.</Hint>}
      </Section>

      <Section title="Sondering">
        <Row label="Sondering">
          <select aria-label="Sondering" value={input.cptId ?? ""} onChange={(e) => set("cptId", e.target.value || null)}>
            <option value="">— kies sondering —</option>
            {Array.from(cpts.values()).map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
        </Row>
      </Section>

      <Section title="Paal">
        <div className="cs-tiles" role="radiogroup" aria-label="Materiaal">
          {MATERIALS.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={material === m.id}
              className={`cs-tile${material === m.id ? " active" : ""}`}
              disabled={!PILE_TYPE_CATALOG.some((p) => materialOf(p) === m.id && allowed(p))}
              onClick={() => pickMaterial(m.id)}>
              {m.icon}<span>{m.label}</span>
            </button>
          ))}
        </div>
        <Row label="Paaltype">
          <select aria-label="Paaltype" title={pileType ? applyStandard(pileType, input.standard)?.name ?? pileType.name : undefined} value={input.pileTypeId} onChange={(e) => changeType(e.target.value)}>
            {MATERIALS.map((m) => (
              <optgroup key={m.id} label={m.label}>
                {PILE_TYPE_CATALOG.filter((p) => materialOf(p) === m.id).map((p) => (
                  <option key={p.id} value={p.id} disabled={!allowed(p)}>{applyStandard(p, input.standard)?.name ?? p.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </Row>
        {material === "steel" && (
          <Row label="Buismaat">
            <select aria-label="Buismaat" value={STEEL_TUBE_OD.includes(input.diameterMm) ? String(input.diameterMm) : ""} onChange={(e) => e.target.value && set("diameterMm", Number(e.target.value))}>
              {!STEEL_TUBE_OD.includes(input.diameterMm) && <option value="">Eigen maat</option>}
              {STEEL_TUBE_OD.map((d) => <option key={d} value={d}>Ø{sizeText(d)} mm</option>)}
            </select>
          </Row>
        )}
        <Row label={sizeLabel} unit="mm">
          <input aria-label={`${sizeLabel} [mm]`} type="number" min="1" step="any" value={input.diameterMm} onChange={num("diameterMm")} />
        </Row>
        {pileType?.material === "wood" && <>
          <label className="cs-check">
            <input type="checkbox" checked={!!ext} onChange={e => toggleExtension(e.target.checked)} />
            Betonopzetter
          </label>
          {ext && <div className="cs-subgroup">
            <Row label="Las (onderkant opzetter)" unit="m NAP">
              <input aria-label="Las [m NAP]" type="number" step="0.05" value={mm(ext.jointNap)} onChange={e => setExt({ jointNap: +e.target.value })} />
            </Row>
            <Row label="Opzetter">
              <select aria-label="Opzetter" value={EXTENSION_PRESETS.find((p) => p.sizeMm === ext.sizeMm && p.isCircular === ext.isCircular)?.id ?? "eigen"}
                onChange={e => { const p = EXTENSION_PRESETS.find((x) => x.id === e.target.value); if (p) setExt({ sizeMm: p.sizeMm, isCircular: p.isCircular }); }}>
                {EXTENSION_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                <option value="eigen">Eigen maat</option>
              </select>
            </Row>
            <Row label="Lengte opzetter" unit="m">
              <select aria-label="Lengte opzetter [m]" value={EXTENSION_LENGTHS_M.find((l) => Math.abs(input.pileTopNap - l - ext.jointNap) < 0.005)?.toString() ?? "eigen"}
                onChange={e => { const l = Number(e.target.value); if (Number.isFinite(l)) { const jointNap = +(input.pileTopNap - l).toFixed(2); const woodLen = +(jointNap - input.pileToeNap).toFixed(2);
                  onChange?.({ ...input, concreteExtension: { ...ext, jointNap }, timberTaper: input.timberTaper && { ...input.timberTaper, lengthM: Math.min(input.timberTaper.lengthM, woodLen) } }); } }}>
                {EXTENSION_LENGTHS_M.map((l) => <option key={l} value={l}>{sizeText(l)} m</option>)}
                <option value="eigen">Eigen las</option>
              </select>
            </Row>
            {!EXTENSION_PRESETS.some((p) => p.sizeMm === ext.sizeMm && p.isCircular === ext.isCircular) && <>
              <Row label="Vorm">
                <select aria-label="Vorm opzetter" value={ext.isCircular ? "rond" : "vierkant"} onChange={e => setExt({ isCircular: e.target.value === "rond" })}>
                  <option value="vierkant">Vierkant</option>
                  <option value="rond">Rond</option>
                </select>
              </Row>
              <Row label={ext.isCircular ? "Diameter opzetter" : "Zijde opzetter"} unit="mm">
                <input aria-label="Maat opzetter [mm]" type="number" min="1" value={ext.sizeMm} onChange={e => setExt({ sizeMm: +e.target.value })} />
              </Row>
            </>}
            {ext.jointNap > input.waterNap - 0.5 + 1e-9 && <Hint warn>De las ligt minder dan 0,5 m onder de grondwaterstand (NAP {mm(input.waterNap)}): het hout blijft daar niet permanent nat. Kies een langere opzetter.</Hint>}
            <Hint>Boven de las rekent de omtrek van de opzetter, eronder die van het hout.</Hint>
          </div>}
          <label className="cs-check">
            <input type="checkbox" checked={!!input.timberTaper} onChange={e => onChange?.({ ...input, baseDiameterMm: undefined, timberTaper: e.target.checked ? { toeDiameterMm: input.diameterMm, lengthM: +woodLength.toFixed(2) } : undefined })} />
            Tapse houten paal
          </label>
        </>}
        {input.timberTaper ? <>
          <Row label="Puntdiameter" unit="mm">
            <input aria-label="Puntdiameter hout [mm]" type="number" min="1" max={input.diameterMm} value={input.timberTaper.toeDiameterMm} onChange={e => set("timberTaper", { ...input.timberTaper!, toeDiameterMm: +e.target.value })} />
          </Row>
          <Row label={ext ? "Tapse lengte vanaf de las" : "Tapse lengte vanaf kop"} unit="m">
            <input aria-label={ext ? "Tapse lengte vanaf de las [m]" : "Tapse lengte vanaf kop [m]"} type="number" min="0.01" step="0.1" max={woodLength} value={input.timberTaper.lengthM} onChange={e => set("timberTaper", { ...input.timberTaper!, lengthM: +e.target.value })} />
          </Row>
          <Hint>De houtdiameter neemt lineair af vanaf {ext ? "de las" : "de kop"}; onder het tapse deel blijft de puntdiameter constant. De kleefomtrek volgt het gekozen traject; zakking en veerwaarden worden niet bepaald.</Hint>
        </> : !ext && (
          <Row label="Puntafmeting" unit="mm">
            <input aria-label="Puntafmeting [mm] (leeg = schacht)" type="number" min="1" placeholder="schacht" value={input.baseDiameterMm ?? ""} onChange={(e) => set("baseDiameterMm", e.target.value === "" ? undefined : +e.target.value)} />
          </Row>
        )}
        {pileType?.material === "steel" && !pileType.requiresEA && (
          <Row label="Wanddikte" unit="mm">
            <input aria-label="Wanddikte [mm]" type="number" min="0.1" step="0.1" value={input.wallThicknessMm} onChange={num("wallThicknessMm")} />
          </Row>
        )}
        {!input.timberTaper && !ext && (
          <Row label={<>Axiale stijfheid EA{pileType?.requiresEA && <span className="cs-required"> · verplicht</span>}</>} unit="kN"
            missing={needsEA ? "Vereist voor dit paaltype — zonder EA wordt er niet gerekend." : undefined}>
            <input ref={eaRef} aria-invalid={needsEA || undefined} aria-label={`Axiale stijfheid EA [kN]${pileType?.requiresEA ? " (verplicht)" : " (optioneel)"}`} type="number" min="1" placeholder={pileType?.requiresEA ? "" : "optioneel"} value={input.axialStiffnessKn ?? ""} onChange={(e) => set("axialStiffnessKn", e.target.value === "" ? undefined : +e.target.value)} />
          </Row>
        )}
        {pileType?.conditions && <Hint>{pileType.conditions}</Hint>}
      </Section>

      <Section title="Paalniveaus">
        <Row label="Paalkop" unit="m NAP"><input aria-label="Paalkop [m NAP]" type="number" step="0.01" value={mm(input.pileTopNap)} onChange={num("pileTopNap")} /></Row>
        <Row label="Paalpunt" unit="m NAP"><input aria-label="Paalpunt [m NAP]" type="number" step="0.01" value={mm(input.pileToeNap)} onChange={num("pileToeNap")} /></Row>
        <Row label="Grondwater" unit="m NAP"><input aria-label="Grondwater [m NAP]" type="number" step="0.01" value={mm(input.waterNap)} onChange={num("waterNap")} /></Row>
        <Row label="Ontgraving" unit="m NAP"><input aria-label="Ontgraving [m NAP]" type="number" step="0.01" value={mm(input.excavationNap)} onChange={num("excavationNap")} /></Row>
      </Section>

      <Section title="Belasting">
        <Row label={<>N<sub>Ed</sub> ontwerpbelasting</>} unit="kN"><input aria-label="NEd [kN]" type="number" value={input.nEd} onChange={num("nEd")} /></Row>
        <Row label={<>N<sub>Ek</sub> karakteristiek</>} unit="kN"><input aria-label="NEk [kN]" type="number" value={input.nEk} onChange={num("nEk")} /></Row>
        <Row label={<>γ<sub>m</sub> materiaalfactor</>}><input aria-label="γm" type="number" step="0.01" value={input.gammaM} onChange={num("gammaM")} /></Row>
        <Row label={<>γ<sub>f,nk</sub> negatieve kleef</>}><input aria-label="γf,nk" type="number" step="0.01" value={input.gammaFnk} onChange={num("gammaFnk")} /></Row>
      </Section>

      <Section title="Kleefzones">
        <Row label="Onderkant negatieve kleef" unit="m NAP"><input aria-label="Onderkant negatieve kleef [m NAP]" type="number" step="0.01" value={mm(input.negKleefBottomNap)} onChange={num("negKleefBottomNap")} /></Row>
        {/* Standaard begint positieve kleef waar negatieve kleef ophoudt;
            los te verlagen als er een zwakke tussenlaag zit. De onderkant
            is altijd de paalpunt. */}
        <Row label="Bovenkant positieve kleef" unit="m NAP"><input aria-label="Bovenkant positieve kleef [m NAP]" type="number" step="0.01" value={mm(input.posKleefTopNap ?? input.negKleefBottomNap)} onChange={num("posKleefTopNap")} /></Row>
        <Row label={<>K<sub>0</sub>·tan δ minimum</>}><input aria-label="K0·tan(δ) minimum" type="number" step="0.01" value={input.ksMinFactor} onChange={num("ksMinFactor")} /></Row>
        <Hint>Paalniveaus en kleefzones zijn ook te verslepen in de sondering.</Hint>
      </Section>

      <Section title="Grondprofiel">
        {profileTooShallow && <p className="cs-hint cs-hint--warn" role="status">Het grondprofiel stopt op NAP {profileBottom!.toFixed(2)} m, boven de paalpunt op NAP {input.pileToeNap.toFixed(2)} m. Over dat stuk telt geen schachtwrijving mee; verleng de onderste laag.</p>}
        <div className="cs-table-wrap">
          <table className="cs-layer-table">
            <thead>
              <tr>
                <th>#</th><th>Grondsoort</th>
                <th>Boven<small>m NAP</small></th><th>Onder<small>m NAP</small></th>
                <th>γ<small>kN/m³</small></th><th>γ<sub>w</sub><small>kN/m³</small></th><th>φ<small>°</small></th>
              </tr>
            </thead>
            <tbody>
              {input.soilProfile.map((layer, index) => (
                <tr key={index}>
                  <td className="cs-layer-index">{index + 1}</td>
                  <td>
                    <select aria-label={`Grondsoort laag ${index + 1}`} value={layer.kind} onChange={e => {
                      const kind = e.target.value as SoilKind;
                      const { gammaK, gammaW, phi } = SOIL_DEFAULTS[kind];
                      updateLayer(index, { kind, gammaK, gammaW, phi });
                    }}>{Object.entries(SOIL_DEFAULTS).map(([kind, values]) => <option key={kind} value={kind}>{values.label}</option>)}</select>
                  </td>
                  {(["startNap", "endNap", "gammaK", "gammaW", "phi"] as const).map(key => (
                    <td key={key}><input aria-label={`${key} laag ${index + 1}`} type="number" step="0.1" value={layer[key]} onChange={e => updateLayer(index, { [key]: +e.target.value })} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Paalfactoren">
        <dl className="cs-factors">
          <div><dt>α<sub>p</sub></dt><dd>{pileType?.alphaP ?? "—"}</dd></div>
          <div><dt>α<sub>s</sub></dt><dd>{pileType?.alphaS ?? "—"}</dd></div>
          <div><dt>β</dt><dd>{pileType?.beta ?? "—"}</dd></div>
          <div><dt>s</dt><dd>{pileType?.s ?? "—"}</dd></div>
        </dl>
        <Hint>Normbasis: {pileType?.edition}. {pileType?.source}</Hint>
        <label className="cs-check">
          <input type="checkbox" checked={!!input.projectFactors} onChange={(e) => set("projectFactors", e.target.checked && pileType ? {
            alphaP: pileType.alphaP, alphaS: pileType.alphaS, alphaT: pileType.alphaT, beta: pileType.beta, s: pileType.s, source: "", edition: getStandard(input.standard)?.edition ?? "2017",
          } : undefined)} />
          Projectfactoren / zelfverklaring gebruiken
        </label>
        {input.projectFactors && <>
          <Row label="Editie">
            <select aria-label="Editie" value={input.projectFactors.edition} onChange={(e) => set("projectFactors", { ...input.projectFactors!, edition: e.target.value })}>
              {usesHistoricalProcedure(input.standard)
                ? <option value={getStandard(input.standard)?.edition}>{getStandard(input.standard)?.edition}</option>
                : <><option value="2017">2017</option><option value="2025">2025 — projectfactoren</option></>}
            </select>
          </Row>
          <Row label="Bron / verklaring"><input aria-label="Bron / verklaring" value={input.projectFactors.source} onChange={(e) => set("projectFactors", { ...input.projectFactors!, source: e.target.value })} /></Row>
          {(["alphaP", "alphaS", "alphaT", "beta", "s"] as const).map((key) => {
            const label = ({ alphaP: "αp", alphaS: "αs", alphaT: "αt (geen trekcontrole)", beta: "β", s: "s" })[key];
            return <Row key={key} label={label}><input aria-label={label} type="number" min="0" step="0.001" value={input.projectFactors![key]} onChange={(e) => set("projectFactors", { ...input.projectFactors!, [key]: +e.target.value })} /></Row>;
          })}
          <Hint>De bron moet passen bij paalsysteem, uitvoering en afmetingen. Factoren uit 2025 maken de volledige rekenmethode niet automatisch conform 2025.</Hint>
        </>}
      </Section>
    </div>
  );
}
