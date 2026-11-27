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

## Openstaand punt bij de puntweerstand

Deze beperking betreft het behouden projectmodel en het profiel 2017. De
afzonderlijke historische profielen hebben een nieuwe trajectprocedure, inclusief
de startregel van traject II, gecontroleerd met de tabellarische normbijlage.
Zie [historische verificatie](HISTORISCHE-NORMEN.md).

De bestaande puntmethode kiest het traject met het laagste qc;I. NEN
9997-1:2016+C2:2017, §7.6.2.3(e), vraagt een trajectkeuze op basis van het minimum
van de volledige puntweerstand. Dit is een bekende beperking; de implementatie
mag niet als volledige verificatie van deze normprocedure worden beschouwd.

Een proef met minimalisatie van de volledige uitdrukking, met behoud van de
bestaande afkapregels, gaf bij sondering S1 uit referentie-rapport 984 ongeveer
367 kN in plaats van de referentiewaarde 419 kN. De juiste combinatie van
trajectkeuze en afkapregels moet onafhankelijk worden geverifieerd voordat deze
methodewijziging wordt vrijgegeven. De prestatieoptimalisatie behoudt daarom
de bestaande puntmethode en ongewijzigde referentietoleranties.

De 100 externe componentgevallen toetsen aangeleverde trajectgemiddelden en
verifiëren deze trajectkeuze dus niet. Aanvullende analytische tests toetsen
segmentintegratie, gedeeltelijke segmenten en meetpuntafstand.

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
