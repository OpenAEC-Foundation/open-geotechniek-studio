import { ct } from '../../i18n';
/** CUR C166 deel 1, tabel 3.3: uitsluitend eerste secanttraject.
 * Lokale BRIS-afdruk: publicatiedatum 2008, PDF p.25, figuur3.2/tabel3.3.
 * Wandbedding; geen impliciete driedimensionale correctie voor losse palen.
 */
export const SOIL_SPRINGS = [
  {id:'sand-loose',label:'Zand · los (qc circa 5 MPa)',low:12000,high:27000},
  {id:'sand-medium',label:'Zand · matig (qc circa 15 MPa)',low:20000,high:45000},
  {id:'sand-dense',label:'Zand · vast (qc circa 25 MPa)',low:40000,high:90000},
  {id:'clay-soft',label:'Klei · slap (cu circa 25 kPa)',low:2000,high:4500},
  {id:'clay-medium',label:'Klei · matig (cu circa 50 kPa)',low:4000,high:9000},
  {id:'clay-stiff',label:'Klei · vast (cu circa 200 kPa)',low:6000,high:13500},
  {id:'peat-soft',label:'Veen · slap (cu circa 10 kPa)',low:1000,high:2250},
  {id:'peat-medium',label:'Veen · matig (cu circa 30 kPa)',low:2000,high:4500},
] as const;
/** Vertaalsleutel van een grondsoort, b.v. 'sand-loose' → 'soils.sandLoose'. */
export const soilKey = (id: string) => `soils.${id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())}`;
export function springValue(id:string,scenario:'low'|'high') {
  const v=SOIL_SPRINGS.find(s=>s.id===id);
  if(!v||!['low','high'].includes(scenario)) throw new Error(ct('calcLateral', 'errors.unknownSpring', 'Onbekende bedding of scenario.'));
  return v[scenario];
}

/** Reologische factor α van Ménard per grondsoort (normaal geconsolideerd): veen 1, klei 2/3, silt 1/2, zand 1/3, grind 1/4. */
export const MENARD_ALPHAS = [
  { id: 'peat', alpha: 1 }, { id: 'clay', alpha: 2 / 3 }, { id: 'silt', alpha: 1 / 2 }, { id: 'sand', alpha: 1 / 3 }, { id: 'gravel', alpha: 1 / 4 },
] as const;
/**
 * Horizontale beddingsconstante k_h [kN/m³] van een paal uit de pressiometermodulus E_p van Ménard [kN/m²], de
 * paalbreedte D [m] en de reologische factor α, met R = D/2 en R0 = 0,3 m:
 *   R ≥ R0: 1/k_h = (1 / (3 E_p)) · (1,3 R0 (2,65 R / R0)^α + α R)
 *   R < R0: 1/k_h = (2 R / E_p) · (4 · 2,65^α + 3 α) / 18
 * Bron: Ménard (pressiometer), zoals voor palen opgenomen in CUR 166 deel 1; uit kennis van die publicatie
 * overgenomen en niet tegen de tekst gelegd. De lijnveer is k_h × D.
 */
export function menardKh(epKpa: number, widthM: number, alpha: number): number {
  if (!(Number.isFinite(epKpa) && epKpa > 0 && Number.isFinite(widthM) && widthM > 0 && Number.isFinite(alpha) && alpha > 0 && alpha <= 1))
    throw new Error(ct('calcLateral', 'errors.menardInput', 'Ménard: vul een positieve E_p, paalbreedte en α (0 tot 1) in.'));
  const R = widthM / 2, R0 = 0.3;
  return R >= R0 ? 3 * epKpa / (1.3 * R0 * Math.pow(2.65 * R / R0, alpha) + alpha * R)
    : epKpa * 18 / (2 * R * (4 * Math.pow(2.65, alpha) + 3 * alpha));
}
