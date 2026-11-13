import type { LateralInput } from './compute';
import type { BeamResult } from './beam';
import { useTranslation } from 'react-i18next';
import { numberLocale } from '../../i18n';

type Sample = BeamResult['samples'][number];
const nl = (v: number, d = 1) => v.toLocaleString(numberLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

/** Ronde schaalwaarden (1, 2, 2,5 of 5 × 10ⁿ) die het bereik inclusief 0 dekken. */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  const a = Math.min(0, lo), b = Math.max(0, hi), span = b - a || Math.max(Math.abs(a), Math.abs(b), 1);
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const first = Math.floor(a / step + 1e-9) * step, last = Math.ceil(b / step - 1e-9) * step;
  return Array.from({ length: Math.round((last - first) / step) + 1 }, (_, i) => +(first + i * step).toPrecision(12));
}

/** Grootste en kleinste waarde met hun diepte. */
export function extremes(samples: Sample[], value: (p: Sample) => number) {
  let max = samples[0], min = samples[0];
  for (const p of samples) { if (value(p) > value(max)) max = p; if (value(p) < value(min)) min = p; }
  return { max: { v: value(max), z: max.zM }, min: { v: value(min), z: min.zM } };
}

/** Lineair geïnterpoleerde waarde op diepte z (samples oplopend in z). */
export function valueAt(samples: Sample[], value: (p: Sample) => number, z: number): number {
  let k = samples.findIndex((p) => p.zM >= z);
  if (k <= 0) return value(samples[Math.max(0, k)]);
  const a = samples[k - 1], b = samples[k], t = b.zM > a.zM ? (z - a.zM) / (b.zM - a.zM) : 0;
  return value(a) + t * (value(b) - value(a));
}

type Sign = 'bend' | 'shear' | 'plain' | null;
interface Curve { key: string; title: string; symbol: string; unit: string; digits: number; value: (p: Sample) => number; tone: string; mirror: boolean; sign: Sign }
/**
 * Het moment staat aan de getrokken zijde: bij M = EI·y″ > 0 is de vezel aan
 * de −y-kant getrokken, dus de lijn wordt gespiegeld getekend. Kleuren als
 * in de constructieve rekenprogramma's: moment rood, dwarskracht blauw.
 */
export const CURVES: Curve[] = [
  { key: 'y', title: 'Verplaatsing', symbol: 'y', unit: 'mm', digits: 2, value: (p) => p.yM * 1000, tone: 'disp', mirror: false, sign: null },
  { key: 'M', title: 'Buigend moment', symbol: 'M', unit: 'kNm', digits: 1, value: (p) => p.momentKnM, tone: 'moment', mirror: true, sign: 'bend' },
  { key: 'V', title: 'Dwarskracht', symbol: 'V', unit: 'kN', digits: 1, value: (p) => p.shearKn, tone: 'shear', mirror: false, sign: 'shear' },
  { key: 'p', title: 'Grondreactie', symbol: 'p', unit: 'kN/m', digits: 1, value: (p) => p.reactionKnM, tone: 'soil', mirror: false, sign: 'plain' },
];

/** Buigteken: boogje bol naar de getrokken zijde, met een streeplijn aan die kant. */
function BendSign({ x, y, side }: { x: number; y: number; side: 1 | -1 }) {
  const b = 6 * side;
  return <g className="pile-bend-sign" aria-hidden="true">
    <path d={`M${x - b / 2} ${y - 10} Q${x + b * 1.4} ${y} ${x - b / 2} ${y + 10}`} />
    <path className="pile-bend-tension" d={`M${x + b * 0.1} ${y - 10} Q${x + b * 2} ${y} ${x + b * 0.1} ${y + 10}`} />
  </g>;
}
/** Afschuifteken: twee tegengestelde pijltjes boven en onder een blokje. */
function ShearSign({ x, y, sense }: { x: number; y: number; sense: 1 | -1 }) {
  const a = 7 * sense, head = (px: number, py: number, d: number) => `M${px} ${py} l${-3 * d} -2.5 l0 5 z`;
  return <g className="pile-shear-sign" aria-hidden="true">
    <rect x={x - 5} y={y - 6} width="10" height="12" />
    <line x1={x - a} y1={y - 9} x2={x + a} y2={y - 9} /><path d={head(x + a, y - 9, sense)} />
    <line x1={x + a} y1={y + 9} x2={x - a} y2={y + 9} /><path d={head(x - a, y + 9, -sense)} />
  </g>;
}

/**
 * Lijnen over de paal: diepte in m NAP, per grootheid een eigen schaal met
 * waarden en eenheid onderaan, arcering haaks op de paal, buig- en
 * afschuiftekens, en de grootste en kleinste waarde met hun niveau.
 */
export function ForceDiagrams({ input, beam }: { input: LateralInput; beam: BeamResult }) {
  const { t } = useTranslation('calcLateral');
  const head = input.headNap ?? 0, L = input.lengthM;
  const top = 76, bottom = 560, y = (z: number) => top + (bottom - top) * z / L;
  const napStep = L <= 6 ? 0.5 : L <= 15 ? 1 : L <= 30 ? 2 : 5;
  const napTicks: number[] = [];
  for (let n = Math.floor(head / napStep) * napStep; n >= head - L - 1e-9; n -= napStep) if (n <= head + 1e-9) napTicks.push(+n.toFixed(3));
  const samples = [...beam.samples].sort((a, b) => a.zM - b.zM);
  const W = 168, gap = 26, x0 = 84, hatchStep = 4.5;

  return <div className="pile-diagrams">
    <svg viewBox={`0 0 ${x0 + 4 * W + 3 * gap + 12} 640`} role="img" aria-label={t('diagrams.aria', 'Diagrammen over de paaldiepte')}>
      <text x="8" y="40" className="pile-diagram-unit">m NAP</text>
      {input.layers.map((l, k) => <rect key={k} className={k % 2 ? 'pile-soil-alt' : 'pile-soil'} x={x0} width={4 * W + 3 * gap} y={y(l.topM)} height={y(l.bottomM) - y(l.topM)} />)}
      {napTicks.map((n) => <g key={n}><line className="pile-grid" x1={x0 - 4} x2={x0 + 4 * W + 3 * gap} y1={y(head - n)} y2={y(head - n)} /><text x={x0 - 8} y={y(head - n) + 3.5} textAnchor="end">{nl(n, napStep < 1 ? 1 : 0)}</text></g>)}
      <text x={x0 - 8} y={top - 8} textAnchor="end" className="pile-diagram-head">{t('diagrams.head', 'kop {{nap}}', { nap: nl(head, 2) })}</text>

      {CURVES.map((c, i) => {
        const left = x0 + i * (W + gap), dir = c.mirror ? -1 : 1;
        // Getekende waarde: bij spiegelen −M, de labels tonen de werkelijke waarde.
        const drawn = (p: Sample) => dir * c.value(p);
        const vals = samples.map(drawn), ticks = niceTicks(Math.min(...vals), Math.max(...vals));
        const lo = ticks[0], hi = ticks[ticks.length - 1], span = hi - lo || 1;
        const x = (v: number) => left + 8 + (W - 16) * (v - lo) / span, xZero = x(0);
        const pts = samples.map((p) => `${x(drawn(p)).toFixed(2)},${y(p.zM).toFixed(2)}`).join(' ');
        const hatch: number[] = [];
        for (let py = y(samples[0].zM); py <= y(samples[samples.length - 1].zM); py += hatchStep) hatch.push(py);
        const ext = extremes(samples, c.value), absMax = Math.max(Math.abs(ext.max.v), Math.abs(ext.min.v)) || 1;
        const label = (v: number) => `${nl(v, c.digits)} ${c.unit}`, title = t(`diagrams.curves.${c.key}`, c.title);
        const mark = (e: { v: number; z: number }, kind: 'max' | 'min') => {
          const px = x(dir * e.v), right = px > left + W * 0.55;
          const ty = Math.min(bottom - 4, Math.max(top + 10, y(e.z) + (kind === 'max' ? -8 : 14)));
          return <g className={`pile-extreme pile-extreme-${kind}`}>
            <circle cx={px} cy={y(e.z)} r="3" />
            <text x={right ? px - 6 : px + 6} y={ty} textAnchor={right ? 'end' : 'start'}>
              <tspan className="pile-extreme-kind">{kind}</tspan> {label(e.v)}
              <tspan x={right ? px - 6 : px + 6} dy="11" className="pile-extreme-nap">NAP {nl(head - e.z, 2)}</tspan>
            </text>
          </g>;
        };
        // Tekens midden in elk vlak: bij het grootste positieve en het grootste negatieve deel.
        const signs = ([[ext.max, 1], [ext.min, -1]] as const).filter(([e, s]) => s * e.v > 0.05 * absMax).map(([e, s]) => {
          const mid = (xZero + x(dir * e.v)) / 2, side = (Math.sign(dir * e.v) || 1) as 1 | -1, cy = y(e.z);
          return c.sign === 'bend' ? <BendSign key={s} x={mid} y={cy} side={side} />
            : c.sign === 'shear' ? <ShearSign key={s} x={mid} y={cy} sense={s as 1 | -1} />
            : c.sign === 'plain' ? <text key={s} className="pile-sign" x={mid} y={cy + 5} textAnchor="middle">{s > 0 ? '+' : '−'}</text> : null;
        });
        return <g key={c.key} className={`pile-diagram pile-diagram-${c.key} tone-${c.tone}`} aria-label={`${title} [${c.unit}]: max ${label(ext.max.v)}, min ${label(ext.min.v)}`}>
          <text x={left + W / 2} y="22" textAnchor="middle" className="pile-diagram-title">{title}</text>
          <text x={left + W / 2} y="38" textAnchor="middle" className="pile-diagram-unit">{c.symbol} [{c.unit}]{c.mirror ? ` · ${t('diagrams.tensionSide', 'getrokken zijde')}` : ''}</text>
          <rect x={left} y={top} width={W} height={bottom - top} className="pile-diagram-frame" />
          {ticks.map((t) => <g key={t}><line className="pile-grid" x1={x(t)} x2={x(t)} y1={top} y2={bottom} /><line className="pile-axis" x1={x(t)} x2={x(t)} y1={bottom} y2={bottom + 4} />
            <text x={x(t)} y={bottom + 16} textAnchor="middle">{nl(dir * t === 0 ? 0 : dir * t, Math.abs(ticks[1] - ticks[0]) < 1 ? 1 : 0)}</text></g>)}
          <text x={left + W / 2} y={bottom + 32} textAnchor="middle" className="pile-diagram-unit">{c.unit}</text>
          <g className="pile-hatch">{hatch.map((py) => { const v = valueAt(samples, drawn, (py - top) * L / (bottom - top)); return <line key={py} x1={xZero} x2={x(v)} y1={py} y2={py} />; })}</g>
          <line className="pile-zero" x1={xZero} x2={xZero} y1={top} y2={bottom} />
          <polyline className="pile-curve" points={pts} />
          {signs}
          {mark(ext.max, 'max')}
          {mark(ext.min, 'min')}
        </g>;
      })}
    </svg>
    <p className="pile-diagram-note">{t('diagrams.depthNote', 'Diepte in m NAP vanaf paalkop {{nap}}', { nap: nl(head, 2) })}{input.headNap === undefined ? ` ${t('diagrams.assumed', '(aangenomen)')}` : ''}. {t('diagrams.note', 'Elke grootheid heeft een eigen schaal. Het moment staat aan de getrokken zijde (buigteken: streeplijn aan de getrokken vezel). Dwarskracht met afschuifteken; tekens volgen de rekenkern met z omlaag en H naar rechts.')}</p>
  </div>;
}
