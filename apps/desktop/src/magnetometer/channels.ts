// Magnetometerkanalen van een sondering als benoemde reeksen in vaste eenheden (nT en graden).
//
// Bronnen voor de kanalen:
//  - GEF: kolomgrootheden 31 t/m 36 van #COLUMNINFO (magnetische veldsterkte x, y, z, totaal,
//    magnetische inclinatie, magnetische declinatie) volgens de GEF-CPT-Report-specificatie (CUR).
//  - BRO: catalogus Geotechnisch sondeeronderzoek (CPT) versie 1.1 van 1 september 2022,
//    entiteit "Conuspenetratietest resultaat", attributen 6.3.13.7 t/m 6.3.13.10 (magnetische
//    veldsterkte x, y, z en totaal; eenheid nT) en 6.3.13.17/18 (magnetische inclinatie en
//    declinatie; eenheid graden).
import type { Cpt } from "../types/cpt";

export type MagChannel = "x" | "y" | "z" | "total" | "inclination" | "declination";
export type MagUnit = "nT" | "°";

export const MAG_CHANNELS: MagChannel[] = ["x", "y", "z", "total", "inclination", "declination"];
export const MAG_UNITS: Record<MagChannel, MagUnit> = {
  x: "nT", y: "nT", z: "nT", total: "nT", inclination: "°", declination: "°",
};
/** GEF-kolomgrootheid per kanaal. */
export const GEF_QUANTITY: Record<MagChannel, number> = {
  x: 31, y: 32, z: 33, total: 34, inclination: 35, declination: 36,
};
/** Sleutel in `parameters` zoals de BRO-lezer hem bewaart. */
export const BRO_PARAMETER: Record<MagChannel, string> = {
  x: "magX", y: "magY", z: "magZ", total: "magTotal", inclination: "magInclination", declination: "magDeclination",
};

export type Series = Array<number | null>;

export interface MagnetometerData {
  /** Diepte onder maaiveld per meetpunt (m), in bronvolgorde. */
  depth: number[];
  /** Alleen kanalen met ten minste één geldige waarde. */
  channels: Partial<Record<MagChannel, Series>>;
  /** Kanalen die in het bestand staan, in vaste volgorde. */
  present: MagChannel[];
  /** Totaalveld: gemeten kanaal, of berekend uit de drie componenten. */
  total: Series | null;
  totalSource: "measured" | "computed" | null;
  /** Kanalen waarvan de eenheid in het bestand niet herkend is; die reeksen ontbreken. */
  unknownUnits: Array<{ channel: MagChannel; unit: string }>;
}

const clean = (unit: string) => unit.trim().toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, "");

/** Factor naar nT; `undefined` als de eenheid onbekend is. */
export function fieldUnitFactor(unit: string): number | undefined {
  const factors: Record<string, number> = {
    nt: 1, nanotesla: 1,
    "µt": 1e3, "μt": 1e3, ut: 1e3, microtesla: 1e3,
    mt: 1e6, millitesla: 1e6,
    t: 1e9, tesla: 1e9,
    // 1 gauss = 1e-4 T
    g: 1e5, gs: 1e5, gauss: 1e5, mg: 100, mgs: 100, milligauss: 100,
  };
  return factors[clean(unit)];
}

/** Factor naar graden; `undefined` als de eenheid onbekend is. */
export function angleUnitFactor(unit: string): number | undefined {
  const factors: Record<string, number> = {
    "°": 1, deg: 1, degree: 1, degrees: 1, graden: 1, graad: 1, rad: 180 / Math.PI, radialen: 180 / Math.PI,
  };
  return factors[clean(unit)];
}

/** Eenheid per kolomgrootheid uit de bewaarde GEF-koppen. */
function gefUnits(cpt: Cpt): Map<number, string> {
  const units = new Map<number, string>();
  try {
    const headers = JSON.parse(cpt.metadata.extra?.["ogs:gef-headers"] ?? "{}") as Record<string, unknown>;
    const info = headers.COLUMNINFO;
    if (Array.isArray(info))
      for (const item of info) {
        const parts = String(item).split(",").map((v) => v.trim());
        const quantity = Number(parts[3]);
        if (Number.isInteger(quantity) && !units.has(quantity)) units.set(quantity, parts[1] ?? "");
      }
  } catch { /* zonder leesbare koppen gelden de standaardeenheden */ }
  return units;
}

/** Totaalveld uit de drie componenten: |B| = wortel(Bx² + By² + Bz²). */
export function totalFromComponents(x: Series, y: Series, z: Series): Series {
  return x.map((bx, i) => {
    const by = y[i], bz = z[i];
    return bx == null || by == null || bz == null ? null : Math.hypot(bx, by, bz);
  });
}

/** De magnetometerkanalen van een sondering, of `null` als het bestand ze niet bevat. */
export function magnetometerData(cpt: Cpt): MagnetometerData | null {
  const units = gefUnits(cpt);
  const channels: Partial<Record<MagChannel, Series>> = {};
  const unknownUnits: MagnetometerData["unknownUnits"] = [];
  for (const channel of MAG_CHANNELS) {
    const gefKey = String(GEF_QUANTITY[channel]), broKey = BRO_PARAMETER[channel];
    const fromGef = cpt.points.some((p) => typeof p.parameters?.[gefKey] === "number");
    const key = fromGef ? gefKey : broKey;
    let factor = 1;
    if (fromGef && units.has(GEF_QUANTITY[channel])) {
      const unit = units.get(GEF_QUANTITY[channel])!;
      const known = MAG_UNITS[channel] === "nT" ? fieldUnitFactor(unit) : angleUnitFactor(unit);
      if (known === undefined) { unknownUnits.push({ channel, unit }); continue; }
      factor = known;
    }
    const series: Series = cpt.points.map((p) => {
      const value = p.parameters?.[key];
      return typeof value === "number" && Number.isFinite(value) ? value * factor : null;
    });
    if (series.some((v) => v !== null)) channels[channel] = series;
  }
  const present = MAG_CHANNELS.filter((c) => channels[c]);
  if (!present.length) return null;
  const { x, y, z } = channels;
  const total = channels.total ?? (x && y && z ? totalFromComponents(x, y, z) : null);
  return {
    depth: cpt.points.map((p) => p.depth),
    channels,
    present,
    total,
    totalSource: channels.total ? "measured" : total ? "computed" : null,
    unknownUnits,
  };
}

/** Snelle controle zonder de reeksen op te bouwen. */
export function hasMagnetometer(cpt: Cpt): boolean {
  const keys = MAG_CHANNELS.flatMap((c) => [String(GEF_QUANTITY[c]), BRO_PARAMETER[c]]);
  return cpt.points.some((p) => p.parameters && keys.some((k) => typeof p.parameters![k] === "number"));
}
