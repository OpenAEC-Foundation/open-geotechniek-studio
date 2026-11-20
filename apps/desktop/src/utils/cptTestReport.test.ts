import { describe, expect, it } from "vitest";
import type { Cpt, ProjectMeta } from "../types/cpt";
import { parseGef } from "../types/gefParser";
import { buildTestReport, type TestReportGroup } from "./cptTestReport";

const project: ProjectMeta = { title: "Nieuwbouw Dijkzicht", client: "Gemeente Voorbeeld", location: "Kadeweg 4 te Ergens", project_number: "P-2217", author: "", date: "2026-11-02" };
const emptyProject: ProjectMeta = { title: "", client: "", location: "", project_number: "", author: "", date: "" };

const gef = parseGef(`#GEFID= 1, 1, 0
#FILEOWNER= Voorbeeld
#FILEDATE= 2026, 10, 28
#STARTDATE= 2026, 10, 28
#STARTTIME= 9, 5, 12.000000
#PROJECTID= CPT, 4711
#COLUMN= 4
#COLUMNINFO= 1, m, sondeerlengte, 1
#COLUMNINFO= 2, MPa, conusweerstand, 2
#COLUMNINFO= 3, MPa, plaatselijke wrijving, 3
#COLUMNINFO= 4, graden, helling, 8
#COMPANYID= Voorbeeld Sonderingen B.V., Ergens, 31
#XYID= 31000, 126294.55, 426700.32, 0.02, 0.02
#ZID= 31000, 0.84, 0.04
#MEASUREMENTTEXT= 1, Bouwbedrijf Uit Bestand, opdrachtgever
#MEASUREMENTTEXT= 2, Tien woningen\\, fase 2, projectnaam
#MEASUREMENTTEXT= 4, C10CFII/1234, conustype
#MEASUREMENTTEXT= 6, NEN-EN-ISO 22476-1 klasse 2, norm
#MEASUREMENTTEXT= 9, maaiveld, vast horizontaal referentievlak
#MEASUREMENTVAR= 1, 1000.000000, mm2, nom. oppervlak conuspunt
#MEASUREMENTVAR= 2, 15000.000000, mm2, nom. oppervlak wrijvingsmantel
#MEASUREMENTVAR= 3, 0.800000, -, netto oppervlaktequotient conuspunt
#MEASUREMENTVAR= 13, 1.200000, m, voorgeboorde diepte
#MEASUREMENTVAR= 16, 1.500000, m, einddiepte
#MEASUREMENTVAR= 17, 0.000000, -, stopcriterium
#MEASUREMENTVAR= 20, 0.454596, MPa, nulpunt conus voor
#MEASUREMENTVAR= 21, 0.373851, MPa, nulpunt conus na
#MEASUREMENTVAR= 22, -0.006860, MPa, nulpunt wrijving voor
#MEASUREMENTVAR= 30, 0.100000, graden, nulpunt helling voor
#MEASUREMENTVAR= 31, 0.300000, graden, nulpunt helling na
#TESTID= S1
#REPORTCODE= GEF-CPT-Report, 1, 1, 2, -
#EOH=
1.3 2.5 0.02 0.4
1.4 3.5 0.03 1.6
1.5 4.5 0.04 0.9`, "S1.gef");

const rows = (groups: TestReportGroup[]) => Object.fromEntries(groups.flatMap((g) => g.rows.map((r) => [r.label, r])));

describe("testrapport per sondering", () => {
  it("heeft de rubrieken van het testrapport volgens de norm", () => {
    expect(buildTestReport(gef, project).map((g) => g.title)).toEqual([
      "Algemeen", "Locatie", "Apparatuur", "Uitvoering", "Referentiemetingen (nulpunten voor en na de proef)", "Resultaten",
    ]);
  });

  it("vult de regels uit de kopregels van de GEF en uit het project", () => {
    const r = rows(buildTestReport(gef, project));
    expect(r["Norm en klasse"].value).toBe("NEN-EN-ISO 22476-1 klasse 2");
    expect(r["Datum sondering"].value).toBe("28-10-2026, 09:05 uur");
    expect(r["Uitvoerend bedrijf"].value).toBe("Voorbeeld Sonderingen B.V.");
    // Het project gaat voor op wat het bestand over de opdrachtgever zegt.
    expect(r["Opdrachtgever"].value).toBe("Gemeente Voorbeeld");
    expect(r["Project"].value).toBe("Nieuwbouw Dijkzicht");
    expect(r["Coördinaten"].value).toBe("X 126294.55 m; Y 426700.32 m (RD, EPSG:28992)");
    expect(r["Maaiveldhoogte"].value).toBe("NAP +0.84 m");
    expect(r["Referentievlak diepte"].value).toBe("maaiveld");
    expect(r["Conustype"].value).toBe("C10CFII/1234");
    expect(r["Oppervlak conuspunt"].value).toBe("1000 mm2");
    expect(r["Oppervlak wrijvingsmantel"].value).toBe("15000 mm2");
    expect(r["Netto oppervlakteverhouding conus (a)"].value).toBe("0.8");
    expect(r["Voorboordiepte"].value).toBe("1.20 m");
    expect(r["Einddiepte"].value).toBe("1.5 m");
    expect(r["Stopcriterium"].value).toBe("code 0 (GEF-meetvariabele 17)");
    expect(r["Conusweerstand"].value).toBe("voor 0.4546 MPa; na 0.3739 MPa; verschil -0.0807 MPa");
    expect(r["Helling"].value).toBe("voor 0.1 graden; na 0.3 graden; verschil +0.2 graden");
    expect(r["Gemeten grootheden"].value).toBe("conusweerstand qc, plaatselijke wrijving fs, helling");
    expect(r["Aantal meetpunten"].value).toBe("3");
    expect(r["Grootste helling"].value).toBe("1.6 graden op 1.40 m");
  });

  it("gebruikt de gegevens uit het bestand als het project ze niet heeft", () => {
    const r = rows(buildTestReport(gef, emptyProject));
    expect(r["Opdrachtgever"].value).toBe("Bouwbedrijf Uit Bestand");
    expect(r["Project"].value).toBe("Tien woningen, fase 2");
    expect(r["Projectnummer"].value).toBe("CPT, 4711");
  });

  it("noemt ontbrekende gegevens als ontbrekend en verzint geen waarden", () => {
    const r = rows(buildTestReport(gef, project));
    for (const label of ["Netto oppervlakteverhouding mantel (b)", "Grondwaterstand", "Laatste kalibratie", "Bijzonderheden", "Sondeerapparaat of meetsysteem"])
      expect(r[label].value, label).toBeNull();
    // Het nulpunt van de wrijving na de proef ontbreekt: alleen dat deel is als ontbrekend gemerkt.
    expect(r["Plaatselijke wrijving"]).toMatchObject({ value: "voor -0.0069 MPa", missingPart: "na: niet in het bestand" });
    // Waterspanning is niet gemeten en heeft geen nulpunten: die regel hoort er dan niet bij.
    expect(r["Waterspanning u2"]).toBeUndefined();
  });

  it("laat bij een kale sondering alles open behalve wat uit de meetdata volgt", () => {
    const bare: Cpt = { id: "K1", metadata: { source_file: "K1.gef" }, points: [{ depth: 0.5, qc: 1, u2: 0.01 }, { depth: 8, qc: 9, u2: 0.05 }] };
    const r = rows(buildTestReport(bare, emptyProject));
    const missing = Object.values(r).filter((row) => row.value == null).map((row) => row.label);
    expect(missing).toEqual(expect.arrayContaining([
      "Norm en klasse", "Datum sondering", "Uitvoerend bedrijf", "Opdrachtgever", "Project", "Coördinaten", "Maaiveldhoogte", "Conustype",
      "Oppervlak conuspunt", "Voorboordiepte", "Stopcriterium", "Grondwaterstand", "Conusweerstand", "Plaatselijke wrijving", "Waterspanning u2", "Grootste helling",
    ]));
    expect(r["Sondering"].value).toBe("K1");
    expect(r["Einddiepte"].value).toBe("8.00 m (laatste meetpunt)");
    expect(r["Dieptebereik"].value).toBe("0.50 tot 8.00 m");
    expect(r["Gemeten grootheden"].value).toBe("conusweerstand qc, waterspanning u2");
  });

  it("leest de velden van een BRO-bestand met hun eenheid", () => {
    const bro: Cpt = {
      id: "CPT000000000001",
      metadata: {
        source_file: "CPT000000000001.xml", date: "2021-03-04", ground_level_nap: -1.25, predrilled_depth_m: 0.5,
        measurements: [
          { name: "coneSurfaceArea", value: 1000, unit: "mm2" }, { name: "frictionSleeveSurfaceArea", value: 15000, unit: "mm2" },
          { name: "finalDepth", value: 24.86, unit: "m" }, { name: "groundwaterLevel", value: 1.1, unit: "m" },
          { name: "coneResistanceBefore", value: 0.012, unit: "MPa" }, { name: "coneResistanceAfter", value: 0.02, unit: "MPa" },
        ],
        extra: { cptStandard: "ISO22476D1", qualityClass: "klasse2", conePenetrometerType: "F7.5CKEHG/B", coneSurfaceQuotient: "0.75",
          stopCriterion: "einddiepte", cptMethod: "elektrischContinu", localVerticalReferencePoint: "maaiveld", "ogs:validation": JSON.stringify({ format: "BRO-CPT", diagnostics: [] }) },
      },
      position: { x_rd: 120000, y_rd: 450000, z_nap: -1.25 },
      points: [{ depth: 0.5, qc: 1, fs: 0.01 }, { depth: 24.86, qc: 20, fs: 0.1 }],
    };
    const r = rows(buildTestReport(bro, project));
    expect(r["Norm en klasse"].value).toBe("ISO22476D1, klasse2");
    expect(r["Datum sondering"].value).toBe("04-03-2021 (rapportdatum)");
    expect(r["Uitvoerend bedrijf"].value).toBeNull();
    expect(r["Conustype"].value).toBe("F7.5CKEHG/B");
    expect(r["Oppervlak conuspunt"].value).toBe("1000 mm2");
    expect(r["Netto oppervlakteverhouding conus (a)"].value).toBe("0.75");
    expect(r["Sondeermethode"].value).toBe("elektrischContinu");
    expect(r["Einddiepte"].value).toBe("24.86 m");
    expect(r["Stopcriterium"].value).toBe("einddiepte");
    expect(r["Grondwaterstand"].value).toBe("1.1 m");
    expect(r["Conusweerstand"].value).toBe("voor 0.012 MPa; na 0.02 MPa; verschil +0.008 MPa");
    expect(r["Plaatselijke wrijving"].value).toBeNull();
  });
});
