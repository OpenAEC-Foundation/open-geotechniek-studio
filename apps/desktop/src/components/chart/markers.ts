import type { Cpt } from '../../types/cpt';
import type { ChartMarker } from './chart-renderer';
export const MARKER_KEY = 'ogs:reference-markers';
/** Store reference lines in each CPT's extensible metadata, preserving them in project snapshots. */
export function markersFor(cpt: Cpt): ChartMarker[] {
  try {
    const values: unknown = JSON.parse(cpt.metadata.extra?.[MARKER_KEY] ?? '[]');
    if (!Array.isArray(values)) return [];
    return values.flatMap<ChartMarker>((value) => {
      if (!value || typeof value !== 'object') return [];
      const { nap, depth } = value;
      if (typeof nap === 'number' && Number.isFinite(nap)) return [{ cptId: cpt.id, nap }];
      if (typeof depth === 'number' && Number.isFinite(depth) && depth >= 0) return [{ cptId: cpt.id, depth }];
      return [];
    });
  } catch { return []; }
}
export function withMarkers(cpt: Cpt, markers: ChartMarker[]): Cpt {
  const own = markers.filter((m) => m.cptId === cpt.id).map(({ nap, depth }) => ({ nap, depth }));
  return { ...cpt, metadata: { ...cpt.metadata, extra: { ...cpt.metadata.extra, [MARKER_KEY]: JSON.stringify(own) } } };
}
