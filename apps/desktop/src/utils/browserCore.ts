import type { Cpt, Layer, Zone } from "../types/cpt";
/** Robertson thresholds and layer merging match cpt-core. */
export const zones: Zone[] = [
    ["Gevoelig fijnkorrelig", "#00BCD4"], ["Organisch / veen", "#795548"], ["Klei", "#4CAF50"], ["Silt mengsels", "#8BC34A"], ["Zand mengsels", "#FFC107"], ["Zand", "#FF9800"], ["Grof zand / grind", "#FF5722"], ["Zeer vast zand/klei", "#F44336"], ["Zeer vast fijnkorrelig", "#9C27B0"]
].map(([name, color], i) => ({ number: i + 1, name, color }));
export function classify(qc?: number, rf?: number): Zone | null {
    if (qc == null || rf == null || !Number.isFinite(qc) || !Number.isFinite(rf) || qc <= 0 || rf < 0)
        return null;
    let n: number;
    if (qc > 25)
        n = rf < 1 ? 7 : 8;
    else if (qc > 10)
        n = rf < .5 ? 7 : rf < 1.5 ? 6 : rf < 3 ? 5 : 8;
    else if (qc > 5)
        n = rf < 1 ? 6 : rf < 2 ? 5 : rf < 4 ? 4 : rf < 6 ? 3 : 9;
    else if (qc > 2)
        n = rf < 1 ? 5 : rf < 2.5 ? 4 : rf < 5 ? 3 : 2;
    else if (qc > .5)
        n = rf < 1 ? 4 : rf < 3 ? 3 : 2;
    else
        n = rf < 2 ? 3 : rf < 5 ? 2 : 1;
    return zones[n - 1];
}
export function detectLayers(cpt: Cpt): Layer[] {
    const raw: Layer[] = [];
    for (const p of cpt.points) {
        const z = classify(p.qc, p.rf);
        if (!z || !Number.isFinite(p.depth))
            continue;
        const last = raw[raw.length - 1];
        if (last?.zone_number === z.number)
            last.depth_bottom = p.depth;
        else
            raw.push({ depth_top: p.depth, depth_bottom: p.depth, zone_number: z.number, zone_name: z.name, zone_color: z.color });
    }
    const merged: Layer[] = [];
    for (const layer of raw) {
        const last = merged[merged.length - 1];
        if (last && (layer.depth_bottom - layer.depth_top < .1 || last.zone_number === layer.zone_number))
            last.depth_bottom = layer.depth_bottom;
        else
            merged.push(layer);
    }
    return merged;
}
