import type { LateralInput } from './compute';
import type { AnalysisMode, SpringState } from './spring-types';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';

const f = (value: number, digits = 2) => value.toLocaleString(numberLocale(), { maximumFractionDigits: digits });

/** Mobilisatie |p| / pu; null bij een lineaire veer zonder grens. */
export function mobilisation(s: SpringState): number | null {
  return s.ultimateKnM && s.ultimateKnM > 0 ? Math.abs(s.resistanceKnM) / s.ultimateKnM : null;
}

/** Klassen voor de kleur: rustig, opgelopen, bijna plastisch. */
export function mobilisationClass(m: number | null): 'linear' | 'low' | 'mid' | 'high' {
  if (m === null) return 'linear';
  return m >= 0.9 ? 'high' : m >= 0.5 ? 'mid' : 'low';
}

interface Props {
  input: LateralInput;
  springs: SpringState[];
  mode: AnalysisMode;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
}

/**
 * Het hele veerveld langs de paal in één beeld. Per integratiepunt:
 * - balk: omtrek = beginstijfheid k₀, gevuld deel = secantstijfheid bij de
 *   werkbelasting; kleur = mobilisatie p/pu;
 * - gemobiliseerde weerstand p tegen de grensweerstand pu;
 * - mobilisatie p/pu met een 90 %-lijn waarboven de grond vrijwel plastisch is.
 */
export function SpringField({ input, springs, mode, selectedId, onSelect }: Props) {
  const { t } = useTranslation('calcLateral');
  if (springs.length === 0) return <p>{t('spring.none', 'Geen actieve grondveren in dit model.')}</p>;
  const L = input.lengthM;
  const depth = (z: number) => 70 + 500 * z / L;
  const kMax = Math.max(1e-12, ...springs.map((s) => s.initialKnM2));
  const pMax = Math.max(1e-12, ...springs.map((s) => Math.max(Math.abs(s.resistanceKnM), s.ultimateKnM ?? 0)));
  // Balkhoogte volgt de dichtheid van de integratiepunten, zodat ze niet overlappen.
  const zs = [...springs.map((s) => s.zM)].sort((a, b) => a - b);
  const gaps = zs.slice(1).map((z, i) => z - zs[i]).filter((g) => g > 1e-9);
  const barH = Math.max(1.5, Math.min(7, 0.7 * 500 * (gaps.length ? Math.min(...gaps) : L) / L));
  const sorted = [...springs].sort((a, b) => a.zM - b.zM);
  const linear = mode === 'linear' || springs.every((s) => s.ultimateKnM === null);

  // Kolom A: veerveld. Kolom B: p en pu. Kolom C: mobilisatie.
  // Compact (480 breed): past in de tekeningkolom naast het formulier.
  const A = { x0: 46, w: 160 }, B = { x0: 232, w: 110 }, C = { x0: 366, w: 90 };
  const kx = (k: number) => A.x0 + A.w * k / kMax;
  const px = (p: number) => B.x0 + B.w * p / pMax;
  const mx = (m: number) => C.x0 + C.w * Math.min(m, 1);

  const worst = sorted.reduce<SpringState | null>((w, s) => (mobilisation(s) ?? -1) > (w ? mobilisation(w) ?? -1 : -1) ? s : w, null);
  const worstM = worst ? mobilisation(worst) : null;
  const plastic = sorted.filter((s) => (mobilisation(s) ?? 0) >= 0.9).length;
  const softest = sorted.reduce((w, s) => s.secantKnM2 / s.initialKnM2 < w.secantKnM2 / w.initialKnM2 ? s : w, sorted[0]);
  const softestRatio = softest.secantKnM2 / softest.initialKnM2;

  return <div className="pile-springfield">
    <svg viewBox="0 0 480 610" role="img" aria-label={t('field.aria', 'Veerveld langs de paal')}>
      {input.layers.map((l, k) => <g key={k}>
        <rect className={k % 2 ? 'pile-soil-alt' : 'pile-soil'} x="40" width={C.x0 + C.w - 40 + 4} y={depth(l.topM)} height={depth(l.bottomM) - depth(l.topM)} />
        <text x={B.x0 + B.w - 2} y={depth(l.topM) + 11} textAnchor="end" className="pile-springfield-layer">{t('field.layer', 'laag {{n}}', { n: k + 1 })}</text>
      </g>)}
      {[0, .25, .5, .75, 1].map((t) => <g key={t}>
        <line className="pile-grid" x1="40" x2={C.x0 + C.w + 4} y1={depth(t * L)} y2={depth(t * L)} />
        <text x="36" y={depth(t * L) + 4} textAnchor="end">{f(t * L, 1)}</text>
      </g>)}

      {/* Kolom A — veerveld */}
      <text x="36" y="60" textAnchor="end" className="pile-springfield-sub">z [m]</text>
      <text x={A.x0 + A.w / 2} y="22" textAnchor="middle" className="pile-springfield-title">{t('field.stiffness', 'Stijfheid')} k [kN/m²]</text>
      <text x={A.x0 + A.w / 2} y="37" textAnchor="middle" className="pile-springfield-sub">{t('field.outline', 'omtrek')} k₀ · {t('field.filled', 'gevuld')} k<tspan baselineShift="sub">sec</tspan></text>
      <line className="pile-element" x1="42" x2="42" y1={depth(0)} y2={depth(L)} />
      {sorted.map((s) => {
        const m = mobilisation(s);
        const y = depth(s.zM) - barH / 2;
        const selected = s.id === selectedId;
        return <g key={s.id} role="button" tabIndex={0} aria-label={t('spring.select', 'Selecteer veer {{id}}', { id: s.id })} aria-pressed={selected}
          className={`pile-spring pile-springfield-bar mob-${mobilisationClass(m)}${selected ? ' is-selected' : ''}`}
          data-mobilisation={m ?? undefined}
          onClick={() => onSelect(s.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.id); } }}>
          <title>{`z ${f(s.zM)} m · k₀ ${f(s.initialKnM2, 0)} · ksec ${f(s.secantKnM2, 0)} kN/m²${m === null ? '' : ` · p/pu ${f(m * 100, 0)} %`}`}</title>
          <rect className="pile-springfield-k0" x={A.x0} y={y} width={kx(s.initialKnM2) - A.x0} height={barH} />
          <rect className="pile-springfield-ksec" x={A.x0} y={y} width={Math.max(0, kx(s.secantKnM2) - A.x0)} height={barH} />
          <rect className="pile-hit-area" x={A.x0 - 4} y={depth(s.zM) - Math.max(barH, 6) / 2} width={A.w + 4} height={Math.max(barH, 6)} />
        </g>;
      })}
      <text x={A.x0} y="590">0</text><text x={A.x0 + A.w} y="590" textAnchor="end">{f(kMax, 0)}</text>

      {/* Kolom B — weerstand p en grens pu */}
      <text x={B.x0 + B.w / 2} y="22" textAnchor="middle" className="pile-springfield-title">{t('field.resistance', 'Weerstand')} p</text>
      <text x={B.x0 + B.w / 2} y="37" textAnchor="middle" className="pile-springfield-sub">kN/m · {linear ? t('field.noLimit', 'geen grens') : t('field.dashedPu', 'gestreept pu')}</text>
      <line className="pile-axis" x1={B.x0} x2={B.x0} y1={depth(0)} y2={depth(L)} />
      {!linear && <polyline className="pile-reference" points={sorted.filter((s) => s.ultimateKnM !== null).map((s) => `${px(s.ultimateKnM!)},${depth(s.zM)}`).join(' ')} />}
      <polyline className="pile-response" points={sorted.map((s) => `${px(Math.abs(s.resistanceKnM))},${depth(s.zM)}`).join(' ')} />
      {selectedId && (() => { const s = sorted.find((x) => x.id === selectedId); return s ? <circle className="pile-operating" cx={px(Math.abs(s.resistanceKnM))} cy={depth(s.zM)} r="4" /> : null; })()}
      <text x={B.x0} y="590">0</text><text x={B.x0 + B.w} y="590" textAnchor="end">{f(pMax, 1)}</text>

      {/* Kolom C — mobilisatie */}
      <text x={C.x0 + C.w / 2} y="22" textAnchor="middle" className="pile-springfield-title">{t('field.mobilisation', 'Mobilisatie')}</text>
      <text x={C.x0 + C.w / 2} y="37" textAnchor="middle" className="pile-springfield-sub">p/pu · {t('field.line90', 'lijn 90 %')}</text>
      <line className="pile-axis" x1={C.x0} x2={C.x0} y1={depth(0)} y2={depth(L)} />
      {linear
        ? <text x={C.x0 + C.w / 2} y={depth(L / 2)} textAnchor="middle" className="pile-springfield-sub">{t('field.na', 'n.v.t.')}</text>
        : <>
          <line className="pile-springfield-limit" x1={mx(.9)} x2={mx(.9)} y1={depth(0)} y2={depth(L)} />
          {sorted.map((s) => {
            const m = mobilisation(s);
            return m === null ? null : <rect key={s.id} className={`pile-springfield-mob mob-${mobilisationClass(m)}`} x={C.x0} y={depth(s.zM) - barH / 2} width={mx(m) - C.x0} height={barH} />;
          })}
        </>}
      <text x={C.x0} y="590">0</text><text x={C.x0 + C.w} y="590" textAnchor="end">100 %</text>
    </svg>
    <div className="pile-legend pile-springfield-legend">
      <span className="mob-low">p/pu &lt; 50 %</span><span className="mob-mid">50–90 %</span><span className="mob-high">{t('field.nearlyPlastic', '≥ 90 %, vrijwel plastisch')}</span>
      {linear && <span className="mob-linear">{t('field.linearSpring', 'lineaire veer')}</span>}
    </div>
    <p className="pile-springfield-summary" aria-live="polite">
      {linear || worst === null || worstM === null
        ? <>{t('field.linearSummary', 'Lineair grondmodel: de secantstijfheid is gelijk aan k₀ en er is geen grensweerstand.')}</>
        : <>{t('field.summary', 'Hoogste mobilisatie {{pct}} % op z = {{z}} m (laag {{layer}}); {{springs}} boven 90 %.', { pct: f(worstM * 100, 0), z: f(worst.zM), layer: worst.layerIndex + 1, springs: plastic === 0 ? t('field.noSprings', 'geen veren') : plastic === 1 ? t('field.oneSpring', '1 veer') : t('field.nSprings', '{{count}} veren', { count: plastic }) })}
          {' '}{t('field.largestLoss', 'Grootste stijfheidsverlies:')} k<sub>sec</sub>/k₀ = {t('field.ratioAt', '{{ratio}} op z = {{z}} m.', { ratio: f(softestRatio), z: f(softest.zM) })}</>}
    </p>
  </div>;
}
