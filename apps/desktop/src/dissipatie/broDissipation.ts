// Dissipatietests uit de BRO-XML van een sondering.
//
// Bron: BRO-catalogus Geotechnisch sondeeronderzoek (CPT), entiteiten "Dissipatietest" en
// "Dissipatietest resultaat", en het bijbehorende XML-schema cptcommon 1.1
// (schema.broservices.nl/xsd/cptcommon/1.1/cptcommon.xsd):
//   conePenetrometerSurvey/dissipationTest (0..n)
//     phenomenonTime          begintijdstip van de test
//     disResult/values        de meetreeks, gecodeerd volgens swe:TextEncoding
//     penetrationLength [m]   sondeertrajectlengte waarop de conus stilstaat
// Elk record van de meetreeks heeft vijf waarden in vaste volgorde: verlopen tijd [s],
// conusweerstand [MPa], waterspanning u1 [MPa], waterspanning u2 [MPa], waterspanning u3 [MPa].
// Een waarde die niet gemeten is, staat er als -999999.
import type { DissipationPoint, DissipationTest } from "./types";

const VOID_VALUE = -999999;
const COLUMNS = ["time", "qc", "u1", "u2", "u3"] as const;
const LENGTH_FACTOR: Record<string, number> = { m: 1, cm: 0.01, mm: 0.001 };

const child = (root: Element, name: string): Element | null => {
  const all = root.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) if (all[i].localName === name) return all[i];
  return null;
};

/** Alle dissipatietests van één sondering, op diepte gesorteerd. Tests zonder meetreeks vallen af. */
export function parseBroDissipationTests(root: Element, filename: string): DissipationTest[] {
  const tests: DissipationTest[] = [];
  const elements = Array.from(root.getElementsByTagName("*")).filter((el) => el.localName === "dissipationTest");
  for (const element of elements) {
    const valuesText = child(element, "values")?.textContent?.trim();
    if (!valuesText) continue;
    const encoding = child(element, "TextEncoding");
    const token = encoding?.getAttribute("tokenSeparator") || ",";
    const block = encoding?.getAttribute("blockSeparator") || ";";
    const decimal = encoding?.getAttribute("decimalSeparator") || ".";
    const notes: string[] = [];
    const points: DissipationPoint[] = [];
    let skipped = 0;
    for (const record of valuesText.split(block)) {
      if (!record.trim()) continue;
      const values = record.trim().split(token).map((raw) => {
        const text = raw.trim().split(decimal).join(".");
        const value = text === "" ? NaN : Number(text);
        return Number.isFinite(value) && value !== VOID_VALUE ? value : undefined;
      });
      const time = values[0];
      if (values.length < COLUMNS.length || time == null || time < 0) { skipped++; continue; }
      const point: DissipationPoint = { time };
      if (values[1] != null) point.qc = values[1];
      if (values[2] != null) point.u1 = values[2];
      if (values[3] != null) point.u2 = values[3];
      if (values[4] != null) point.u3 = values[4];
      points.push(point);
    }
    if (skipped) notes.push(`${skipped} record(s) zonder geldige tijd of met te weinig waarden overgeslagen.`);
    if (!points.length) continue;
    points.sort((a, b) => a.time - b.time);

    const lengthEl = child(element, "penetrationLength");
    const raw = Number(lengthEl?.textContent?.trim() ?? NaN);
    const factor = LENGTH_FACTOR[lengthEl?.getAttribute("uom") ?? "m"];
    let depth = 0;
    if (Number.isFinite(raw) && factor != null) depth = raw * factor;
    else notes.push("Sondeertrajectlengte ontbreekt of heeft een onbekende eenheid; vul de diepte zelf in.");
    const start = child(element, "timePosition")?.textContent?.trim();
    tests.push({
      id: "", depth, source: "bro", source_file: filename, points,
      ...(start ? { start_time: start } : {}),
      ...(notes.length ? { notes } : {}),
    });
  }
  tests.sort((a, b) => a.depth - b.depth);
  tests.forEach((test, index) => { test.id = `bro-${index + 1}-${test.depth.toFixed(2)}`; });
  return tests;
}
