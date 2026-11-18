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

## Open punten

- αt in klei tussen 2,0 en 2,5 MPa: de reader geeft een formule die niet aansluit op 0,02 en 0,03; de module interpoleert lineair.
- ξ4 voor een stijf bouwwerk bij twee en drie sonderingen (0,96 en 0,94) oogt inconsistent; controleren in tabel A.10b.
- Het invloedsoppervlak A voor rand- en hoekpalen en voor een enkele rij: de module rekent met het stramien min de paaldoorsnede, of met een eigen waarde.
- f1 is een invoerwaarde. De formule staat in `compactionFactor`, maar is niet tegen een uitgewerkt voorbeeld gecontroleerd en wordt nog niet automatisch toegepast.
- De αt-waarden van de editie 2025 staan er nog niet in.
- De grondsoort per laag komt uit de indicatieve laagindeling van de sondering; een eigen laagindeling per sondering kan nog niet worden opgegeven.
