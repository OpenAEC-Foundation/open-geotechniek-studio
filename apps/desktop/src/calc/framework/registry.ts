import type { CalcModule } from './types';
import { padFoundationModule } from '../modules/pad-foundation/module';
import { settlementModule } from '../modules/settlement/module';

// Only the requested settlement and pad-foundation worksheets are exposed.
// Unreleased modules remain on disk so saved projects and their source survive.
// The public web release continues to exclude calculation modules.
export const CALC_REGISTRY: CalcModule[] = import.meta.env.VITE_PUBLIC_WEB === '1'
  ? []
  : [settlementModule, padFoundationModule];

export function getCalcModule(id: string): CalcModule | undefined {
  return CALC_REGISTRY.find((module) => module.id === id);
}
