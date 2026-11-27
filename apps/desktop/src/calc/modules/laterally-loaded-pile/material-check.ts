// Materiaaltoetsing van de paaldoorsnede op de maatgevende sneden.
//
// De module kent één belastingsgeval (H, M en N op de kop). De snedekrachten
// daaruit worden hier als rekenwaarden in de uiterste grenstoestand genomen,
// net als de bestaande N–M-toets doet. Een karakteristieke of quasi-blijvende
// combinatie is er niet; een scheurwijdtetoets kan daarom niet.
//
// Per paaltype een eigen bestand: beton (material-concrete.ts), stalen buis en
// staal-beton (material-steel.ts) en damwandprofiel (material-sheet.ts). Alle
// formules komen uit kennis van de normen; welke niet tegen de normtekst zijn
// gelegd staat in VERIFICATIE.md.
import type { LateralInput } from './compute';
import type { BeamResult } from './beam';
import { concreteChecks } from './material-concrete';
import { compositeChecks, tubeChecks } from './material-steel';
import { sheetChecks } from './material-sheet';
import type { CheckRow, Demand, ExistingCheck, MaterialResult, PartialResult } from './material-types';
export * from './material-types';

export function demandOf(input: LateralInput, samples: BeamResult['samples']): Demand {
  const list = samples.map((p) => ({ zM: p.zM, m: Math.abs(p.momentKnM), v: Math.abs(p.shearKn) }));
  const top = (key: 'm' | 'v') => list.reduce((a, p) => p[key] > a[key] ? p : a, list[0]);
  const m = top('m'), v = top('v');
  return { nEdKn: input.nEdKn, mMaxKnM: m.m, zM: m.zM, vMaxKn: v.v, zV: v.zM, samples: list };
}

export function materialCheck(input: LateralInput, samples: BeamResult['samples'], existing: ExistingCheck): MaterialResult {
  const s = input.section, d = demandOf(input, samples);
  const part: PartialResult = s.kind === 'steel-tube' ? tubeChecks(s, d)
    : s.kind === 'sheet-pile' ? sheetChecks(s, d)
    : s.kind === 'filled-tube' && s.tubeParticipates ? compositeChecks(s, d, existing)
    : concreteChecks(s, input.material, d, existing);
  const counted = part.rows.filter((r) => (r.status === 'ok' || r.status === 'fail') && r.uc !== null);
  // Maatgevend is de hoogste benutting van de sterktetoetsen; een wapeningsgrens alleen als zij niet voldoet.
  const strength = counted.filter((r) => !r.detail || r.status === 'fail');
  const top = (strength.length ? strength : counted).reduce<CheckRow | null>((a, r) => !a || r.uc! > a.uc! ? r : a, null);
  const outside = part.rows.some((r) => r.status === 'outside');
  return {
    ...part, outside,
    governing: top ? { id: top.id, label: top.label, uc: top.uc! } : null,
    ok: outside ? false : counted.length ? counted.every((r) => r.status === 'ok') : null,
    notes: [{ key: 'designValues', nl: 'De snedekrachten uit het ingevoerde belastingsgeval zijn als rekenwaarden in de uiterste grenstoestand genomen; N_Ed is over de hele paal de normaalkracht op de kop.' }, ...part.notes],
  };
}
