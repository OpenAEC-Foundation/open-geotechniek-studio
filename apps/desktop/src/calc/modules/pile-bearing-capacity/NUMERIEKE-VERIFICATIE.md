# Numerieke verificatie

Trajectgemiddelden gebruiken een cumulatieve trapeziumintegraal met binaire
zoekacties naar de trajectgrenzen. Opbouw kost O(n); elk gemiddelde O(log n).
De index wordt per berekening opgebouwd zodat gewijzigde meetgegevens direct
worden verwerkt. Meetpunten moeten op diepte zijn gesorteerd.

Voor de schachtweerstand worden beide geïnterpoleerde segmentgrenzen gebruikt.
Een lineair qc-profiel geeft daardoor hetzelfde gemiddelde bij grove en fijne
meetpuntafstand. De bestaande laagbegrenzingen en paalfactoren blijven gelden.

Prestatieproef: `node apps/desktop/scripts/benchmark-pile.mjs` vanuit de
repository-hoofdmap. De proef meet alleen de puntberekening met 30.001
synthetische meetpunten, drie opwarmrondes en de mediaan van vijftien metingen.
Op de ontwikkelmachine daalde de mediaan van 26,3 naar 1,9 ms. Dit is geen
garantie voor dezelfde versnelling van de volledige applicatie.

## Trajectkeuze bij de puntweerstand (art. 7.6.2.3(e))

Stand: 28 november 2026. Getoetst in `trajectory-choice.test.ts`.

### Wat de norm vraagt

NEN 9997-1:2016+C2:2017, art. 7.6.2.3(e), nagelezen in de normtekst:

- traject I loopt van de paalpunt tot 0,7 à 4 Deq eronder; het eindpunt moet
  binnen die grenzen zo zijn gekozen dat qb;max minimaal is;
- traject II loopt van het eindpunt van traject I naar boven tot de paalpunt;
  de in rekening te brengen qc is nooit hoger dan de eronder liggende waarde;
- traject III loopt van de paalpunt naar boven tot 8 Deq; idem, beginnend
  met de laagste in rekening gebrachte waarde van traject II (avegaarpaal:
  begin ten hoogste 2 MPa);
- qb;max ten hoogste 15 MPa; in grind qc boven 20 MPa afsnuiten op 20 MPa
  (art. 7.6.2.3(l)), na de correcties voor overconsolidatie (j) en
  ontgraving (k).

Een begrenzing van traject II op qc;I staat niet in de tekst, en ook geen
afsnuiten van qc op 15 MPa in de trajecten I en II.

### Wat de module doet

Eén procedure in `parts/base-resistance.ts` met de afkapregels hierboven
(`QcProfile.walkUp`). Alle profielen (1991, 2006, 2012, 2017 en het bestaande
projectmodel) kiezen het eindpunt van traject I bij de kleinste qb;max, zoals de
normtekst vraagt (`minimum-qb`, de standaard; sinds 29 november 2026 ook voor
2017). De keuze bij de kleinste qc;I (`legacy-qci`) blijft alleen ter
vergelijking: ligt qb;max daarmee meer dan 1 % hoger, dan meldt de uitvoer ter
informatie de kritieke diepte en Rb;cal;max van die keuze, met de opmerking dat
sommige referentieberekeningen zo kiezen en dat die keuze de norm niet volgt.

Kandidaten: stappen van 0,01 Deq, beide grenzen en de meetpunten daartussen.
Niet geïmplementeerd: de correcties (j), (k) en (l); de invoer moet dan al
gecorrigeerde qc bevatten.

Gewijzigd op 28 november 2026: traject II begon op
min(gemeten qc, qc;I;gem). Dat staat niet in de norm; nu begint traject II bij
de gemeten qc. Dat ligt ook dichter bij de referentie (S1: 17,73 MPa
referentie, 17,59 oud, 17,75 nieuw).

### Waarom de eerdere proef 367 kN gaf tegen 419 kN

Sondering S1 uit referentie-rapport 984, paalpunt NAP −14,50 (14,50 + 0,84 =
15,34 m onder maaiveld), Deq = 219 mm, αp = 0,70, Ab = 37 668 mm².

De gemeten qc onder de punt: circa 18-21 MPa tot 15,5 m, 21-24 MPa tot 15,9 m,
dan een dunne zwakke laag met 12,8-13,0 MPa op 16,09-16,16 m (3,4-3,8 Deq onder
de punt), daarna weer 15-29 MPa.

| Eindpunt traject I | qc;I | qc;II | qc;III | qb;max | Rb;cal;max |
|---|---:|---:|---:|---:|---:|
| 0,7 Deq | 17,97 | 17,75 | 13,79 | 11,08 | 417 kN |
| 2,6 Deq | 20,61 | 20,10 | 13,79 | 11,95 | 450 kN |
| 3,4 Deq | 19,92 | 13,32 | 12,29 | 10,12 | 381 kN |
| 4,0 Deq | 18,91 | 12,77 | 11,97 | 9,73 | 367 kN |
| Referentie (blad 2-3) | 17,97 | 17,73 | 13,91 | 11,12 | 419 kN |

Waarden in MPa, eigen berekening uit `121882_1.gef` (gecorrigeerde diepte).

- De referentie hoort bij het eindpunt 0,7 Deq: qc;I = 17,97 MPa is daar exact
  het gemiddelde, en qc;II = 17,73 past bij een traject II dat bij de gemeten
  qc begint (17,75).
- Bij 0,7 Deq is qc;I het kleinst, maar qb;max niet: trekt het eindpunt door de
  zwakke laag, dan zakt het lopende minimum van traject II naar 12,8 MPa en
  daarmee ook traject III. Het minimum van qb;max ligt op de rand, 4,0 Deq:
  367 kN.
- De afkapregel van traject II verklaart het verschil niet: op 4,0 Deq geeft
  begrenzen op qc;I hetzelfde (12,77 MPa). De startregel van traject III ook
  niet. Voorboren speelt niet (geen voorboring, ontgraving op maaiveld). De
  stapgrootte ook niet: het minimum ligt op de rand en qb;max loopt tussen
  2,6 en 4,0 Deq gelijkmatig af.

Conclusie: de referentie kiest het eindpunt van traject I bij het kleinste
qc;I, niet bij het kleinste qb;max. Dat volgt de editie 2017 niet. Het
referentie-rapport noemt NEN 9997-1:2025+C1:2025; de tekst van die editie is
niet beschikbaar, dus of de regel daar is veranderd, is niet nagegaan.

### Vergelijking per referentiegeval (984)

Rb;cal;max in kN. Voor = module vóór 28 november 2026 (minimum qc;I, traject II
begrensd op qc;I); qc;I-keuze = minimum qc;I met de afkapregels van de norm
(standaard van 28 november 2026, nu alleen ter vergelijking); norm = minimum
qb;max, de standaard sinds 29 november 2026.

| Geval | Referentie | Voor | qc;I-keuze | Norm (standaard) | Kritieke diepte qc;I / norm |
|---|---:|---:|---:|---:|---|
| S1 | 419 | 416,1 | 417,2 | 366,6 | 0,70 / 4,00 Deq |
| S2 (punt NAP −17,00) | 265 | 265,0 | 265,0 | 264,9 | 1,77 / 1,74 Deq |
| S3 | 320 | 317,9 | 317,9 | 317,7 | 3,70 / 3,52 Deq |
| S4 | 378 | 376,2 | 376,3 | 375,3 | 3,95 / 3,69 Deq |
| S5 | 341 | 343,0 | 343,0 | 342,7 | 1,68 / 1,51 Deq |
| S6 | 326 | 333,0 | 333,0 | 332,2 | 1,20 / 1,01 Deq |
| S7 | 243 | 248,7 | 250,2 | 250,2 | 0,70 / 0,70 Deq |
| S8 | 255 | 262,2 | 262,2 | 262,2 | 0,70 / 0,70 Deq |

Bij S6, S7 en S8 ligt qc;I al 0,3 MPa (2 %) boven de referentie, bij elke
keuze; dat zit in de meetgegevens of hun verwerking, niet in de trajectkeuze.
S7 haalt de 3 %-grens van `verification-984-profielen.test.ts` met 2,96 %
(voor: 2,3 %); de grens is niet verruimd.

Hoe de tests S1 toetsen: de standaard (normkeuze) wordt getoetst op de eigen,
normconforme waarden 18,91 / 12,77 / 11,97 MPa en 367 kN (veld `normConform` in
`verification-984.test.ts` en `verification-984-profielen.test.ts`). Dat is geen
onafhankelijke referentie: het referentie-rapport kiest anders. Daarom toetst
`verification-984.test.ts` S1 daarnaast met de keuze van de referentie
(`legacy-qci`) op 17,97 / 17,73 / 13,91 MPa en 419 kN; dat toont dat de
meetgegevens en de afkapregels gelijk zijn en alleen de trajectkeuze verschilt.
Voor S2 t/m S8 liggen beide keuzes binnen 1 % en blijven de bestaande
toleranties tegen de referentie gelden.

Eindanalyse met de gedigitaliseerde grondprofielen (7 sonderingen, niet-stijf):

| | Referentie | Voor | qc;I-keuze | Norm (standaard) |
|---|---:|---:|---:|---:|
| Rc;cal gemiddeld | 626 | 627,7 | 628,1 | 620,5 |
| Rc;d | 411 | 411,9 | 412,1 | 407,2 |
| Rc;net;d | 351 | 354,7 | 355,0 | 350,0 |
| UC | 0,92 | 0,913 | 0,913 | 0,926 |

Op projectniveau scheelt de normkeuze hier ruim 1 %, omdat S1 niet maatgevend
is. Per sondering scheelt het bij S1 12,5 %.

### Project 2321

Projectvergelijking van 14 oktober 2026 (`VALIDATIE-3BM.md`, referentiebladen van 25 november 2025; GEF-bestanden buiten de repository). Opnieuw
gerekend met dezelfde invoer en GEF-bestanden:

| Geval | Netto ref | Netto voor | Netto qc;I-keuze | Netto norm (standaard) | qc;I app / ref | Oorzaak van het verschil |
|---|---:|---:|---:|---:|---|---|
| OT-1 | 404 | 379,7 | 380,6 | 380,6 | 7,52 / 7 | schacht: Rs 458 tegen 506 kN |
| OT-2 | 291 | 272,1 | 272,1 | 272,0 | 7,04 / 7 | schacht: Rs 289 tegen 317 kN |
| OT-3 | 446 | 451,2 | 451,2 | 450,4 | 14,03 / 8 | punt hoger (qc;I), schacht lager; heft elkaar grotendeels op |
| OT-4 | 720 | 1129,3 | 1129,3 | 1109,4 | 27,78 / 15 | qc in traject I en II afgelezen als 15 MPa |
| VP-1 | 412 | 616,6 | 616,6 | 616,6 | 28,14 / 15 | idem; qb;max in beide gevallen op 15 MPa begrensd in de app |
| VP-2 | 248 | 388,5 | 388,9 | 388,9 | 23,96 / 15 | idem |
| VP-3 | 486 | 524,2 | 524,6 | 524,6 | 13,56 / 11 | qc-aflezing punt en schacht |
| VP-4 | 605 | 738,9 | 740,8 | 740,7 | 22,14 / 15 | qc afgelezen als 15 MPa |
| VP-5 | 372 | 399,7 | 399,9 | 399,9 | 13,88 / 14 | schacht: Rs 401 tegen 360 kN |
| VP-6 | 491 | 598,3 | 598,3 | 597,2 | 19,53 / 15 | qc 15 MPa; schacht 584 tegen 480 kN |

De trajectkeuze verklaart de afwijking bij 2321 niet: de normkeuze verandert de
netto draagkracht hooguit 1,8 % (OT-4), de rest minder dan 0,3 %. De grote
afwijkingen (+50 tot +57 %) komen uit de referentiebladen zelf: daar zijn qc;I
en qc;II met de hand afgelezen en op 15 MPa gezet, terwijl de gemeten
gemiddelden 22-28 MPa zijn. Art. 7.6.2.3(e) begrenst qb;max op 15 MPa, niet qc
in de trajecten I en II. Negatieve kleef is gelijk (binnen 0,01 kN), de
paalfactoren zijn als projectfactoren overgenomen (αp 0,67, αs 0,010), en de
ontgraving van 0,5 à 1 m wordt in geen van beide met art. 7.6.2.3(k)
gecorrigeerd. Bij de schacht verschillen de aflezing en de qc-begrenzing per
laag (referentie 12 of 15 MPa op de aflezing, app 15 MPa op het laaggemiddelde) en de laagindeling
(de fixture gebruikt één positieve laag). Geen tolerantie is aangepast.

### Wat nog open is

- Besluit 29 november 2026: de normkeuze is de standaard, ook voor 2017 en het
  bestaande projectmodel. Bij 984 wijkt S1 daardoor 12,5 % af van de
  referentie (367 tegen 419 kN); de projectuitkomst UC 0,926 tegen 0,92. Een
  onafhankelijke referentie met een zwakke laag tussen 0,7 en 4 Deq onder de
  punt die de normkeuze volgt, is er nog niet.
- De tekst van art. 7.6.2.3(e) in NEN 9997-1:2025 is niet nagelezen.
- De correcties voor overconsolidatie, ontgraving en grind (art. 7.6.2.3(j)
  t/m (l)) zitten niet in de puntberekening.

De 100 externe componentgevallen (`public-reference.test.ts`) toetsen
aangeleverde trajectgemiddelden en zijn door deze wijziging niet veranderd.

## Sterkte van de paal (optionele toets)

`parts/strength-check.ts` toetst de paal als constructie-element op
N_Ed;max = N_Ed + F_nk;d. De tests in `parts/strength-check.test.ts` rekenen
elke toets met de hand na (doorsnede, rekensterkte, weerstand, u.c.). Dat
bewijst dat de code de formule volgt, niet dat de formule de normtekst is:

**Geen van de onderstaande formules en tabelwaarden is tegen de normtekst
gelegd.** Ze komen uit kennis van de normen.

| Onderdeel | Formule of waarde | Vindplaats (niet nagelezen) |
|---|---|---|
| Staal, doorsnedeklasse buis | D/t ≤ 50 ε², 70 ε², 90 ε²; ε = √(235 / f_y) | NEN-EN 1993-1-1 tabel 5.2 |
| Staal, normaalkracht | N_c,Rd = A · f_y / γ_M0, γ_M0 = 1,0 | NEN-EN 1993-1-1 art. 6.2.4 en de Nederlandse bijlage |
| Staal, vloeigrens | f_y per staalsoort voor t ≤ 40 mm | NEN-EN 1993-1-1 tabel 3.1 |
| Hout, druk evenwijdig aan de vezel | σ_c,0,d ≤ f_c,0,d | NEN-EN 1995-1-1 art. 6.1.4 |
| Hout, rekenwaarde | f_c,0,d = k_mod · f_c,0,k / γ_M | NEN-EN 1995-1-1 art. 2.4.1 |
| Hout, standaardwaarden | k_mod = 0,50 (klimaatklasse 3, blijvend), γ_M = 1,3 | NEN-EN 1995-1-1 tabel 3.1 en 2.3 |
| Hout, sterkteklassen | f_c,0,k voor C14 t/m C30 en D24 t/m D70 | NEN-EN 338:2016 tabel 1 en 3 |
| Beton, normaalkracht | N_Rd = A_c · f_cd, f_cd = α_cc · f_ck / γ_c | NEN-EN 1992-1-1 art. 6.1 en 3.1.6 |

Keuzes van het programma, geen normwaarden: de standaardklassen (S235, C18,
C35/45 voor prefab en opzetter, C20/25 voor in de grond gevormde palen) en de
aanname dat N_Ed;max van de paalkop tot de onderkant van de negatieve kleef
constant is. Een eventuele bijzondere regel in de Nederlandse bijlage voor
houten funderingspalen is niet opgezocht.

Niet getoetst en als zodanig in de uitdraai vermeld: knik (de module kent geen
vrije of slap gesteunde lengte), doorsnedeklasse 4, corrosie, lassen en
koppelingen, de las van een betonopzetter, de wapening en de minimale
excentriciteit van beton, de verkleinde rekendiameter en de hogere γ_c voor in
de grond gevormde palen zonder blijvende buis, en de heispanningen.

## Gezaagde houten paal a × b

Oppervlak a · b, omtrek 2 (a + b), D_eq = √(4 · a · b / π): dezelfde regel als
voor de vierkante prefab paal (cirkel met gelijk oppervlak). De
paalklassefactoren zijn die van de ronde houten paal; dat is een aanname, de
tabel is er niet op nagelezen. De factor s voor de vorm van een rechthoekige
paalvoet (a ≠ b) zit niet in het programma: er wordt met de s van het paaltype
(1,0) of de projectfactor gerekend en de uitdraai meldt dat. De beginreeks
a × b in `standard-sizes.ts` is geen normreeks.

## Open stalen buispaal

Handberekening tegen NEN 9997-1:2016+C2:2017, tabel 7.c en art. 7.6.2.3(d) en (e); getoetst in `open-tube.test.ts`.

Invoer: buis Ø323,9 × 10 mm, paalpunt NAP −14,00, positieve schachtwrijving van NAP −8,00 tot de punt (ΔL = 6 m) in zand, synthetische sondering met overal q_c = 5 MPa, γ_m = 1,2, ξ = 1,39.

- q_b;max = ½ · 0,7 · 1 · 1 · ((5 + 5)/2 + 5) = 3,50 MPa (open en gesloten gelijk).
- A_vol = π/4 · 323,9² = 82 397,1 mm²; A_binnen = π/4 · 303,9² = 72 535,6 mm²; A_ring = 9 861,5 mm².
- R_s = π · 0,3239 · 6 · α_s · 5 · 1000 kN, met α_s = 0,006 (open) of 0,010 (gesloten).
- R_c;cal = R_b + R_s; R_c;d = R_c;cal / 1,39 / 1,2.

| Geval | A_b [mm²] | R_b [kN] | R_s [kN] | R_c;cal [kN] | R_c;d [kN] | Module | Verschil |
|---|---|---|---|---|---|---|---|
| Open, zonder prop | 9 861,5 | 34,52 | 183,16 | 217,68 | 130,50 | gelijk | < 0,05 kN |
| Open, met prop η = 0,5 | 46 129,3 | 161,45 | 183,16 | 344,61 | 206,60 | gelijk | < 0,05 kN |
| Open, met prop η = 1 | 82 397,1 | 288,39 | 183,16 | 471,55 | 282,70 | gelijk | < 0,05 kN |
| Gesloten, tabel 2017 (vergelijking) | 82 397,1 | 288,39 | 305,27 | 593,66 | 355,91 | gelijk | < 0,05 kN |

"Gelijk" betekent: de test eist overeenstemming op 0,05 kN (R) en 0,5 mm² (A_b). EA van de open buis: 210 000 · 9 861,5 = 2 070 906 kN (alleen staal); de gesloten buis houdt staal plus betonvulling.

Niet gecontroleerd tegen een externe referentie-berekening of een gepubliceerd rekenvoorbeeld; zo'n voorbeeld voor een open buispaal volgens de norm is niet gevonden.
