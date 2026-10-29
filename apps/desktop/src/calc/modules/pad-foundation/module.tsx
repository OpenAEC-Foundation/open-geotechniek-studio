import type { CalcModule, PanelProps } from "../../framework/types";
import {
  computePad,
  padExample,
  type PadInput,
  type PadResult,
} from "./compute";
import "../settlement/styles.css";
type Props = PanelProps<PadInput, PadResult>;
const f = (value: number, digits = 2) =>
  value.toLocaleString("nl-NL", { maximumFractionDigits: digits });
const groups = [
  {
    title: "Poer & belasting",
    fields: [
      ["widthM", "Poermaat 1", "B", "m", 0.1],
      ["lengthM", "Poermaat 2", "L", "m", 0.1],
      ["verticalDesignLoadKn", "Verticale ontwerpbelasting", "Vd", "kN", 10],
    ],
  },
  {
    title: "Ontwerpwaarden grond",
    fields: [
      ["frictionDesignDeg", "Effectieve wrijvingshoek", "φ′d", "°", 1],
      ["cohesionDesignKpa", "Effectieve cohesie", "c′d", "kPa", 1],
      [
        "surchargeDesignKpa",
        "Effectieve spanning naast de zool",
        "q′d",
        "kPa",
        1,
      ],
      [
        "effectiveUnitWeightKnM3",
        "Effectief volumegewicht onder de zool",
        "γ′d",
        "kN/m³",
        0.1,
      ],
    ],
  },
  {
    title: "Weerstandsfactor",
    fields: [
      [
        "resistanceFactor",
        "Projectwaarde volgens gekozen aanpak / NB",
        "γR;v",
        "—",
        0.1,
      ],
    ],
  },
] as const;
function InputPanel({ input, onChange }: Props) {
  return (
    <div className="settlement-input pad-input">
      {groups.map((group) => (
        <section key={group.title}>
          <div className="settlement-section-heading">
            <h2>{group.title}</h2>
            <span>Invoer</span>
          </div>
          <div className="settlement-fields">
            {group.fields.map(([key, label, symbol, unit, step]) => (
              <label className="settlement-field" key={key}>
                <span className="settlement-label">
                  {label}
                  <span>{symbol}</span>
                </span>
                <span className="settlement-input-wrap">
                  <input
                    type="number"
                    aria-label={`${label} [${unit}]`}
                    min="0"
                    max={key === "frictionDesignDeg" ? 45 : undefined}
                    step={step}
                    value={Number.isFinite(input[key]) ? input[key] : ""}
                    onChange={(e) =>
                      onChange?.({ ...input, [key]: e.target.valueAsNumber })
                    }
                  />
                  <span>{unit}</span>
                </span>
              </label>
            ))}
          </div>
        </section>
      ))}
      <p className="settlement-help">
        Geen automatisch Nederlands factorenprofiel. Kies ontwerpwaarden en γR;v
        volgens de projectaanpak en nationale bijlage; 1,4 hoort bij het
        controlevoorbeeld.
      </p>
      <p className="settlement-help">
        Vd omvat poergewicht en gronddek. φ′d en c′d zijn al gefactoreerde
        ontwerpwaarden. Verwerk grondwater in q′d en γ′d.
      </p>
      <button
        className="settlement-example"
        onClick={() => onChange?.({ ...padExample })}
      >
        Controlevoorbeeld laden
      </button>
    </div>
  );
}
function VisualPanel({ input, result }: Props) {
  return (
    <section className="settlement-model">
      <div className="settlement-section-heading">
        <h2>Rekenmodel</h2>
        <span>Centrische belasting</span>
      </div>
      {result.ok ? (
        <svg
          viewBox="0 0 340 230"
          role="img"
          aria-label={`Poer ${f(result.widthM)} bij ${f(result.lengthM)} meter met ${f(input.verticalDesignLoadKn)} kN verticale ontwerpbelasting`}
        >
          <path d="M170 32v42m-6-8 6 8 6-8" className="settlement-load" />
          <text
            x="170"
            y="22"
            textAnchor="middle"
            className="settlement-svg-label"
          >
            Vd = {f(input.verticalDesignLoadKn)} kN
          </text>
          <rect
            x="65"
            y="85"
            width="210"
            height="100"
            className="settlement-soil"
          />
          <path d="M65 85h210" className="settlement-surface" />
          <text
            x="170"
            y="131"
            textAnchor="middle"
            className="settlement-svg-label"
          >
            A = {f(result.areaM2)} m²
          </text>
          <text
            x="170"
            y="151"
            textAnchor="middle"
            className="settlement-svg-muted"
          >
            B = {f(result.widthM)} m · L = {f(result.lengthM)} m
          </text>
          <text
            x="170"
            y="212"
            textAnchor="middle"
            className="settlement-svg-muted"
          >
            Bovenaanzicht · horizontale funderingszool
          </text>
        </svg>
      ) : (
        <p className="settlement-help">Vul geldige ontwerpwaarden in.</p>
      )}
    </section>
  );
}
function ResultPanel({ input, result }: Props) {
  return (
    <div className="settlement-result">
      <div className="settlement-section-heading">
        <h2>Draagkracht</h2>
        <span>GEO · Annex D</span>
      </div>
      {result.ok ? (
        <>
          <div className="settlement-total">
            <span>Verticale ontwerpweerstand Rd</span>
            <output>
              <strong>{f(result.resistanceKn, 1)}</strong>
              <span>kN</span>
            </output>
            <p>
              Vd / Rd = {f(result.utilization, 3)} ·{" "}
              {result.passes ? "Vd ≤ Rd" : "Vd > Rd"}
            </p>
          </div>
          <p className="settlement-help">
            {result.passes
              ? "Draagkrachtcriterium binnen dit rekenmodel gehaald."
              : "Draagkrachtcriterium binnen dit rekenmodel overschreden."}{" "}
            Dit resultaat is een deelcontrole.
          </p>
          <section className="settlement-working">
            <h3>Berekening</h3>
            <div className="settlement-formula">
              Rd = A · (c′d Nc sc + q′d Nq sq + ½ γ′d B Nγ sγ) / γR;v
            </div>
            <dl>
              <div>
                <dt>Effectief oppervlak A = B × L</dt>
                <dd>
                  {f(result.widthM)} × {f(result.lengthM)} = {f(result.areaM2)}{" "}
                  m²
                </dd>
              </div>
              <div>
                <dt>Draagkrachtfactoren Nc / Nq / Nγ</dt>
                <dd>
                  {f(result.nc, 3)} / {f(result.nq, 3)} / {f(result.ngamma, 3)}
                </dd>
              </div>
              <div>
                <dt>Vormfactoren sc / sq / sγ</dt>
                <dd>
                  {f(result.sc, 3)} / {f(result.sq, 3)} / {f(result.sgamma, 3)}
                </dd>
              </div>
              <div>
                <dt>Cohesie / dekspanning / eigengewicht</dt>
                <dd>
                  {f(result.cohesionTermKpa)} + {f(result.surchargeTermKpa)} +{" "}
                  {f(result.weightTermKpa)} kPa
                </dd>
              </div>
              <div>
                <dt>Ontwerpweerstand per m²</dt>
                <dd>
                  {f(result.resistancePressureKpa)} kPa (γR;v ={" "}
                  {f(input.resistanceFactor)})
                </dd>
              </div>
              <div>
                <dt>Ontwerpcontactspanning Vd / A</dt>
                <dd>{f(result.appliedPressureKpa)} kPa</dd>
              </div>
            </dl>
          </section>
          {result.rotated && (
            <p className="settlement-help">
              B is de kleinste poermaat; de rechthoek is voor de vormfactoren
              gedraaid.
            </p>
          )}
        </>
      ) : (
        <div className="settlement-error" role="alert">
          <h3>Controleer de invoer</h3>
          <p>{result.error}</p>
        </div>
      )}
      <section className="settlement-assumptions">
        <h3>Toepassingsgebied</h3>
        <ul>
          <li>Gedraineerde, homogene grond en horizontaal maaiveld.</li>
          <li>
            Rechthoekige, horizontale zool; centrische verticale drukbelasting.
          </li>
          <li>
            Geen momenten of horizontale krachten; b- en i-factoren zijn 1.
          </li>
          <li>
            Zetting, glijden, algemene stabiliteit, pons en wapening
            afzonderlijk beoordelen.
          </li>
        </ul>
      </section>
      <details className="settlement-reference">
        <summary>Normbasis & factoren</summary>
        <p>
          EN 1997-1, informatieve bijlage D (gedraineerde analytische
          draagkracht); gecontroleerd aan de openbare JRC-uitwerking EUR 26227
          EN (2013), §3.3.1, blz. 22–24.
        </p>
        <p>
          Nederlandse norm: NEN 9997-1:2025+C1:2025 omvat EC7 en nationale
          bijlage. Dit conceptwerkblad kiest geen Nederlandse factoren
          automatisch. Belastingen en grondparameters worden als ontwerpwaarden
          ingevoerd; γR;v is expliciete projectinvoer. Het controlevoorbeeld
          gebruikt 1,4 als voorbeeldwaarde, geen Nederlandse
          standaardinstelling.
        </p>
        <a
          href="https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/2013_06_WS_GEO.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Openbare EC7-uitwerking (JRC)
        </a>
      </details>
    </div>
  );
}
export const padFoundationModule = {
  id: "pad-foundation",
  name: "Poer op staal",
  subtitle:
    "Gedraineerde draagkracht van een centrisch belaste rechthoekige poer",
  category: "spread",
  icon: "▰",
  norm: "EN 1997-1 · Annex D · ontwerpwaarden als invoer",
  status: "experimental",
  defaultInput: () => ({ ...padExample }),
  compute: computePad,
  InputPanel,
  VisualPanel,
  ResultPanel,
  statusLine: (r: PadResult) => ({
    text: r.ok ? `Vd/Rd = ${f(r.utilization, 3)}` : r.error,
    ok: r.ok && r.passes,
  }),
} as unknown as CalcModule;
