import type { CalcModule } from './types';
import { pileBearingCapacityModule } from '../modules/pile-bearing-capacity/module';
import { laterallyLoadedPileModule } from '../modules/laterally-loaded-pile/module';

// The public website and desktop expose the same calculation module.
// Other module sources remain available for existing project data.
export const CALC_REGISTRY: CalcModule[] = [pileBearingCapacityModule, laterallyLoadedPileModule];

export function getCalcModule(id: string): CalcModule | undefined {
  return CALC_REGISTRY.find((module) => module.id === id);
}
