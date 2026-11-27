import type { PileSection } from './section';
import { MATERIAL_COLORS } from '../pile-bearing-capacity/parts/material-colors';
import { useTranslation } from 'react-i18next';
import { findSheetPile } from '../../library/sheetPiles';
import { sheetOutline } from './sheet-shape';

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

/** Damwandprofiel op schaal met de buigrichting: de contour uit de fabriekstekening, of anders de schematische hartlijn met de sloten. */
function SheetSketch({ section: s }: { section: PileSection }) {
  const { t } = useTranslation('calcLateral');
  const profile = s.sheet ? findSheetPile(s.sheet.profileId, s.sheet.manufacturer) : undefined;
  if (!profile) return <figure className="lat-sketch" aria-label={t('sketch.figure', 'Doorsnede paal')} />;
  const size = 150, pad = 14, o = sheetOutline(profile, s.sheet!.widthMode), scale = (size - 2 * pad) / Math.max(o.widthMm, o.heightMm, 1), c = size / 2;
  const px = (q: { x: number; y: number }) => `${(c + q.x * scale).toFixed(1)},${(c - q.y * scale).toFixed(1)}`;
  const exact = o.basis === 'drawing';
  const label = `${profile.id} · ${s.sheet!.widthMode === 'wall' ? t('sketch.sheetWall', 'wand') : t('sketch.sheetSingle', 'losse plank')}`;
  return <figure className="lat-sketch" aria-label={t('sketch.figure', 'Doorsnede paal')}>
    <svg viewBox={`0 0 ${size} ${size + 24}`} role="img" aria-label={exact ? t('sketch.sheetAriaDrawing', 'Damwandprofiel {{id}}, contour uit fabrieks-DWG', { id: profile.id }) : t('sketch.sheetAria', 'Damwandprofiel {{id}}, schematisch', { id: profile.id })}>
      <line x1={pad / 2} x2={size - pad / 2} y1={c} y2={c} stroke="currentColor" strokeWidth=".4" strokeDasharray="4 2 1 2" />
      {exact ? o.plates.map((poly, k) => <polygon key={k} className="lat-sketch-plate" points={poly.map(px).join(' ')} />) : <>
        <polyline className="lat-sketch-steel" points={o.points.map(px).join(' ')} strokeWidth={Math.max(2, (profile.flangeMm ?? profile.webMm ?? 10) * scale)} />
        {o.locks.map((q, k) => <circle key={k} className="lat-sketch-lock" cx={c + q.x * scale} cy={c - q.y * scale} r="2.2" />)}
      </>}
      <path d={`M${size - 9} ${c + 16}V${c - 16}m-3 5l3 -5l3 5`} fill="none" stroke="currentColor" strokeWidth=".8" />
      <text x={size - 9} y={c + 26} textAnchor="middle">H</text>
      <text x={c} y={size + 10} textAnchor="middle">{label}</text>
      <text className="lat-sketch-note" x={c} y={size + 20} textAnchor="middle">{exact ? t('sketch.fromDrawing', 'contour uit fabrieks-DWG') : t('sketch.schematic', 'schematisch')}</text>
    </svg>
  </figure>;
}

/** Doorsnede op schaal: beton grijs gearceerd, buis roestrood, staven met beugel. */
export function SectionSketch({ section }: { section: PileSection }) {
  return section.kind === 'sheet-pile' ? <SheetSketch section={section} /> : <SolidSketch section={section} />;
}
function SolidSketch({ section: s }: { section: PileSection }) {
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
