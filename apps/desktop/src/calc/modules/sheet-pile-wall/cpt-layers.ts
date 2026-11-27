// Grondprofiel voor de damwand uit een sondering: de fijne laagindeling van de sondering (zones 1 tot en met 9, zoals
// het paneel Grondopbouw ze toont), samengevoegd tot lagen met één regel van tabel 2.b van NEN 9997-1 en de
// beddingsconstanten uit tabel 3.3 van CUR 166. Bronnen, regels en keuzes: VERIFICATIE.md, hoofdstuk "Grondprofiel uit
// de sondering".
import type { Cpt } from "../../../types/cpt";
import { analyzeLayers } from "../../../utils/layerAnalysis";
import { zones } from "../../../utils/soilZones";
import { ct } from "../../i18n";
import type { WallLayer } from "./compute";

const t = (key: string, nl: string, vars?: Record<string, unknown>) => ct("calcWall", key, nl, vars);

export type Consistency = "los" | "matig" | "vast" | "slap" | "";

/**
 * Eén regel van NEN 9997-1 tabel 2.b, met de linkerwaarde (de lage karakteristieke waarde van het gemiddelde) van elke
 * kolom. Overgenomen uit NEN 9997-1:2012 (met C1), tabel 2.b; de kolommen γ, γsat en qc zijn gelijk aan die van
 * NEN 9997-1:2016+C2:2017. cu = 0 waar de tabel "n.v.t." geeft.
 */
export interface SoilTableRow {
  id: string;
  /** Hoofdnaam, bijmengsel en consistentie zoals in de tabel. */
  main: "grind" | "zand" | "leem" | "klei" | "veen";
  mix: string;
  consistency: Consistency;
  name: string;
  gamma: number;
  gammaSat: number;
  /** qc in de tabel [MPa]: alleen ingang van de tabel (voetnoot d), voor grind, zand, leem en sterk zandige klei bij σ′v = 100 kPa (voetnoot g). */
  qcMpa: number;
  phi: number;
  c: number;
  cu: number;
  /** Voetnoot g: de gemeten qc wordt omgerekend naar σ′v = 100 kPa. */
  stressCorrected: boolean;
  /** Rechterwaarde (hoge karakteristieke waarde) van γ en γsat waar de tabel die geeft, anders gelijk aan de linker. */
  gammaHigh: number;
  gammaSatHigh: number;
}

const row = (id: string, main: SoilTableRow["main"], mix: string, consistency: Consistency, name: string, gamma: number | [number, number], gammaSat: number | [number, number], qcMpa: number, phi: number, c: number, cu: number): SoilTableRow => {
  const [g, gHigh] = Array.isArray(gamma) ? gamma : [gamma, gamma], [gs, gsHigh] = Array.isArray(gammaSat) ? gammaSat : [gammaSat, gammaSat];
  return { id, main, mix, consistency, name, gamma: g, gammaSat: gs, gammaHigh: gHigh, gammaSatHigh: gsHigh, qcMpa, phi, c, cu, stressCorrected: main === "grind" || main === "zand" || main === "leem" || (main === "klei" && mix === "sterk zandig") };
};

/** NEN 9997-1 tabel 2.b, linkerwaarden. Volgorde en regels als in de tabel. */
export const TABLE_2B: SoilTableRow[] = [
  row("t2b-grind-zs-los", "grind", "zwak siltig", "los", "Grind, zwak siltig, los", 17, 19, 15, 32.5, 0, 0),
  row("t2b-grind-zs-matig", "grind", "zwak siltig", "matig", "Grind, zwak siltig, matig", 18, 20, 25, 35, 0, 0),
  row("t2b-grind-zs-vast", "grind", "zwak siltig", "vast", "Grind, zwak siltig, vast", [19, 20], [21, 22], 30, 37.5, 0, 0),
  row("t2b-grind-ss-los", "grind", "sterk siltig", "los", "Grind, sterk siltig, los", 18, 20, 10, 30, 0, 0),
  row("t2b-grind-ss-matig", "grind", "sterk siltig", "matig", "Grind, sterk siltig, matig", 19, 21, 15, 32.5, 0, 0),
  row("t2b-grind-ss-vast", "grind", "sterk siltig", "vast", "Grind, sterk siltig, vast", [20, 21], [22, 22.5], 25, 35, 0, 0),
  row("t2b-zand-schoon-los", "zand", "schoon", "los", "Zand, schoon, los", 17, 19, 5, 30, 0, 0),
  row("t2b-zand-schoon-matig", "zand", "schoon", "matig", "Zand, schoon, matig", 18, 20, 15, 32.5, 0, 0),
  row("t2b-zand-schoon-vast", "zand", "schoon", "vast", "Zand, schoon, vast", [19, 20], [21, 22], 25, 35, 0, 0),
  row("t2b-zand-zsk", "zand", "zwak siltig, kleiig", "", "Zand, zwak siltig, kleiig", [18, 19], [20, 21], 12, 27, 0, 0),
  row("t2b-zand-ssk", "zand", "sterk siltig, kleiig", "", "Zand, sterk siltig, kleiig", [18, 19], [20, 21], 8, 25, 0, 0),
  row("t2b-leem-zz-slap", "leem", "zwak zandig", "slap", "Leem, zwak zandig, slap", 19, 19, 1, 27.5, 0, 50),
  row("t2b-leem-zz-matig", "leem", "zwak zandig", "matig", "Leem, zwak zandig, matig", 20, 20, 2, 27.5, 1, 100),
  row("t2b-leem-zz-vast", "leem", "zwak zandig", "vast", "Leem, zwak zandig, vast", [21, 22], [21, 22], 3, 27.5, 2.5, 200),
  row("t2b-leem-sz", "leem", "sterk zandig", "", "Leem, sterk zandig", [19, 20], [19, 20], 2, 27.5, 0, 50),
  row("t2b-klei-schoon-slap", "klei", "schoon", "slap", "Klei, schoon, slap", 14, 14, 0.5, 17.5, 0, 25),
  row("t2b-klei-schoon-matig", "klei", "schoon", "matig", "Klei, schoon, matig", 17, 17, 1, 17.5, 5, 50),
  row("t2b-klei-schoon-vast", "klei", "schoon", "vast", "Klei, schoon, vast", [19, 20], [19, 20], 2, 17.5, 13, 100),
  row("t2b-klei-zz-slap", "klei", "zwak zandig", "slap", "Klei, zwak zandig, slap", 15, 15, 0.7, 22.5, 0, 40),
  row("t2b-klei-zz-matig", "klei", "zwak zandig", "matig", "Klei, zwak zandig, matig", 18, 18, 1.5, 22.5, 5, 80),
  row("t2b-klei-zz-vast", "klei", "zwak zandig", "vast", "Klei, zwak zandig, vast", [20, 21], [20, 21], 2.5, 22.5, 13, 120),
  row("t2b-klei-sz", "klei", "sterk zandig", "", "Klei, sterk zandig", [18, 20], [18, 20], 1, 27.5, 0, 0),
  row("t2b-klei-org-slap", "klei", "organisch", "slap", "Klei, organisch, slap", 13, 13, 0.2, 15, 0, 10),
  row("t2b-klei-org-matig", "klei", "organisch", "matig", "Klei, organisch, matig", [15, 16], [15, 16], 0.5, 15, 0, 25),
  row("t2b-veen-nv-slap", "veen", "niet voorbelast", "slap", "Veen, niet voorbelast, slap", [10, 12], [10, 12], 0.1, 15, 1, 10),
  row("t2b-veen-mv-matig", "veen", "matig voorbelast", "matig", "Veen, matig voorbelast, matig", [12, 13], [12, 13], 0.2, 15, 2.5, 20),
];
export const getTableRow = (id: string | undefined): SoilTableRow | undefined => TABLE_2B.find((r) => r.id === id);

/**
 * CUR 166 deel 1, tabel 3.3: secantwaarden van de horizontale beddingsconstante [kN/m³], kolom 2) (het lage
 * gemiddelde). kh1 tot 50 %, kh2 van 50 tot 80 % en kh3 van 80 tot 100 % van de passieve gronddruk. Bij zand zijn kh2
 * en kh3 in de geraadpleegde afdruk niet eenduidig te lezen (zie VERIFICATIE.md); die blijven open.
 */
export interface KhRow { id: string; label: string; kh1: number; kh2?: number; kh3?: number }
export const TABLE_3_3: KhRow[] = [
  { id: "zand-los", label: "zand, los (qc 5 MPa)", kh1: 12000 },
  { id: "zand-matig", label: "zand, matig (qc 15 MPa)", kh1: 20000 },
  { id: "zand-vast", label: "zand, vast (qc 25 MPa)", kh1: 40000 },
  { id: "klei-slap", label: "klei, slap (cu 25 kPa)", kh1: 2000, kh2: 800, kh3: 500 },
  { id: "klei-matig", label: "klei, matig (cu 50 kPa)", kh1: 4000, kh2: 2000, kh3: 800 },
  { id: "klei-vast", label: "klei, vast (cu 200 kPa)", kh1: 6000, kh2: 4000, kh3: 2000 },
  { id: "veen-slap", label: "veen, slap (cu 10 kPa)", kh1: 1000, kh2: 500, kh3: 250 },
  { id: "veen-matig", label: "veen, matig (cu 30 kPa)", kh1: 2000, kh2: 800, kh3: 500 },
];

/** De hoogste regel waarvan de ingang niet boven de waarde ligt; onder de laagste de laagste. */
function pick<T>(rows: T[], entry: (r: T) => number, value: number): T {
  let best = rows[0];
  for (const r of rows) if (entry(r) <= value + 1e-9 && entry(r) >= entry(best)) best = r;
  return best;
}

/**
 * Regel van tabel 3.3 bij een regel van tabel 2.b: zand en grind op dezelfde qc als waarmee tabel 2.b is ingegaan (zodat
 * los, matig en vast in beide tabellen gelijk zijn; tabel 3.3 noemt 5, 15 en 25 MPa, gelijk aan tabel 2.b), klei (ook
 * organische) op cu uit tabel 2.b, veen op cu. Leem staat niet in tabel 3.3: geen waarde.
 */
export function khRowFor(r: SoilTableRow, qcMeanMpa: number): KhRow | undefined {
  const of = (prefix: string) => TABLE_3_3.filter((k) => k.id.startsWith(prefix));
  if (r.main === "zand" || r.main === "grind") return pick(of("zand"), (k) => ({ "zand-los": 5, "zand-matig": 15, "zand-vast": 25 })[k.id as "zand-los"], qcMeanMpa);
  if (r.main === "klei") return pick(of("klei"), (k) => ({ "klei-slap": 25, "klei-matig": 50, "klei-vast": 200 })[k.id as "klei-slap"], r.cu);
  if (r.main === "veen") return pick(of("veen"), (k) => ({ "veen-slap": 10, "veen-matig": 30 })[k.id as "veen-slap"], r.cu);
  return undefined;
}

/** Omrekenfactor van voetnoot g bij tabel 2.b: C_qc = (100 / σ′v)^0,67, σ′v in kPa. */
export const cqc = (sigmaVEffKpa: number): number => Math.pow(100 / Math.max(1, sigmaVEffKpa), 0.67);

/**
 * Regel van tabel 2.b bij een zone van de sondering (zones van het paneel Grondopbouw), de gemiddelde qc en Rf van de
 * laag en de verticale korrelspanning in het midden van de laag. De keuze van de grondsoort per zone is een keuze van
 * dit rekenblad (VERIFICATIE.md); de vastheid volgt uit de tabel-qc: de hoogste regel waarvan de qc niet boven de
 * (omgerekende) gemeten qc ligt.
 */
export function tableRowFor(zone: number, qcMeanMpa: number, rfMeanPct: number, sigmaVEffKpa: number): { row: SoilTableRow; qcEntryMpa: number } {
  const group = (main: string, mix: string) => TABLE_2B.filter((r) => r.main === main && r.mix === mix);
  const choose = (rows: SoilTableRow[]) => { const entry = rows[0].stressCorrected ? qcMeanMpa * cqc(sigmaVEffKpa) : qcMeanMpa; return { row: pick(rows, (r) => r.qcMpa, entry), qcEntryMpa: entry }; };
  switch (zone) {
    case 1: return choose(group("veen", "niet voorbelast"));
    case 2: return rfMeanPct >= 5 ? choose([...group("veen", "niet voorbelast"), ...group("veen", "matig voorbelast")]) : choose(group("klei", "organisch"));
    case 3: return choose(group("klei", "schoon"));
    case 4: return choose(group("klei", "zwak zandig"));
    case 5: return choose([...group("zand", "sterk siltig, kleiig"), ...group("zand", "zwak siltig, kleiig")]);
    case 6: case 7: return choose(group("zand", "schoon"));
    case 8: return choose(group("zand", "zwak siltig, kleiig"));
    default: return choose(group("klei", "schoon"));
  }
}

/** Herkomst van een laag uit de sondering: wat er is gemeten, welke tabelregels zijn gekozen en de waarden daaruit. */
export interface WallLayerSource {
  cptId: string;
  zone: number;
  /** Diepte onder het maaiveld van de sondering [m]. */
  depthTopM: number;
  depthBottomM: number;
  qcMeanMpa: number;
  rfMeanPct: number;
  /** Korrelspanning in het midden van de laag en de qc waarmee tabel 2.b is ingegaan. */
  sigmaVEffKpa: number;
  qcEntryMpa: number;
  rowId: string;
  khRowId: string | null;
  /** De waarden zoals voorgesteld; een afwijkende waarde in de laag is eigen invoer. */
  values: { gamma: number; gammaSat: number; phi: number; c: number; cu: number; delta: number; kh: number; kh2?: number; kh3?: number };
}

export interface CptProfileOptions {
  /** Kleinste laagdikte [m]; dunnere lagen gaan op in de dikste buurlaag. */
  minThicknessM: number;
  /** Grondwaterstand bij de sondering [m NAP], voor σ′v bij de omrekening van qc. */
  waterNap: number;
  gammaWater?: number;
}
export const DEFAULT_MIN_THICKNESS_M = 0.3;

interface Segment { top: number; bottom: number; zone: number; row?: SoilTableRow; qcEntry?: number; qc?: number; rf?: number; sigma?: number }

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Lagen voor de damwand uit een sondering. Stappen:
 * 1. de laagindeling van de sondering (analyzeLayers, met de instellingen of de handmatige indeling uit het paneel
 *    Grondopbouw); gaten zonder classificatie gaan op in de laag erboven;
 * 2. binnen elke laag een grens waar de regel van tabel 2.b per meetpunt verandert (bijvoorbeeld slappe en vaste klei
 *    in dezelfde zone), met een geschatte korrelspanning;
 * 3. per laag de gemiddelde qc en Rf en de regel van tabel 2.b (tableRowFor), van boven naar beneden met σ′v uit de
 *    gekozen volumegewichten erboven;
 * 4. opeenvolgende lagen met dezelfde regel worden één laag; de dunste laag onder de kleinste dikte gaat op in de
 *    dikste buurlaag (met diens zone); daarna stap 3 opnieuw, tot er niets meer verandert.
 */
export function wallProfileFromCpt(cpt: Cpt, options: CptProfileOptions): { layers: WallLayer[]; warnings: string[] } {
  const ground = cpt.metadata.ground_level_nap ?? 0, gw = options.gammaWater ?? 10, minT = Math.max(0, options.minThicknessM);
  const warnings: string[] = [];
  const analysis = analyzeLayers(cpt);
  warnings.push(...analysis.warnings);
  const base = analysis.layers.map((l) => ({ top: l.depth_top, bottom: l.depth_bottom, zone: l.zone_number }));
  if (!base.length) return { layers: [], warnings: [...warnings, t("soilProfile.noLayers", "De sondering levert geen laagindeling (geen qc en Rf).")] };
  for (let k = 1; k < base.length; k++) if (base[k].top > base[k - 1].bottom + 1e-6) base[k - 1].bottom = base[k].top;
  // De bovenste laag loopt door tot het maaiveld (ook over een voorgeboord stuk zonder meting), voor σ′v en de wand.
  base[0].top = 0;

  // Meetpunten op diepte met cumulatieve sommen, voor het gemiddelde over een dieptebereik.
  const pts = cpt.points.filter((p) => Number.isFinite(p.depth)).map((p) => ({ d: Math.abs(p.depth), qc: p.qc, rf: p.rf })).sort((a, b) => a.d - b.d);
  const ok = (v: number | undefined): v is number => typeof v === "number" && Number.isFinite(v);
  const cum = { qc: [0], nq: [0], rf: [0], nr: [0] };
  for (const p of pts) {
    cum.qc.push(cum.qc[cum.qc.length - 1] + (ok(p.qc) ? p.qc : 0)); cum.nq.push(cum.nq[cum.nq.length - 1] + (ok(p.qc) ? 1 : 0));
    cum.rf.push(cum.rf[cum.rf.length - 1] + (ok(p.rf) ? p.rf : 0)); cum.nr.push(cum.nr[cum.nr.length - 1] + (ok(p.rf) ? 1 : 0));
  }
  /** Eerste meetpunt op of onder diepte d. */
  const index = (d: number) => { let lo = 0, hi = pts.length; while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m].d < d) lo = m + 1; else hi = m; } return lo; };
  const means = (top: number, bottom: number) => {
    const a = index(top - 1e-9), e = index(bottom + 2e-9);
    const nq = cum.nq[e] - cum.nq[a], nr = cum.nr[e] - cum.nr[a];
    return { qc: nq ? (cum.qc[e] - cum.qc[a]) / nq : 0, rf: nr ? (cum.rf[e] - cum.rf[a]) / nr : 0 };
  };

  // Stap 2: grenzen binnen een laag waar de regel per meetpunt verandert (σ′v geschat met 17 en 9 kN/m³).
  const sigmaGuess = (d: number) => { const nap = ground - d, dry = Math.max(0, Math.min(d, ground - options.waterNap)); return dry * 17 + Math.max(0, options.waterNap - nap) * 9; };
  let segs: Segment[] = [];
  for (const b of base) {
    let top = b.top, last: string | undefined, prevD = b.top;
    for (const p of pts) {
      if (p.d < b.top - 1e-9 || p.d > b.bottom + 1e-9 || !ok(p.qc)) continue;
      const id = tableRowFor(b.zone, p.qc, ok(p.rf) ? p.rf : 0, sigmaGuess(p.d)).row.id;
      if (last !== undefined && id !== last) { const at = (prevD + p.d) / 2; segs.push({ top, bottom: at, zone: b.zone }); top = at; }
      last = id; prevD = p.d;
    }
    segs.push({ top, bottom: b.bottom, zone: b.zone });
  }
  segs = segs.filter((s) => s.bottom - s.top > 1e-9);

  const assign = () => {
    let sigmaTop = 0;
    for (const s of segs) {
      const m = means(s.top, s.bottom);
      s.qc = m.qc; s.rf = m.rf;
      // σ′v in het midden: eerst met 17 en 19 kN/m³, dan met de gekozen regel opnieuw. Met de hoge waarde van γ en γsat
      // (de rechterwaarde, voetnoot a): een grotere σ′v geeft een kleinere omgerekende qc, dus een lossere regel.
      const at = (gamma: number, gammaSat: number, depth: number) => {
        const topNap = ground - s.top, nap = ground - depth, wet = Math.max(0, Math.min(topNap, options.waterNap) - nap), dry = topNap - nap - wet;
        return sigmaTop + dry * gamma + wet * (gammaSat - gw);
      };
      const mid = (s.top + s.bottom) / 2;
      let choice = tableRowFor(s.zone, s.qc, s.rf, at(17, 19, mid));
      for (let n = 0; n < 3; n++) {
        const next = tableRowFor(s.zone, s.qc, s.rf, at(choice.row.gammaHigh, choice.row.gammaSatHigh, mid)), same = next.row.id === choice.row.id;
        choice = next;
        if (same) break;
      }
      s.row = choice.row; s.qcEntry = choice.qcEntryMpa; s.sigma = at(choice.row.gammaHigh, choice.row.gammaSatHigh, mid);
      sigmaTop = at(choice.row.gammaHigh, choice.row.gammaSatHigh, s.bottom);
    }
  };
  const thick = (s: Segment) => s.bottom - s.top;
  for (let guard = 0; guard < 100000; guard++) {
    assign();
    // Gelijke buren samen, in één doorgang.
    const merged: Segment[] = [];
    for (const s of segs) {
      const last = merged[merged.length - 1];
      if (last && last.row!.id === s.row!.id) merged[merged.length - 1] = { ...last, bottom: s.bottom, zone: thick(last) >= thick(s) ? last.zone : s.zone };
      else merged.push(s);
    }
    if (merged.length < segs.length) { segs = merged; continue; }
    if (segs.length < 2) break;
    let thin = -1;
    segs.forEach((s, k) => { if (thick(s) < minT - 1e-9 && (thin < 0 || thick(s) < thick(segs[thin]))) thin = k; });
    if (thin < 0) break;
    const up = segs[thin - 1], down = segs[thin + 1], into = !down || (up && thick(up) >= thick(down)) ? thin - 1 : thin + 1;
    const keep = segs[into], s = segs[thin];
    segs.splice(Math.min(into, thin), 2, { top: Math.min(keep.top, s.top), bottom: Math.max(keep.bottom, s.bottom), zone: keep.zone });
  }
  const layers = segs.map((s, k): WallLayer => {
    const r = s.row!, kh = khRowFor(r, s.qcEntry!), delta = r.main === "veen" ? 0 : Math.round(((r.phi * 2) / 3) * 10) / 10;
    const values = { gamma: r.gamma, gammaSat: r.gammaSat, phi: r.phi, c: r.c, cu: r.cu, delta, kh: kh?.kh1 ?? 0, ...(kh?.kh2 && kh.kh3 ? { kh2: kh.kh2, kh3: kh.kh3 } : {}) };
    return {
      topNap: r2(k === 0 ? ground : ground - s.top), name: r.name, soilId: r.id, zone: s.zone, undrained: false, ...values,
      source: { cptId: cpt.id, zone: s.zone, depthTopM: r2(s.top), depthBottomM: r2(s.bottom), qcMeanMpa: r2(s.qc!), rfMeanPct: r2(s.rf!), sigmaVEffKpa: Math.round(s.sigma!), qcEntryMpa: r2(s.qcEntry!), rowId: r.id, khRowId: kh?.id ?? null, values },
    };
  });
  return { layers, warnings };
}

/** Kleur van een zone van de sondering, zoals in de sondeergrafiek en het paneel Grondopbouw. */
export const zoneColor = (zone: number | undefined): string | undefined => zones.find((z) => z.number === zone)?.color;

/** Zone bij een regel van tabel 2.b of een grondsoort uit de oude lijst, voor de kleur van handmatige lagen. */
export function zoneForSoil(id: string | undefined): number | undefined {
  const r = getTableRow(id);
  if (r) return r.main === "veen" ? 2 : r.main === "klei" ? (r.mix === "organisch" ? 2 : r.mix === "schoon" ? 3 : 4) : r.main === "leem" ? 4 : r.main === "grind" ? 7 : r.mix === "schoon" ? 6 : 5;
  if (!id) return undefined;
  if (id.startsWith("sand-clayey")) return 5;
  if (id.startsWith("sand")) return 6;
  if (id.startsWith("loam")) return 4;
  if (id.startsWith("clay")) return 3;
  if (id === "peat") return 2;
  return undefined;
}

/** Een voorgestelde waarde die de gebruiker heeft veranderd. */
export function overriddenKeys(l: WallLayer): string[] {
  const v = l.source?.values;
  if (!v) return [];
  const keys: Array<keyof typeof v> = ["gamma", "gammaSat", "phi", "c", "cu", "delta", "kh", "kh2", "kh3"];
  return keys.filter((k) => (l[k as keyof WallLayer] ?? undefined) !== (v[k] ?? undefined));
}
