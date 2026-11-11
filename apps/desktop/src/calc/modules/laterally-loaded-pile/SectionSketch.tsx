import type { PileSection } from './section';
import { MATERIAL_COLORS } from '../pile-bearing-capacity/parts/material-colors';
import { useTranslation } from 'react-i18next';

/** Staafposities als in de doorsnedeberekening: vierkant gelijk over vier zijden, rond over de cirkel. */
export function barPositions(s: PileSection): Array<{ x: number; y: number }> {
  const tube = s.kind === 'steel-tube' || s.kind === 'filled-tube';
  if (s.kind === 'steel-tube' || s.barCount < 1) return [];
  const core = tube ? s.diameterMm - 2 * s.wallMm : s.diameterMm, r = core / 2 - s.coverToBarCentreMm;
  return Array.from({ length: s.barCount }, (_, i) => {
    if (s.kind === 'concrete-square') {
      const side = Math.floor(4 * i / s.barCount), t = (4 * i / s.barCount) % 1;
      return side === 0 ? { x: -r + 2 * r * t, y: -r } : side === 1 ? { x: r, y: -r + 2 * r * t } : side === 2 ? { x: r - 2 * r * t, y: r } : { x: -r, y: r - 2 * r * t };
    }
    return { x: r * Math.cos(2 * Math.PI * i / s.barCount), y: r * Math.sin(2 * Math.PI * i / s.barCount) };
  });
}

/** Doorsnede op schaal: beton grijs gearceerd, buis roestrood, staven met beugel. */
export function SectionSketch({ section: s }: { section: PileSection }) {
  const { t } = useTranslation('calcLateral');
  const size = 150, pad = 18, scale = (size - 2 * pad) / s.diameterMm, c = size / 2;
  const tube = s.kind === 'steel-tube' || s.kind === 'filled-tube';
  const core = tube ? s.diameterMm - 2 * s.wallMm : s.diameterMm;
  const bars = barPositions(s), barR = Math.max(1.6, s.barDiameterMm * scale / 2);
  const ringR = (core / 2 - s.coverToBarCentreMm) * scale;
  const label = s.kind === 'concrete-square' ? `□${s.diameterMm}` : `Ø${s.diameterMm}`;
  return <figure className="lat-sketch" aria-label={t('sketch.figure', 'Doorsnede paal')}>
    <svg viewBox={`0 0 ${size} ${size + 16}`} role="img" aria-label={`${t('sketch.aria', 'Doorsnede {{label}} mm', { label })}${bars.length ? t('sketch.bars', ' met {{count}} staven Ø{{dia}}', { count: bars.length, dia: s.barDiameterMm }) : ''}`}>
      <defs>
        <pattern id="lat-concrete" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill={MATERIAL_COLORS.concrete.fill} opacity=".55" />
          <line x1="0" y1="0" x2="0" y2="5" stroke={MATERIAL_COLORS.concrete.dark} strokeWidth=".5" />
        </pattern>
      </defs>
      {s.kind === 'concrete-square'
        ? <rect x={pad} y={pad} width={size - 2 * pad} height={size - 2 * pad} fill="url(#lat-concrete)" stroke="currentColor" strokeWidth="1.2" />
        : <>
          <circle cx={c} cy={c} r={s.diameterMm * scale / 2} fill={tube ? MATERIAL_COLORS.steel.fill : 'url(#lat-concrete)'} stroke="currentColor" strokeWidth="1.2" />
          {tube && <circle cx={c} cy={c} r={core * scale / 2} fill={s.kind === 'filled-tube' ? 'url(#lat-concrete)' : 'var(--oa-panel, #fff)'} stroke="currentColor" strokeWidth=".6" />}
        </>}
      {bars.length > 0 && (s.kind === 'concrete-square'
        ? <rect x={c - ringR} y={c - ringR} width={2 * ringR} height={2 * ringR} fill="none" stroke="currentColor" strokeWidth=".6" strokeDasharray="2 1.5" />
        : <circle cx={c} cy={c} r={ringR} fill="none" stroke="currentColor" strokeWidth=".6" strokeDasharray="2 1.5" />)}
      {bars.map((b, i) => <circle key={i} className="lat-sketch-bar" cx={c + b.x * scale} cy={c + b.y * scale} r={barR} />)}
      <text x={c} y={size + 10} textAnchor="middle">{label}{bars.length ? ` · ${bars.length}Ø${s.barDiameterMm}` : ''}</text>
    </svg>
  </figure>;
}
