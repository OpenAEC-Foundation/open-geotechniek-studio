import { useTranslation } from 'react-i18next';
import type { LateralLayer } from './compute';
import { soilColor } from './report-data';
import { soilKey } from './soil';
import { soilStrokeCss, springCss, springPath } from './spring-visual';
import './spring-visual.css';

/**
 * Legenda bij de veren in 2D en 3D: de grondsoorten van deze berekening,
 * wat de lengte van een veer betekent en hoe de kleur verloopt met de mobilisatie.
 */
export function SpringLegend({ layers }: { layers: LateralLayer[] }) {
  const { t } = useTranslation('calcLateral');
  const ids = [...new Set(layers.map((l) => l.springId))];
  const sample = ids[0] ?? 'manual';
  const name = (id: string) => id === 'manual' ? t('soils.manual', 'Eigen waarde') : t(soilKey(id), id).split(' (')[0];
  return <div className="pile-spring-legend" role="group" aria-label={t('legend.aria', 'Legenda grondlagen en veren')}>
    <ul className="pile-spring-legend-soils">{ids.map((id) => <li key={id}><i style={{ background: soilColor(id).fill }} />{name(id)}</li>)}</ul>
    <ul className="pile-spring-legend-rules">
      <li><svg viewBox="0 0 74 14" aria-hidden="true">
        <path d={springPath(1, 4, 26, 2.4)} style={{ stroke: soilStrokeCss(sample) }} /><path d={springPath(1, 10, 70, 2.4)} style={{ stroke: soilStrokeCss(sample) }} />
      </svg>{t('legend.springLength', 'Lengte van de veer = beginstijfheid k₀')}</li>
      <li><svg viewBox="0 0 74 14" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={1 + k * 12} y="3" width="12" height="8" style={{ fill: springCss(sample, 0.5 + k / 10) }} />)}
      </svg>{t('legend.mobilisation', 'Kleur = grondsoort; verloopt naar rood als p/pu van 50 naar 100 % gaat')}</li>
    </ul>
  </div>;
}
