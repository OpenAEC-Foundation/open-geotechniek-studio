// Sterkteklassen en materiaalfactoren voor de materiaaltoetsing.
// Uit kennis van de normen overgenomen, niet tegen de normtekst gelegd (zie VERIFICATIE.md):
// - beton: NEN-EN 1992-1-1 tabel 3.1 (fck), art. 2.4.2.4 en 3.1.6 met de Nederlandse bijlage
//   (γc = 1,5; γs = 1,15; αcc = 1,0);
// - betonstaal: B500 (fyk = 500 MPa);
// - constructiestaal: NEN-EN 1993-1-1 tabel 3.1, fy voor t ≤ 40 mm; γM0 = 1,0 (Nederlandse bijlage).
export const GAMMA_C = 1.5;
export const GAMMA_S = 1.15;
export const ALPHA_CC = 1.0;
export const GAMMA_M0 = 1.0;

export const CONCRETE_CLASSES: ReadonlyArray<{ id: string; fckMpa: number }> = [
  { id: 'C12/15', fckMpa: 12 }, { id: 'C16/20', fckMpa: 16 }, { id: 'C20/25', fckMpa: 20 }, { id: 'C25/30', fckMpa: 25 },
  { id: 'C30/37', fckMpa: 30 }, { id: 'C35/45', fckMpa: 35 }, { id: 'C40/50', fckMpa: 40 }, { id: 'C45/55', fckMpa: 45 }, { id: 'C50/60', fckMpa: 50 },
];
/** fcd = αcc · fck / γc, op twee decimalen (art. 3.1.6). */
export const designConcrete = (fckMpa: number) => Math.round(100 * ALPHA_CC * fckMpa / GAMMA_C) / 100;
export const concreteClassOf = (fckMpa: number, fcdMpa: number) => CONCRETE_CLASSES.find((c) => c.fckMpa === fckMpa && Math.abs(designConcrete(c.fckMpa) - fcdMpa) < 0.006)?.id ?? '';

export const REBAR_GRADES: ReadonlyArray<{ id: string; fykMpa: number }> = [{ id: 'B500', fykMpa: 500 }];
/** fyd = fyk / γs, afgerond op hele MPa (500 / 1,15 = 434,8 → 435). */
export const designRebar = (fykMpa: number) => Math.round(fykMpa / GAMMA_S);
export const rebarGradeOf = (fydMpa: number) => REBAR_GRADES.find((g) => designRebar(g.fykMpa) === fydMpa)?.id ?? '';

export const STEEL_GRADES: ReadonlyArray<{ id: string; fyMpa: number }> = [
  { id: 'S235', fyMpa: 235 }, { id: 'S275', fyMpa: 275 }, { id: 'S355', fyMpa: 355 }, { id: 'S420', fyMpa: 420 }, { id: 'S460', fyMpa: 460 },
];
export const steelGradeOf = (fydMpa: number) => STEEL_GRADES.find((g) => g.fyMpa / GAMMA_M0 === fydMpa)?.id ?? '';
