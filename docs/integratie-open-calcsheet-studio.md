# Geotechniek in Open CalcSheet Studio — voorstel

Dit is het voorstel om de rekenmodules van Open Geotechniek Studio (OGS) als bladsoort
"Geotechniek" in Open CalcSheet Studio (OCS) op te nemen. OGS levert het pakket
`@openaec/geotechniek-core`; OCS bouwt de bladsoort. In de OCS-repository is hiervoor nog
niets gebouwd.

## Uitgangspunten

- **Eén rekenkern.** Het pakket bundelt de modules van de OGS-app zelf
  (`apps/desktop/src/calc/modules/*/headless.ts`). OCS rekent dus met dezelfde
  standaardwaarden, getallen, toetsen en rapporten als de app. `packages/core/test/parity.json`
  legt dat vast: de testsuite van de app rekent het uit, de tests van het pakket controleren
  het gebouwde pakket ertegen.
- **In-process, browser én Node.** `dist/browser.mjs` heeft geen Node-imports en draait in de
  Tauri-webview en de platformbouw; `dist/index.mjs` draait in Node (de rekendienst zonder
  venster). `package.json` kiest via `exports` (`browser` / `node`) zelf de juiste.
  Er is geen netwerk nodig: de vertalingen zitten in het pakket en het sonderingsrapport
  tekent de overzichtskaart standaard zonder luchtfoto.
- **Synchroon rekenen.** `compute()` en `reportSync()` zijn synchroon; alleen het
  sonderingsrapport (`cptReport`) is async. Dat past bij de synchrone `evaluate` van OCS.
- **Beta release.** Elke module meldt `status: "Beta release"`; de rapporten dragen het label
  "BETA RELEASE". OCS toont dat ook bij het blad.

## Datamodel van het blad

Een blad van de soort Geotechniek bewaart:

```ts
interface GeoBlad {
  moduleId: string;        // "pile-bearing-capacity", "tension-pile", ...
  moduleVersion: string;   // versie van @openaec/geotechniek-core bij het laatst opslaan, bv. "2026.48.2"
  inputVersion: number;    // invoerversie van de module (nu 1)
  input: unknown;          // de invoer van de module: JSON volgens moduleSchema(moduleId)
  cpts: Cpt[];             // de sonderingen als snapshot (parseDocument), niet als bestandspad
  calculations?: Array<{ id: string; moduleId: string; name: string; input: unknown }>; // alleen funderingsadvies
  /** Vastgelegd antwoord, zoals de toetsblokken van OCS: op een hash van (moduleId, inputVersion, input, cpts). */
  vastgelegd?: { hash: string; status: ComputeResult["status"]; checks: ComputeResult["checks"]; governingUc: number | null; passes: boolean | null };
}
```

`newCalculation(moduleId, { cpts })` maakt precies dit object (zonder `vastgelegd`).
In het projectbestand wordt dit een eigen attribuut naast de bestaande bladsoorten, bijvoorbeeld
`ocss::blad::geotechniek` in `core/src/ifcx/namespace.ts` (`ATTR`). Sonderingen gaan als JSON-snapshot
mee, zodat een blad op elke machine en in de platformbouw zonder bronbestanden opnieuw rekent.
Let op de omvang: een snapshot bewaart alle bronkolommen en metadata; een GEF van 1000 regels
wordt ongeveer 0,5 MB JSON. Bewaar een sondering daarom één keer per project en verwijs er vanuit
de bladen naar met haar `id` (dezelfde sondering in meerdere bladen), of bewaar de GEF-tekst en
geef `{content, filename}` door; het pakket accepteert beide. Het rapport-PDF wordt niet bewaard: het is
uit de invoer terug te maken. Wie een vaste uitdraai wil bewaren, kan het PDF als PDF-blad
(`PdfBijlage`, base64) vastzetten.

## Aanroepen

```ts
import {
  listModules, moduleSchema, newCalculation, migrateInput,
  compute, reportSync, cptReport, parseDocument,
} from "@openaec/geotechniek-core";

// Blad toevoegen: kies een module, lees sonderingen in.
const modules = listModules({ lang: "nl" });            // keuzelijst: label, norm, cpts ("none" | "defaults" | "required" | "project")
const cpt = parseDocument(gefTekst, "S01.gef");
const blad = newCalculation("tension-pile", { cpts: [cpt] });

// Invoerscherm: genereer de velden uit het schema (titel, beschrijving, x-unit, default, enum).
const schema = moduleSchema(blad.moduleId, { lang: "nl" });

// Rekenen (synchroon) en de kernuitkomsten tonen.
const r = compute(blad.moduleId, blad.input, { cpts: blad.cpts, project, lang: "nl" });
// r.status.text      "u.c. 0,51"                  -> onderkop van het blad
// r.checks           [{label, value, uc, passes}] -> toetsoverzicht
// r.governingUc      0.51, r.passes true          -> Resultaat.uc en Resultaat.voldoet van OCS
// r.validation       {valid, errors}              -> invoerfouten bij het veld tonen

// Rapport: de PDF van de module, in de huisstijl van het project.
const pdf: Uint8Array = reportSync(blad.moduleId, blad.input, {
  cpts: blad.cpts, project: { title, project_number, author, date }, lang: "nl",
  brand: { organization: "Bureau", accent: [0, 90, 160], logoDataUrl },
});
const sonderingen: Uint8Array = await cptReport(blad.cpts, { project });
```

`project` is `{title, client, location, project_number, author, date}`; OCS vult het uit zijn eigen
projectgegevens. `lang` volgt de taal van de uitdraai (`nl en de fr es it pt pl da sv`).

## Versiebeheer en oude invoer

- `moduleVersion` is de pakketversie (= OGS-versie, calver). Die zegt met welke versie een
  blad het laatst is doorgerekend; OCS kan bij openen melden dat het pakket nieuwer is en de
  gebruiker laten kiezen om opnieuw te rekenen, net als bij een verouderde module (`bronVersie`).
- `inputVersion` verandert alleen als een invoerveld van betekenis verandert. Bij openen:
  ```ts
  const { input, inputVersion, notes } = migrateInput(blad.moduleId, blad.input, blad.inputVersion ?? 1, { cpts: blad.cpts });
  ```
  Dat past toekomstige migraties toe en vult ontbrekende verplichte velden uit de standaard
  (`notes` zegt welke). Optionele velden hebben in de modules zelf een vastgelegde standaard,
  dus invoer van oudere OGS-versies rekent zonder migratie. Een `inputVersion` die nieuwer is
  dan het pakket geeft een fout: dan moet OCS het pakket bijwerken.
- Onbekende velden laat het schema toe (geen `additionalProperties: false`), zodat invoer van
  een nieuwere OGS-versie niet zomaar wordt geweigerd; `validation` meldt alleen fouten in
  bekende velden.

## Wat OCS moet bouwen

Volgens `docs/bladsoorten.md` van OCS ("Wat er verder bij hoort") en de huidige code:

1. **Opslag** `store/geotechniek.ts` met `GEO_BLAD`, `isGeoBlad` en `leesGeo(x: unknown)` (defensief
   lezen: ontbrekende velden uit `newCalculation`, onbekende weg), het veld op `Exemplaar`,
   `isLosBlad`, `normaliseerExemplaar` en het attribuut in `core/src/ifcx` (schrijven, lezen, step).
   Dit bestand moet zonder waarde-imports in Node laden; het pakket zelf alleen dynamisch importeren
   in het rekendeel.
2. **Bladsoort** in `SOORTEN` (`components/calc/bladSoorten.tsx`): `soortTekst` = de modulenaam
   (`listModules({lang})`), `useOnderkop` = `status.text`, en `Afdruk` = de PDF-pagina's van
   `reportSync`. Daarvoor kan het bestaande `PdfPaginas` van het PDF-blad hergebruikt worden met
   `{ bestandsnaam, data: base64(pdf) }`. De pagina's komen dan net als bij het PDF-blad als beeld
   op 144 dpi in het rapport. Een eigen afdrukonderdeel in HTML is niet nodig: het rapport van de
   module heeft zijn eigen kop en paginering.
3. **Resultaat-haak.** Een aangemelde bladsoort geeft nu altijd `uc: null, voldoet: null`. Nodig is
   een haak, bijvoorbeeld `resultaat?(ex): Resultaat`, die `governingUc` en `passes` uit het
   vastgelegde antwoord teruggeeft, zodat het toetsoverzicht van het rapport, het
   berekeningenpaneel en de MCP-lijst de geotechnische UC's tonen.
4. **Invoerscherm** gegenereerd uit `moduleSchema` (getal met `x-unit`, `enum` als keuzelijst,
   `boolean` als vinkje; geneste objecten en lijsten als JSON-editor of als eigen paneel voor de
   grondopbouw). Sonderingen toevoegen met `parseDocument` (GEF/JSON) en kiezen welke het blad
   gebruikt (`input.cptId`).
5. **Rekenen en vastleggen**: bij elke wijziging `compute` (synchroon; in Node 1–10 ms voor de
   meeste modules, ongeveer 0,1 s voor de horizontale paal en 0,2 s voor de damwand)
   en het antwoord vastleggen in het blad, op een hash van de invoer, zoals de toetsblokken dat
   doen. Het rapport pas maken bij het afdrukken.
6. **MCP**: `bladSoort()` in `mcp/tools/hulp.ts` kent `kind: "geotechniek"`; een tool
   `sheet_add_geotechniek {moduleId, input?, cpts?}` en een tak in `sheet_set_input` die een
   JSON-patch op `input` zet en tegen `moduleSchema` controleert. De bestaande tools werken op
   rekentekst en weigeren nu losse bladen.
7. **Vertalingen** in `werkruimte.json` en `rapport.json` en een controlescript
   `scripts/check-geotechniek.mjs` zoals bij de andere soorten.

## Minimaal voorbeeld

```ts
// store/geotechniek.ts (zonder waarde-imports van het pakket)
export const GEO_BLAD = "geotechniek";
export interface GeoBlad { moduleId: string; moduleVersion: string; inputVersion: number; input: unknown; cpts: unknown[] }
export function leesGeo(x: unknown): GeoBlad | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.moduleId !== "string") return null;
  return { moduleId: o.moduleId, moduleVersion: String(o.moduleVersion ?? ""), inputVersion: Number(o.inputVersion ?? 1),
    input: o.input ?? {}, cpts: Array.isArray(o.cpts) ? o.cpts : [] };
}

// rekenen/geotechniek.ts
export async function rekenGeo(blad: GeoBlad, project: ProjectKop, taal: string) {
  const geo = await import("@openaec/geotechniek-core");
  const { input } = geo.migrateInput(blad.moduleId, blad.input, blad.inputVersion, { cpts: blad.cpts as never });
  const r = geo.compute(blad.moduleId, input, { cpts: blad.cpts as never, project, lang: taal });
  return { uc: r.governingUc, voldoet: r.passes, onderkop: r.status?.text ?? "", toetsen: r.checks, fouten: r.validation.errors };
}
export async function geoPdf(blad: GeoBlad, project: ProjectKop, taal: string): Promise<string> {
  const geo = await import("@openaec/geotechniek-core");
  const bytes = geo.reportSync(blad.moduleId, blad.input, { cpts: blad.cpts as never, project, lang: taal });
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin); // als PdfBijlage.data naar PdfPaginas
}
```

## Andere ontsluitingen

Wie liever een proces gebruikt dan een in-process pakket: hetzelfde contract bestaat als
HTTP API v2 (`npx ogs serve`; `GET /modules`, `GET /modules/{id}/schema`,
`POST /modules/{id}/compute`, `POST /modules/{id}/report`, `POST /cpt/report`, beschreven in
`GET /openapi.json`), als MCP-server (`npx ogs mcp`) en als opdrachtregel (`ogs compute`,
`ogs report`). Zie `packages/core/README.md`.

## Beperkingen

- De figuren van het 3D-grondmodel in het funderingsadvies vragen WebGL: in de webview komen ze
  mee, in Node (de rekendienst zonder venster) niet.
- Huisstijlbeelden moeten PNG of JPEG als data-URL zijn.
- Het pakket is groot (ongeveer 7 MB, niet verkleind): jsPDF, three.js, i18next en de vertalingen
  van tien talen. Dynamisch importeren houdt het buiten de opstartbundel van OCS.
- Reken- en rapportteksten zijn deels alleen in het Nederlands, zoals in de app.
- De taalkeuze schakelt tijdens een aanroep de taal van de gedeelde i18next-instantie van het
  pakket; het pakket zet die daarna terug. Gebruikt OCS zelf ook i18next, dan heeft het pakket
  toch een eigen instantie (gebundeld), dus dat raakt OCS niet.
