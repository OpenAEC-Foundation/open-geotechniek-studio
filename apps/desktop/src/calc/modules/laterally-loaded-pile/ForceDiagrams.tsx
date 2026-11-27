import type { LateralInput } from './compute';
import type { BeamResult } from './beam';
import './spring-visual.css';
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

/** Gebied tussen twee nuldoorgangen met één teken, en de grootste waarde daarin. */
export interface SignRegion { zTop: number; zBottom: number; sign: 1 | -1; peak: { v: number; z: number } }
/**
 * Tekengebieden van een lijn over de diepte. Nuldoorgangen worden lineair
 * tussen twee punten bepaald; waarden kleiner dan `tolerance` × de grootste
 * absolute waarde tellen als nul en horen bij geen enkel gebied.
 */
export function signRegions(samplesIn: Sample[], value: (p: Sample) => number, tolerance = 1e-6): SignRegion[] {
  const samples = [...samplesIn].sort((a, b) => a.zM - b.zM);
  const eps = tolerance * Math.max(0, ...samples.map((p) => Math.abs(value(p))));
  const sign = (v: number): 0 | 1 | -1 => Math.abs(v) <= eps ? 0 : v > 0 ? 1 : -1;
  const regions: SignRegion[] = [];
  let open: SignRegion | null = null, lastEnd = samples.length ? samples[0].zM : 0;
  for (let k = 0; k < samples.length; k++) {
    const p = samples[k], v = value(p), s = sign(v), prev = k > 0 ? samples[k - 1] : null, pv = prev ? value(prev) : 0;
    // Nulpunt tussen het vorige punt en dit punt, binnen het interval gehouden.
    const zero = prev && pv !== v && p.zM > prev.zM ? Math.min(p.zM, Math.max(prev.zM, prev.zM + (p.zM - prev.zM) * pv / (pv - v))) : p.zM;
    if (open && s !== open.sign) {
      open.zBottom = zero; lastEnd = zero;
      if (open.zBottom > open.zTop) regions.push(open);
      open = null;
    }
    if (!open && s !== 0) open = { zTop: prev ? (sign(pv) === 0 ? zero : lastEnd) : p.zM, zBottom: p.zM, sign: s, peak: { v, z: p.zM } };
    if (open && Math.abs(v) > Math.abs(open.peak.v)) open.peak = { v, z: p.zM };
    if (open) open.zBottom = p.zM;
  }
  if (open && open.zBottom > open.zTop) regions.push(open);
  return regions;
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
/** Plus of min in een rondje, zoals in een constructieberekening. */
function PlusMinus({ x, y, sign, className }: { x: number; y: number; sign: 1 | -1; className: string }) {
  return <g className={`pile-plusminus ${className}`} data-value={sign} aria-hidden="true">
    <circle cx={x} cy={y} r="7.5" /><line x1={x - 4} y1={y} x2={x + 4} y2={y} />{sign > 0 && <line x1={x} y1={y - 4} x2={x} y2={y + 4} />}
  </g>;
}

/**
 * Lijnen over de paal zoals in een constructieberekening: per grootheid een
 * rechte nullijn, het vlak gearceerd haaks op de paal in één kleur, bij het
 * moment het buigteken aan de getrokken zijde, bij de dwarskracht en de
 * grondreactie plus of min, en de uiterste waarden met getal en niveau.
 * De dwarskracht is positief als zij op het bovenvlak met een positieve H
 * meewijst (de rekenkern geeft aan de kop V = −H).
 */
export function ForceDiagrams({ input, beam }: { input: LateralInput; beam: BeamResult }) {
  const { t } = useTranslation('calcLateral');
  const head = input.headNap ?? 0, L = input.lengthM;
  const top = 76, bottom = 560, y = (z: number) => top + (bottom - top) * z / L;
  const napStep = L <= 6 ? 0.5 : L <= 15 ? 1 : L <= 30 ? 2 : 5;
  const napTicks: number[] = [];
  for (let n = Math.floor(head / napStep) * napStep; n >= head - L - 1e-9; n -= napStep) if (n <= head + 1e-9) napTicks.push(+n.toFixed(3));
  const samples = [...beam.samples].sort((a, b) => a.zM - b.zM);
  const W = 168, gap = 26, x0 = 84, hatchStep = 6;

  return <div className="pile-diagrams">
    <svg viewBox={`0 0 ${x0 + 4 * W + 3 * gap + 12} 640`} role="img" aria-label={t('diagrams.aria', 'Diagrammen over de paaldiepte')}>
      <text x="8" y="40" className="pile-diagram-unit">m NAP</text>
      {napTicks.map((n) => <g key={n}><line className="pile-axis" x1={x0 - 4} x2={x0} y1={y(head - n)} y2={y(head - n)} /><text x={x0 - 8} y={y(head - n) + 3.5} textAnchor="end">{nl(n, napStep < 1 ? 1 : 0)}</text></g>)}
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
        // Labels van max en min: aan de kant waar ruimte is, en nooit over elkaar.
        const side = (e: { v: number }) => x(dir * e.v) > left + W * 0.55;
        const labelY: Record<'max' | 'min', number> = { max: Math.min(bottom - 16, Math.max(top + 10, y(ext.max.z) - 8)), min: Math.min(bottom - 16, Math.max(top + 10, y(ext.min.z) + 14)) };
        if (side(ext.max) === side(ext.min) && Math.abs(labelY.max - labelY.min) < 26) {
          const upper = labelY.max <= labelY.min ? 'max' : 'min', lower = upper === 'max' ? 'min' : 'max';
          labelY[lower] = Math.min(bottom - 16, labelY[upper] + 26); labelY[upper] = Math.min(labelY[upper], labelY[lower] - 26);
        }
        const mark = (e: { v: number; z: number }, kind: 'max' | 'min') => {
          const px = x(dir * e.v), right = side(e), ty = labelY[kind];
          return <g className={`pile-extreme pile-extreme-${kind}`}>
            <circle cx={px} cy={y(e.z)} r="3" />
            <text x={right ? px - 6 : px + 6} y={ty} textAnchor={right ? 'end' : 'start'}>
              <tspan className="pile-extreme-kind">{kind}</tspan> {label(e.v)}
              <tspan x={right ? px - 6 : px + 6} dy="11" className="pile-extreme-nap">NAP {nl(head - e.z, 2)}</tspan>
            </text>
          </g>;
        };
        // Tekens midden in elk vlak: bij het grootste positieve en het grootste negatieve deel.
        // Eén teken per gebied tussen twee nuldoorgangen, bij de grootste waarde van dat gebied.
        const signs = !c.sign ? [] : signRegions(samples, c.value).filter((g) => Math.abs(g.peak.v) > 0.04 * absMax && y(g.zBottom) - y(g.zTop) >= 30).map((g) => {
          // Halverwege de piek en het verste einde van het gebied: vrij van het label met de extreme waarde.
          const far = g.peak.z - g.zTop > g.zBottom - g.peak.z ? g.zTop : g.zBottom, cy = Math.min(y(g.zBottom) - 15, Math.max(y(g.zTop) + 15, y((g.peak.z + far) / 2)));
          const at = valueAt(samples, drawn, (cy - top) * L / (bottom - top)), mid = (xZero + x(at)) / 2, side = (Math.sign(dir * g.sign) || 1) as 1 | -1;
          return <g key={g.zTop} className="pile-sign-region" data-sign={g.sign}>{c.sign === 'bend' ? <BendSign x={mid} y={cy} side={side} />
            : <PlusMinus x={mid} y={cy} sign={(c.sign === 'shear' ? -g.sign : g.sign) as 1 | -1} className={c.sign === 'shear' ? 'pile-shear-sign' : 'pile-sign'} />}</g>;
        });
        return <g key={c.key} className={`pile-diagram pile-diagram-${c.key} tone-${c.tone}`} aria-label={`${title} [${c.unit}]: max ${label(ext.max.v)}, min ${label(ext.min.v)}`}>
          <text x={left + W / 2} y="22" textAnchor="middle" className="pile-diagram-title">{title}</text>
          <text x={left + W / 2} y="38" textAnchor="middle" className="pile-diagram-unit">{c.symbol} [{c.unit}]{c.mirror ? ` · ${t('diagrams.tensionSide', 'getrokken zijde')}` : ''}</text>
          {ticks.map((t) => <g key={t}><line className="pile-axis" x1={x(t)} x2={x(t)} y1={bottom} y2={bottom + 4} />
            <text x={x(t)} y={bottom + 16} textAnchor="middle">{nl(dir * t === 0 ? 0 : dir * t, Math.abs(ticks[1] - ticks[0]) < 1 ? 1 : 0)}</text></g>)}
          <text x={left + W / 2} y={bottom + 32} textAnchor="middle" className="pile-diagram-unit">{c.unit}</text>
          <polygon className="pile-fill" points={`${xZero},${y(samples[0].zM)} ${pts} ${xZero},${y(samples[samples.length - 1].zM)}`} />
          <g className="pile-hatch">{hatch.map((py) => { const v = valueAt(samples, drawn, (py - top) * L / (bottom - top)); return <line key={py} x1={xZero} x2={x(v)} y1={py} y2={py} />; })}</g>
          <line className="pile-axis" x1={left} x2={left + W} y1={bottom} y2={bottom} />
          <line className="pile-zero" x1={xZero} x2={xZero} y1={y(samples[0].zM)} y2={y(samples[samples.length - 1].zM)} />
          <polyline className="pile-curve" points={pts} />
          {signs}
          {mark(ext.max, 'max')}
          {mark(ext.min, 'min')}
        </g>;
      })}
    </svg>
    <p className="pile-diagram-note">{t('diagrams.depthNote', 'Diepte in m NAP vanaf paalkop {{nap}}', { nap: nl(head, 2) })}{input.headNap === undefined ? ` ${t('diagrams.assumed', '(aangenomen)')}` : ''}. {t('diagrams.noteShort', 'Moment aan de getrokken zijde; dwarskracht + met H mee op het bovenvlak.')}</p>
  </div>;
}
