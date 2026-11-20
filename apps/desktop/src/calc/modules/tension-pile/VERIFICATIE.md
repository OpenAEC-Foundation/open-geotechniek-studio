# Trekpalen: rekenregels en controleberekeningen

De module rekent de trekweerstand van een paal volgens NEN 9997-1 art. 7.6.3. De normtekst zelf en de CUR-publicatie over trekpalen zijn niet vrij beschikbaar; de regels hieronder komen uit openbare bronnen die de normtekst overnemen. De module is daarom **experimenteel** tot iemand de punten onder *Open punten* in de norm heeft nagelopen.

## Rekenregels

- Toets: `F_t;d ≤ R_t;d`, met `R_t;d = min(R_t;wrijving;d, R_t;kluit;d) + G'_paal;d`.
- `q_s;z;d = f1 · f2 · αt · q_c;z;d` en `q_c;z;d = q_c;z;a / (ξ · γ_m;var;qc · γ_s;t)`, met `γ_s;t = 1,35`.
- Wisselbelasting: `γ_m;var;qc = 1 + 0,25 · (F_t;max;rep − F_t;min;rep) / F_t;max;rep`, tussen 1,0 en 1,5. Druk is negatief.
- ξ3 en ξ4 uit tabel A.10a (niet-stijf) en A.10b (stijf). Over meerdere sonderingen: `R_t;d = min(gemiddelde met ξ3, laagste met ξ4)`.
- Ontgraving, alleen in zand: `q_c · √(σ'ontgr / σ'0)` bij een paal die vóór het ontgraven is gemaakt of bij een trillingsarm systeem; `q_c · σ'ontgr / σ'0` bij heien na ontgraven. De spanningen zijn representatief, in het midden van de laag.
- Afsnuiten na de reductie: een piek boven 12 MPa naar 12 MPa; is het pakket boven 12 MPa dikker dan 1 m, dan naar 15 MPa.
- αt in zand per paaltype volgens tabel 7.c (editie 2017), zie `catalog.ts`.
- αt in klei volgens tabel 7.d: 0,02 onder 2 MPa, 0,03 vanaf 2,5 MPa, daartussen lineair. Leem 0,025. Veen 0. Optie: halve αt als de paal vooral aan zand hangt.
- Alleenstaande paal: `f1 = f2 = 1` en geen kluittoets.
- Paalgroep, f2 per laag van hoogstens 1 m, van boven naar beneden:
  - `M = f1 · O · αt · q_c;d · d / A`
  - `a = 2 · σ'v;d + γ'_d · d`
  - `f2 = (−M + √(M² + a · (a − 2 · Σq_t))) / a`, hoogstens 1
  - `q_t = M · f2` en `R_t;d = A · Σq_t`
- Kluit: cilinder op het invloedsoppervlak A met aan de paalpunt een kegel, punt omlaag. Kegelhoogte `0,5 · d_eq / tan(θ)` met `d_eq = √(4A/π)`. Halve tophoek θ: 45° binnen en 30° aan de rand bij grondverdringende palen; ⅔φ' en ½φ' bij de andere.
- Gewichten van grond en paal met een partiële factor 1,1; onder water verminderd met 10 kN/m³. Het paalgewicht telt alleen mee bij grondverdringende palen.

## Controleberekeningen

De tests in `compute.test.ts` rekenen deze openbare voorbeelden na.

| Test | Bron | Wat het toetst | Uitkomst |
|---|---|---|---|
| V1 | Reader Geotechniek voor het HBO, voorbeeld 7.4 | f2 over 13 lagen, paalgewicht, toets | f2 per laag gelijk op twee decimalen; 305 + 37,8 = 343 kN |
| V2 | Dezelfde reader, voorbeeld 7.3 | lineaire reductie door ontgraven, klei en zand, kluit | kluit 499 kN; wrijving 381 kN tegen 384 kN in de bron |
| V3, V4 | Funderingsadvies bij een omgevingsvergunning, stalen buispalen | wisselbelasting 1,5, afsnuiten op 15 MPa | 50,9 kN en 63,5 kN |
| V5, V6 | Funderingsadvies bij een omgevingsvergunning, palenrij | alleenstaand en met f2 | 186,5 kN en 163,7 kN alleenstaand; 165,7 kN en 147,6 kN in de rij |
| V7 | Funderingsadvies met avegaarpalen | toename per 0,25 m in vast zand | 11,156, 12,551 en 13,945 kN |

Afwijkingen van de bronnen, bewust:

- **V1, kluit.** De bron rekent de kegel met ½ · A · h en een lagere kegelhoogte (406 kN). De module rekent met ⅓ en de kegelhoogte uit de tophoek (ongeveer 396 kN).
- **V2, tweede zandlaag.** De bron rekent met 27,7 kPa; uit haar eigen spanningen volgt 59 − 32,5 = 26,5 kPa. Daardoor 2,7 kN minder.
- **V3, paalgewicht.** De bron rekent met een factor 0,9 (9,0 kN); de module met γ/1,1 (9,2 kN).
- **V5 en V6.** De bron kapt een laag van 0,7 m op 15 MPa en niet op 12 MPa; de test zet de piekgrens daarvoor op 15 MPa. De groepswaarde klopt bij een invloedsoppervlak van 6,26 m²; welke regel de bron voor een enkele rij gebruikt is onbekend.

## Aanpassingen van de grondlaaginterpretatie

Per berekening kan de gebruiker voor een dieptetraject van een sondering de conusweerstand aanpassen (lineair tussen de randwaarden of een vaste waarde) en de grondsoort wijzigen, met een toelichting. De invoer (`interpretationOverrides`), het paneel bij de tekening en de regels zijn dezelfde als in de module paaldraagvermogen; de gedeelde code staat in `calc/shared/interpretation`. De sondering in het project blijft de meting.

Zo werkt een aanpassing door in de trekweerstand:

- **Conusweerstand.** De aangepaste lijn vervangt de meting vóór het middelen per laag. Daarna volgen de gewone stappen: reductie voor ontgraving en overconsolidatie, afsnuiten op 12 of 15 MPa, de factoren. αt in klei (tabel 7.d) volgt de aangepaste waarde.
- **Grondsoort.** Het traject wordt één laag met de nieuwe grondsoort. Die bepaalt αt (zand, klei, leem of geen wrijving in veen), of f2 geldt, en het volumegewicht en φ' voor de korrelspanning en de kluit. De laag krijgt de waarden uit "Volumegewichten per grondsoort".
- **Laaggrenzen.** De randen van een toegepast traject worden laaggrenzen, zodat een aangepaste waarde niet met de meting ernaast wordt gemiddeld.
- **Keuze.** Een aangepaste conusweerstand verandert de grondsoort niet: de laagindeling blijft die van de gemeten sondering. Wie beide wil wijzigen, geeft beide op in dezelfde aanpassing.
- **Zonder aanpassingen** is de uitkomst gelijk aan die van vóór deze uitbreiding; `interpretation.test.ts` legt de getallen van een alleenstaande paal en van een paal in een groep vast.

De tests in `interpretation.test.ts` rekenen op een kunstmatige sondering (`interpretation.fixture.ts`) met ronde waarden. Voor een alleenstaande prefab paal □290 zonder ontgraving geldt per MPa·m zand 1,16 · 0,007 · 1000 / (1,39 · 1,00 · 1,35) = 4,327 kN:

| Aanpassing | Met de hand | Verschil in de module |
|---|---|---|
| Terugval naar 3 MPa eruit, lineair, NAP -11,90 tot -13,00 m | 11,0 − 4,0 = 7,0 MPa·m | +30,29 kN |
| Vaste waarde 10 MPa, NAP -12 tot -13 m (gemeten gemiddeld 3,35 MPa) | 6,65 MPa·m | +28,78 kN |
| Vaste waarde 4 MPa, NAP -14 tot -15 m (gemeten 10 MPa) | −6,0 MPa·m | −25,96 kN |
| Zand naar veen, NAP -14 tot -16 m | −20,2 MPa·m | −87,41 kN |
| Klei (qc 1,5 MPa, halve αt = 0,010) naar zand, NAP -5,5 tot -7,5 m | 1,16 · (0,007 − 0,010) · 1500 / 1,8765 · 2 | −5,56 kN |
| Zand naar veen in een groep 1,5 × 1,5 m: kluit | 2,1659 m² · 2 m · (20/1,1 − 11/1,1) kN/m³ | −35,44 kN |

Deze gevallen zijn eigen handberekeningen met de formules van art. 7.6.3.3; er is geen externe referentie-berekening met aangepaste interpretatie mee vergeleken.

## Open punten

- αt in klei tussen 2,0 en 2,5 MPa: de reader geeft een formule die niet aansluit op 0,02 en 0,03; de module interpoleert lineair.
- ξ4 voor een stijf bouwwerk bij twee en drie sonderingen (0,96 en 0,94) oogt inconsistent; controleren in tabel A.10b.
- Het invloedsoppervlak A voor rand- en hoekpalen en voor een enkele rij: de module rekent met het stramien min de paaldoorsnede, of met een eigen waarde.
- f1 is een invoerwaarde. De formule staat in `compactionFactor`, maar is niet tegen een uitgewerkt voorbeeld gecontroleerd en wordt nog niet automatisch toegepast.
- De αt-waarden van de editie 2025 staan er nog niet in.
- De grondsoort per laag komt uit de indicatieve laagindeling van de sondering. Per traject is de grondsoort aan te passen (zie hierboven); een volledig eigen laagindeling met eigen gewichten per laag kan nog niet worden opgegeven.
