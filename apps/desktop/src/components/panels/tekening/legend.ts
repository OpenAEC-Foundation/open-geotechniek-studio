import { SONDERING_SOORTEN } from "./sonderingSoort";
import { symbolKey, type SymbolSpec, type SymbolStatus } from "./symbols";

export interface LegendEntry {
  spec: SymbolSpec;
  count: number;
}

const STATUS_ORDER: SymbolStatus[] = ["uitgevoerd", "gepland"];

/**
 * Legend rows for the symbols that occur on the drawing, with the number of
 * each, in a fixed order: tests carried out, planned tests, boreholes.
 */
export function legendEntries(specs: readonly SymbolSpec[]): LegendEntry[] {
  const counts = new Map<string, LegendEntry>();
  for (const spec of specs) {
    const key = symbolKey(spec);
    const e = counts.get(key);
    if (e) e.count += 1;
    else counts.set(key, { spec, count: 1 });
  }
  const order: string[] = [];
  for (const status of STATUS_ORDER)
    for (const soort of SONDERING_SOORTEN) order.push(symbolKey({ type: "sondering", soort, status }));
  for (const status of STATUS_ORDER) order.push(symbolKey({ type: "boring", status }));
  return order.flatMap((k) => (counts.has(k) ? [counts.get(k)!] : []));
}
