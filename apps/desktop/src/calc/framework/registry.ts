import type { CalcModule } from './types';
import { pileBearingCapacityModule } from '../modules/pile-bearing-capacity/module';

// The public website and desktop expose the same calculation module.
// Other module sources remain available for existing project data.
export const CALC_REGISTRY: CalcModule[] = [pileBearingCapacityModule];

export function getCalcModule(id: string): CalcModule | undefined {
  return CALC_REGISTRY.find((module) => module.id === id);
}
