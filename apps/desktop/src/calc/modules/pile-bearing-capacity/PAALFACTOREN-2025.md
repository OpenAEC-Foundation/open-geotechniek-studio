# Paalklassefactoren NEN 9997-1:2025

Stand: 20 november 2026, opnieuw gezocht op 28 november 2026. Dit document legt vast wat er over de
paalklassefactoren van NEN 9997-1:2025 (actueel: NEN 9997-1:2025+C1:2025,
tabel 7.c en 7.c.1) in openbare bronnen te vinden is, en wat niet.

## Uitkomst in één alinea

De getallen van tabel 7.c:2025 staan in geen enkele openbare bron die is
geraadpleegd. Openbaar zijn alleen beschrijvingen van de wijzigingen (welke
factor omlaag ging, welke regel verviel) en één losse tabelwaarde. De tabel
in de code (`factors-2025.ts`) is daarom **leeg**: er is niets geschat en
niets uit de editie 2017 overgenomen. De editie 2025 is in de invoer te
kiezen, maar rekent alleen met projectfactoren (zelfverklaring of
proefbelasting). De editie 2017 blijft de standaard voor nieuwe
berekeningen.

## Aanvullen uit de norm

Alles staat in één tabel: `FACTORS_2025` in `factors-2025.ts`. Vul per
paaltype alle velden in en noem de vindplaats:

```ts
"concrete-prefab-prestressed-driven": {
  alphaP: …, alphaS: …, alphaT: …, beta: …, s: …, settlementLine: …,
  source: "tabel 7.c, rij …",
},
```

- Een regel telt pas als hij volledig is; een halve regel wordt nooit
  gebruikt om mee te rekenen.
- Zodra een regel volledig is, is het paaltype bij de editie 2025 te kiezen
  en vervalt voor dat type de oude 2 MPa-begrenzing van qc;III.
- Zijn alle typen uit `COMMON_TYPES_2025` volledig, dan wordt 2025 vanzelf
  de standaard voor nieuwe berekeningen (`defaultStandard()`).
- Voor één project kan het ook zonder de tabel: projectfactoren
  (`projectFactors`) met editie 2025 en een bron.

## Wat ontbreekt (uit de norm aan te leveren)

Per paaltype: αp, αs, αt, β, s en de lastzakkingslijn.

| Paaltype (id in de catalogus) | αp | αs | αt | β, s | Lastzakkingslijn |
|---|---|---|---|---|---|
| Prefab betonpaal, geheid (`concrete-prefab-prestressed-driven`, `concrete-prefab-round`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Stalen buispaal, gesloten punt, geheid (`steel-pipe-driven-closed-2017`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Vibropaal, mantelbuis terugheiend of trillend getrokken (`concrete-driven-casing-hammered`, `concrete-driven-casing-vibrated`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Schroefpaal met verloren punt, getrokken buis (`concrete-screw-displacement`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Schroefpaal met verloren punt, blijvende stalen buis (`steel-screw-permanent-casing`) | ontbreekt | ontbreekt | zie hieronder | ontbreekt | ontbreekt |
| Schroefinjectiepaal (`steel-screw-grout`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Grondverdringende schroefpaal (`concrete-screw-soil-displacing`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| DPA-paal, verbuisde avegaarpaal (`concrete-auger-cased`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Avegaarpaal (`concrete-auger`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Boorpaal (`concrete-bored`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |
| Houten paal (`timber-uniform`) | ontbreekt | ontbreekt | ontbreekt | ontbreekt | ontbreekt |

Ook niet gevonden: tabel 7.d (αs in klei) van 2025, en of γm en de
limietwaarden per artikel ongewijzigd zijn. De module laat γm = 1,20 als
bewerkbare invoer staan; dat is geen bevestigde 2025-waarde.

## Wat wel is gevonden

### Eén tabelwaarde

| Waarde | Bron | Plaats | Opgenomen in de code? |
|---|---|---|---|
| αt = 0,0045 voor de geschroefde stalen paal (type S5); de eerste druk vermeldde abusievelijk 0,045, hersteld in C1:2025 | NEN, vragen en antwoorden bij de herziene versie: https://www.nen.nl/nieuws/bouw/herziene-versie-nen-9997-1/ | onderdeel "Drukfout in tabel 7.c" | Nee. Eén waarde maakt geen volledige regel, en de bron zegt niet welke tabelrij "S5" precies is. Vermoedelijk de stalen schroefpaal met constante dwarsafmeting boven de schroefpunt (`steel-screw-permanent-casing`); bij het aanvullen uit de norm controleren. |

### Waarden uit een rekenrapport (geen normtekst)

Referentie-rapport 984 (externe referentie-berekening van 26 mei 2026, blad 1
en 24) noemt als gehanteerde norm NEN 9997-1:2025+C1:2025 en drukt voor
"stalen paal, constante dwarsafmeting, buis met gesloten punt, geheid" af:
αp = 0,70, αs = 0,008, αt = 0,006, lastzakkingslijn 1, met β = s = 1,0 in de
uitwerking. Dat past bij de beschreven verlaging van de schachtfactoren voor
deze paal (2017: αs 0,010, αt 0,007), maar het is de uitvoer van een
rekenprogramma, niet de normtekst. Niet in `FACTORS_2025` opgenomen; het
bestaande paaltype `steel-pipe-driven-closed` rekent al met deze set als
"bestaand projectmodel".

### Gezocht op 28 november 2026, zonder nieuwe waarden

- Normenmap `Z:/20_knowhow/Normen/` en `C:/Users/rickd/Documents` (alleen
  gelezen): alleen NEN 9997-1:2016+C2:2017 en een oudere uitgave, geen 2025.
- Openbaar internet, twee zoekopdrachten naar tabel 7.c:2025 en de waarden
  voor de gesloten stalen buispaal: alleen de al genoemde beschrijvingen
  (onder meer https://kivi.nl/en/communities/departments/geotechnics/news/herziene-versie-nen-9997-1-2025)
  en leveranciersgebonden zelfverklaringen; geen tabelwaarden.

### Beschreven wijzigingen (zonder getallen)

| Onderwerp | Wat de bron zegt | Bron en plaats |
|---|---|---|
| Voorrang zelfverklaring | De tabelwaarden gelden alleen voor paaltypen zonder zelfverklaring volgens NEN 7201; een zelfverklaring gaat voor | Vakblad Geotechniek, juni 2025, p. 37, "Paalklassefactoren en NEN 9997-1:2025": https://www.vakbladgeotechniek.nl/files/GEO2025-02-P37-Normen-en-Waarden.pdf ; NEN: https://www.nen.nl/nieuws/bouw/herziene-versie-nen-9997-1/ |
| Prefab beton | Schachtwrijving niet verlaagd; de omtrek blijft 4 × de zijde | Vakblad Geotechniek (als boven), laatste kolom; NEN-pagina (als boven), onderwerp "Bepaling paalomtrek", 7.6.2.3 (b) |
| Geheide stalen buispaal, gesloten voet (S1) | Schachtfactoren verlaagd na proefbelastingen; voetplaat maximaal 10 mm buiten de buis | Vakblad Geotechniek (als boven); NEN-pagina (als boven) |
| Geschroefde stalen paal (S5) | Schachtfactoren niet verlaagd; nieuw: voetplaat maximaal 10 mm buiten de buis (tabel 7.c.1) | NEN-pagina (als boven) |
| Schroefinjectiepaal | Puntfactor verlaagd; de tabelwaarde ligt lager dan de waarde uit de proeven | Vakblad Geotechniek (als boven); https://www.nen.nl/nieuws/actueel/aangepaste-paalklassefactoren-in-nieuwe-versie-nen-9997-1-2025/ |
| Avegaarpaal | Puntfactor verlaagd tot dezelfde waarde als de schroefinjectiepaal; de reductie van qc;III tot 2 MPa is vervallen | Vakblad Geotechniek (als boven); NEN-pagina (als boven), onderwerp "Avegaarpalen" |
| Grondverdringende schroefpalen en DPA | Nieuwe categorie in tabel 7.c: grondverdringend element met een avegaar erboven of eronder; voor deze systemen bestaan landelijke zelfverklaringen die vóór de tabel gaan | Vakblad Geotechniek (als boven); https://www.wiertsema.nl/nieuws/actuele-nieuwsberichten/nieuwe-versie-nen-9997-12025-gepubliceerd-%E2%80%93-belangrijke-wijzigingen-in-paalklassefactoren ; https://www.cementonline.nl/paalklassefactoren-aangepast-in-nieuwe-nen-9997-1 |
| Limietwaarden | Onderzoek naar afsnuit- en limietwaarden is doorgeschoven; een presentatie van november 2025 noemt bij de standaardmethode nog 12 en 15 MPa | Vakblad Geotechniek (als boven); presentatie Geotechniekdag 2025, dia 11: https://kivi.nl/_Resources/Persistent/c/5/e/2/c5e2fd9497acd2ca18df2531501a8196c199eb8b/Geotechniekdag%202025%20Maarten%20Profittlich%20Fugro.pdf |
| Status | Gepubliceerd juni 2025; begin 2026 nog niet aangewezen in de bouwregelgeving | https://www.aannemervak.nl/bedrijfsvoering/bouwregelgeving/herziene-nen-norm-scherpt-eisen-voor-paalfunderingen-aan/ |

Van deze wijzigingen is er één in de code verwerkt, en alleen als gevolg
van een volledige tabelregel of van projectfactoren 2025: de 2 MPa-grens
voor qc;III bij de avegaarpaal vervalt.

### Waarden die geen tabelwaarde zijn

Deze zijn gevonden maar horen niet in de tabel:

- Schroefinjectiepaal, αp = 0,35 in plaats van 0,63: een resultaat uit
  proefbelastingen, getoond op de Funderingsdag 2024
  (http://funderingsdag.nl/wp-content/uploads/2024/11/Jan-van-Dalen-.pdf).
  Volgens het vakbladartikel ligt de tabelwaarde van 2025 daaronder.
- Leveranciersgebonden waarden uit zelfverklaringen (bijvoorbeeld voor een
  schroefpaalsysteem: αp = 0,12 en αs = 0,014 of 0,0076 afhankelijk van de
  puntdiameter, Geotechniek 4-2025). Die gelden alleen voor dat systeem en
  die leverancier; in de module voer je ze in als projectfactoren.

## Geraadpleegd zonder resultaat

Het register met zelfverklaringen bij NEN
(https://www.nen.nl/certificatie-en-keurmerken-funderingspalen) gaf geen
inhoud; de kennisbank van CROW (Handboek Funderingen, A 3400) toont nog de
waarden van vóór 2017; enkele vakbladartikelen en whitepapers staan achter
een betaalmuur of waren niet op te halen.

## Editie 2017 als vergelijking

De factoren van de editie 2017 in `catalog.ts` zijn gecontroleerd tegen
tabel 7.c van NEN 9997-1:2016+C2:2017. Daaruit komt ook de rij voor het
nieuwe paaltype `steel-screw-permanent-casing` (stalen paal, geschroefd,
constante dwarsafmeting boven de schroefpunt: αp 0,56, αs 0,006, αt 0,0045,
lastzakkingslijn 1). De grondverdringende schroefpaal en de DPA-paal hebben
in 2017 geen eigen rij; die rekenen alleen met projectfactoren.
