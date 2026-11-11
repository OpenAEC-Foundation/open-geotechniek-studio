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
