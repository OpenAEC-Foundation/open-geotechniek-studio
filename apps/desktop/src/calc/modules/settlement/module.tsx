import type { CalcModule, PanelProps } from '../../framework/types';
import { computeSettlement, type SettlementInput, type SettlementResult } from './compute';
import './styles.css';

type Props = PanelProps<SettlementInput, SettlementResult>;
const format = (value: number, digits = 2) => value.toLocaleString('nl-NL', { maximumFractionDigits: digits });
const fields = [
  ['thicknessM', 'Laagdikte', 'H', 'm', 0.1],
  ['stressIncreaseKpa', 'Effectieve spanningstoename', 'Δσ′', 'kPa', 1],
  ['constrainedModulusMpa', 'Samendrukkingsmodulus', 'M', 'MPa', 0.1],
] as const;
const example = { thicknessM: 2, stressIncreaseKpa: 50, constrainedModulusMpa: 5 };
function InputPanel({ input, onChange }: Props) {
  return <div className="settlement-input">
    <div className="settlement-section-heading"><h2>Grondlaag & belasting</h2><span>Invoer</span></div>
    <div className="settlement-fields">
      {fields.map(([key, label, symbol, unit, step]) => <label className="settlement-field" key={key}>
        <span className="settlement-label">{label}<span>{symbol}</span></span>
        <span className="settlement-input-wrap"><input aria-label={`${label} [${unit}]`} type="number" min="0" step={step} value={Number.isFinite(input?.[key]) ? input[key] : ''}
          onChange={(event) => onChange?.({ ...input, [key]: event.target.valueAsNumber })} /><span>{unit}</span></span>
      </label>)}
    </div>
    <p className="settlement-help">Gebruik de oedometer-modulus M voor het beschouwde spanningstraject.</p>
    <button className="settlement-example" type="button" onClick={() => onChange?.(example)}><span aria-hidden="true">↺</span> Controlevoorbeeld laden</button>
  </div>;
}
function VisualPanel({ input, result }: Props) {
  return <section className="settlement-model" aria-label="Schematische grondlaag">
    <div className="settlement-section-heading"><h2>Rekenmodel</h2><span>1D-compressie</span></div>
    {result.ok ? <svg viewBox="0 0 340 230" role="img" aria-label={`Laag van ${format(input.thicknessM)} meter onder ${format(input.stressIncreaseKpa)} kPa; zetting ${format(result.settlementMm)} millimeter`}>
      <defs><pattern id="soil-hatch" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" className="settlement-hatch" /></pattern></defs>
      <text x="145" y="24" textAnchor="middle" className="settlement-svg-label">Δσ′ = {format(input.stressIncreaseKpa)} kPa</text>
      {[55,100,145,190,235].map((x) => <g key={x} className="settlement-load"><path d={`M${x} 38v30m-4-5 4 5 4-5`} /></g>)}
      <rect x="30" y="82" width="230" height="100" className="settlement-soil" />
      <rect x="30" y="82" width="230" height="100" fill="url(#soil-hatch)" />
      <path d="M30 82h230" className="settlement-surface" />
      <path d="M30 96h230" className="settlement-displaced" />
      <rect x="94" y="122" width="102" height="24" className="settlement-label-bg" />
      <text x="145" y="138" textAnchor="middle" className="settlement-svg-label">M = {format(input.constrainedModulusMpa)} MPa</text>
      <path d="M274 82h8m-4 0v100m-4 0h8" className="settlement-dimension" />
      <text x="292" y="127" className="settlement-svg-muted">H</text><text x="292" y="144" className="settlement-svg-label">{format(input.thicknessM)} m</text>
      <text x="145" y="212" textAnchor="middle" className="settlement-svg-muted">Homogene laag · zijdelings opgesloten</text>
    </svg> : <p className="settlement-help">Vul geldige waarden in om het grondmodel te tonen.</p>}
  </section>;
}
function ResultPanel({ input, result }: Props) {
  return <div className="settlement-result">
    <div className="settlement-section-heading"><h2>Resultaat</h2><span>Eindzetting</span></div>
    {result.ok ? <>
      <div className="settlement-total"><span>Verticale zetting</span><output><strong>{format(result.settlementMm)}</strong><span>mm</span></output><p>Rek ε = {format(result.strain * 100, 4)}%</p></div>
      <section className="settlement-working"><h3>Berekening</h3>
        <div className="settlement-formula">s = H · Δσ′ / M</div>
        <dl><div><dt>Modulus naar kPa</dt><dd>{format(input.constrainedModulusMpa)} × 1.000 = {format(input.constrainedModulusMpa * 1000)} kPa</dd></div>
          <div><dt>Verticale rek</dt><dd>{format(input.stressIncreaseKpa)} / {format(input.constrainedModulusMpa * 1000)} = {format(result.strain, 6)}</dd></div>
          <div><dt>Zetting</dt><dd>{format(input.thicknessM)} × {format(result.strain, 6)} × 1.000 = <strong>{format(result.settlementMm)} mm</strong></dd></div></dl>
      </section>
      {result.warning && <p className="settlement-warning" role="alert">{result.warning}</p>}
    </> : <div className="settlement-error" role="alert"><h3>Controleer de invoer</h3><p>{result.error}</p></div>}
    <section className="settlement-assumptions"><h3>Uitgangspunten</h3><ul><li>Eén homogene, zijdelings opgesloten laag.</li><li>Constante modulus en uniforme effectieve spanningstoename.</li><li>Eindzetting na drainage; geen tijdsverloop of kruip.</li></ul></section>
    <details className="settlement-reference"><summary>Methode & controlevoorbeeld</summary><p>Lineaire 1D-compressie volgens USACE EM 1110-1-1905 (31 juli 2025), §7–7. Geen normtoets of nationale bijlage; geen partiële factoren toegepast (factoren 1,0). M is de samendrukkingsmodulus, niet de elasticiteitsmodulus E.</p><p>Controle: 2 m × 50 kPa / 5.000 kPa = 0,020 m = 20 mm.</p></details>
  </div>;
}
const module: CalcModule<SettlementInput, SettlementResult> = {
  id: 'settlement', name: 'Zetting van één laag', subtitle: 'Eendimensionale zetting met een constante samendrukkingsmodulus',
  category: 'spread', icon: '↓', norm: '1D-compressie · USACE EM 1110-1-1905 (2025), §7–7',
  status: 'experimental', defaultInput: () => ({ ...example }),
  compute: computeSettlement, InputPanel, VisualPanel, ResultPanel,
  statusLine: (result) => ({ text: result.ok ? `${format(result.settlementMm)} mm zetting` : result.error, ok: result.ok }),
};
export const settlementModule = module as unknown as CalcModule;
