// Omzettingen bij het inlezen van een opgeslagen sondering: gegevens die eerder in een andere vorm
// werden bewaard, komen in de vorm die de app nu gebruikt. Een sondering waar niets aan om te zetten
// valt, komt ongewijzigd terug.
import type { Cpt } from "./cpt";
import { migrateDissipation } from "../dissipatie/migrate";
import { migrateScanCpt } from "../digitaliseren/migrate";

export const migrateCpt = (cpt: Cpt): Cpt => migrateScanCpt(migrateDissipation(cpt));
