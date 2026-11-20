# Fundering op staal: rekenregels en controleberekeningen

De module toetst een strook- of poerfundering op staal volgens NEN 9997-1 art. 6.5. De normtekst zelf is niet vrij beschikbaar; de regels hieronder komen uit openbare bronnen die de norm overnemen, in de eerste plaats de *Reader Geotechniek voor het HBO* (hoofdstuk 6, "Ontwerpen van funderingen op staal"), en zijn nagerekend met openbare funderingsadviezen en uitgewerkte Eurocode 7-voorbeelden. De module is daarom **experimenteel** tot iemand de punten onder *Open punten* in de norm heeft nagelopen.

## Rekenregels

Bron, tenzij anders vermeld: de reader, par. 6.2 en 6.3 (formules 6.3.1 tot en met 6.3.36, tabellen 6.2.2, 6.3.1 en 6.3.2).

**Rekenwaarden.** `tan φ'd = tan φ' / γφ'`, `c'd = c' / γc'`, `cu;d = cu / γcu`, `γd = γ / γγ`; onder water `γ'd = γsat / γγ − 10`. NEN 9997-1 tabel A.4a, kolom "Fundering op staal": γφ' = 1,15, γc' = 1,6, γcu = 1,35, γγ = 1,1; kolom "Keermuur": 1,2 / 1,5 / 1,5 / 1,1. De weerstandsfactoren zijn 1,0. De waarden staan in de reader (tabel 6.2.2) en in drie funderingsadviezen (V5, V6, V8).

**Effectieve afmetingen.** `b' = B − 2·eB`, `l' = L − 2·eL`, met de excentriciteit uit het moment op het funderingsvlak: `eB = (Vd·eV + Md + Hd·h) / Vd`. Bij een strook is `l' = 1` en zijn alle vormfactoren 1.

**Gedraineerd.** `σ'max;d = c'·Nc·sc·ic·bc·λc + σ'v;z;d·Nq·sq·iq·bq·λq + ½·γ'·b'·Nγ·sγ·iγ·bγ·λγ` en `Rv;d = σ'max;d · b' · l'`.

- `Nq = e^(π·tan φ') · tan²(45° + φ'/2)`, `Nc = (Nq − 1)·cot φ'`, `Nγ = 2·(Nq − 1)·tan φ'`
- vorm: `sq = 1 + (b'/l')·sin φ'`, `sγ = 1 − 0,3·b'/l'`, `sc = (sq·Nq − 1)/(Nq − 1)`
- H evenwijdig aan b': `iq = (1 − 0,70·Hd / (Vd + A'·c'·cot φ'))³`, `iγ = (1 − Hd / (Vd + A'·c'·cot φ'))³`; H evenwijdig aan l': `iq = iγ = 1 − Hd / (Vd + A'·c'·cot φ')`; steeds `ic = (iq·Nq − 1)/(Nq − 1)`
- maaiveldhelling β in graden: `λc = (Nq·e^(−0,0349·β·tan φ') − 1)/(Nq − 1)`, `λq = (1 − tan β)^1,9`, `λγ = (1 − 0,5·tan β)^6`
- hellende onderkant α in radialen: `bq = bγ = (1 − α·tan φ')²`, `bc = bq − (1 − bq)/(Nc·tan φ')`
- dekking: `σ'v;z;d = Σ d·γd`, onder water met `γ'd`

**Ongedraineerd.** `σ'max;d = (π + 2)·cu;d·sc·ic·bc·λc + σ'v;z;d·λq`, met `sc = 1 + 0,2·b'/l'`, `ic = 0,5·(1 + √(1 − Hd/(A'·cu;d)))`, `λc = 1 − 0,4·tan β`, `λq = (1 − tan β)^1,9`. De reader geeft geen basisfactor; `bc = 1 − 2α/(π + 2)` komt uit NEN-EN 1997-1 bijlage D. Getoetst wordt als de laag direct onder het (fictieve) funderingsvlak een cu heeft, met de laagste cu;d van de aaneengesloten cohesieve lagen binnen de ongedraineerde invloedsdiepte.

**Invloedsdiepte en gewogen gemiddelden.** Bij gelaagde grond worden φ', c' en γ' gemiddeld over de invloedsdiepte ze onder het funderingsvlak (reader formule 6.3.4):

`X_gem = Σ X_i · h_i · z_i / Σ h_i · z_i`, met `h_i` de laagdikte en `z_i` de afstand van het laagmidden tot de invloedsdiepte.

De invloedsdiepte en de invloedsbreedte ae volgen uit tabel 6.3.1 van de reader, als veelvoud van b' bij H/V = 0 en H/V = 1, per φ'rep:

| φ'rep [°] | ae/b' (H/V = 0) | ae/b' (H/V = 1) | ze/b' (H/V = 0) | ze/b' (H/V = 1) |
|---|---|---|---|---|
| 0 | – | – | 0,70 | 0,40 |
| 5 | 1,25 | 0,65 | 0,77 | 0,41 |
| 10 | 1,57 | 0,77 | 0,88 | 0,44 |
| 15 | 1,99 | 0,92 | 1,00 | 0,47 |
| 20 | 2,53 | 1,10 | 1,16 | 0,50 |
| 25 | 3,27 | 1,33 | 1,35 | 0,54 |
| 30 | 4,29 | 1,62 | 1,59 | 0,59 |
| 35 | 5,77 | 2,01 | 1,90 | 0,65 |
| 40 | 8,01 | 2,53 | 2,33 | 0,73 |
| 45 | 11,61 | 3,27 | 2,95 | 0,84 |

De module interpoleert lineair in φ'rep en in Hd/Vd. Een gesloten formule voor ze is in de openbare bronnen niet gevonden. Wel is nagegaan waar de tabel vandaan komt: de kolommen voor H/V = 0 zijn de afmetingen van het bezwijkvlak van Prandtl, `ae/b' = tan(45° + φ'/2)·e^((π/2)·tan φ')` (exact gelijk aan de tabel) en `ze/b' = cos φ' / (2·cos(45° + φ'/2)) · e^((π/4 + φ'/2)·tan φ')` (gelijk aan de tabel tot en met 35°; bij 40° en 45° geeft de formule 2,35 en 3,00 tegen 2,33 en 2,95 in de tabel). Voor de kolommen bij H/V = 1 is geen formule gevonden.

Omdat ze van φ'gem;rep afhangt en dat gemiddelde weer van ze, itereert de module: begin met `ze = 1,5·b'` (zoals de reader), bepaal de gewogen gemiddelden, lees de nieuwe ze af, en herhaal tot het verschil kleiner is dan 1 mm. Na 25 stappen wordt gedempt (het gemiddelde van oud en nieuw); na 60 stappen stopt de iteratie met een waarschuwing. De stappen staan in het resultaat en in de uitdraai. De gebruiker kan ze met de hand vastzetten; dan volgen de gemiddelden die diepte.

**Doorponsen.** Een fictief funderingsvlak op de bovenkant van een laag waarvan φ'k meer dan 6° lager is dan die van de laag erboven (gedraineerd en, bij een cu, ongedraineerd), of van een cohesieve laag onder een niet-cohesieve (ongedraineerd). De afmetingen spreiden onder 8° met de verticaal: `Bpons = B + 2·t·tan 8°`. Het grondgewicht tussen beide vlakken telt als belasting met een factor 1,2: bij een strook over de gemiddelde breedte, bij een poer over de inhoud van de afgeknotte piramide. De arm van Hd groeit met t; de dekking groeit met het gewicht van de tussenliggende grond. Op het fictieve vlak gelden dezelfde formules, met een eigen invloedsdiepte. De toets gebeurt voor elke zulke laag, ook onder de invloedsdiepte van de voet (zoals de bronnen van V7 en V11 doen).

**Afschuiven.** Gedraineerd `Rh;d = V'd · tan δd`, met `δd = φ'd` voor in het werk gestort beton en `⅔·φ'd` voor een glad (prefab) vlak; cohesie telt niet mee. Ongedraineerd `Rh;d = A' · cu;d`, en `≤ 0,4·Vd` als water of lucht het contactvlak kan bereiken. Toets `Hd ≤ Rh;d + Rp;d`, met de kleinste verticale belasting; de passieve gronddruk Rp;d is een invoerwaarde.

**Excentriciteit.** NEN-EN 1997-1 art. 6.5.4 vraagt bijzondere voorzorgen als de excentriciteit groter is dan een derde van de afmeting. De module toetst `e ≤ B/3` (en `L/3`) met de rekenwaarden, en meldt of de resultante binnen de kern ligt (`e ≤ B/6`). De tekst van het artikel is alleen als parafrase gevonden, in het Europese rapport met uitgewerkte voorbeelden (EUR 26227 EN, par. 3.3).

**Kantelen (EQU).** `γG;dst·(HG;rep·h + MG;rep) + γQ;dst·(HQ;rep·h + MQ;rep) ≤ γG;stb·VG;rep·(B/2 − eV)`, om de rand van de voet, met γG;stb = 0,9, γG;dst = 1,1 en γQ;dst = 1,5. Bron van de factoren: NEN-EN 1990 tabel A1.2(A); de aanbevolen waarden 1,10 / 0,90 en 1,5 staan in een openbaar uitgewerkt Eurocode-voorbeeld over belastingen op een gebouw van zes lagen (2008, op de Eurocodes-website van de Europese Commissie) en de rij "tabel A1.2(A) (EQU): 1,10 ongunstig, 0,9 gunstig, 1,50 Qk" in een Nederlandse constructieberekening bij een vergunning (2024). NEN 9997-1 tabel A.1 zelf is niet ingezien. De toets verschijnt alleen als de representatieve belastingen zijn ingevuld.

## Tekening

De doorsnede toont het bezwijkvlak van Prandtl: de actieve wig onder b' (hoek 45° + φ'/2), de overgangszone (logaritmische spiraal `r = r0·e^(θ·tan φ')` over 90°; bij φ' = 0 een cirkelboog) en de passieve wig (45° − φ'/2) naar het funderingsniveau. De geometrie staat in `slip.ts` en wordt getekend met φ'gem;rep. Zonder horizontale belasting valt dit vlak samen met ze en ae uit de tabel; met horizontale belasting schaalt de tekening het vlak naar de ze en ae uit de berekening. Dat laatste is een schematische weergave, geen berekend bezwijkvlak. Bij een horizontale belasting, een excentriciteit of een helling wordt het vlak eenzijdig getekend, aan de kant van Hd en van de helling.

## Controleberekeningen

De tests in `compute.test.ts` rekenen deze openbare voorbeelden na. "Volledig" betekent: de module rekent van de invoer van de bron tot haar uitkomst. "Deel" betekent: alleen een stuk van de keten is vergelijkbaar; de reden staat erbij.

| Nr | Bron | Wat | Uitkomst bron | Uitkomst module | Soort |
|---|---|---|---|---|---|
| V1 | Reader, voorbeeld 1 (landhoofd, strook 3,0 m, drie lagen, Hd, excentriciteit, talud 13°) | gedraineerd, geval b | b' 2,32 m; ze 3,66 m; φ'gem;d 27,9°; 235 kPa | 2,32 m; 3,65 m; 27,8°; 230,6 kPa | volledig |
| V2 | Zelfde voorbeeld | doorponsen op de klei, 8° | Bpons 3,42 m; Vpons 704 kN/m; ongedraineerd 586 kPa en 1541 kN/m; gedraineerd 412 kPa | 3,42 m; 704,0; 583,3 kPa en 1531,9 kN/m; 418,9 kPa | volledig |
| V3 | Zelfde voorbeeld | afschuiven | gedraineerd 63,9 kN/m; ongedraineerd 122,2 kN/m | 63,8; 121,7 | volledig (gedraineerd), deel (ongedraineerd) |
| V4 | Reader, voorbeeld 3 (L-keermuur, keermuurfactoren, helling 10°) | gedraineerd en afschuiven | 120,94 kPa; 301,3 kN/m; 27,7 kN/m | binnen 1,5 %; 27,7 | volledig |
| V5 | Funderingsadvies bij een bestemmingsplan (2022), bijlage "Advies strookdraagvermogen" | stroken 0,7 tot 1,6 m op gelaagd zand, met ze en ae | 63,1 / 88,0 / 112,9 / 141,1 kPa; met 150 mm dekking 93,2 / 119,4 / 145,7; ze 1,12 tot 2,69 m | gelijk op 0,1 kPa en 0,01 m | volledig |
| V6 | Funderingsadvies woning (nummer 61192850-FA-1) | stroken en vierkante poeren, grondwater binnen ze | stroken 45,4 / 77,5 / 102,5 kPa; poeren 31,8 / 44,3 / 54,3 en met 200 mm dekking 88,7 / 101,2 / 111,2 kPa | gelijk op 0,1 kPa | volledig |
| V7 | Bijlage "Berekening fundering op staal" bij een nieuwbouwplan (opdracht 23ZP1301) | strook en poer 1,00 m; ongedraineerd doorponsen op silt 3,40 m onder de voet | strook 171 kPa, poer 200 kPa; doorponsen 110 en 125 kPa op b' 1,96 m; 215 kN/m en 478 kN | 171,4; 199,6; 109,8; 125,0; 214,7; 478,2 | volledig |
| V8 | Funderingsadvies antennemast (kenmerk R2102778-02, 2021) | vierkante plaat 6,0 en 6,25 m met Hd = 83 kN en Md = 2020 kNm | b' 2,14 / 1,29 / 2,67 / 1,88 m; 97 / 58 / 120 / 83 kPa; Rh;d 383 / 313 / 412 / 337 kN | 2,14 / 1,29 / 2,67 / 1,88; 96,8 / 58,1 / 120,7 / 83,4; 382,6 / 313,1 / 412,0 / 337,3 | volledig (eindwaarden) |
| V9 | Modeloplossingen bij de voorbeelden van een Europese Eurocode 7-workshop (Dublin 2005), voorbeeld 1 | vierkante poer, centrisch; ongedraineerd en gedraineerd | ongedraineerd 2187,8 en 1737,0 kN; gedraineerd 2158,2 / 1748,4 / 2203,1 kN | 2187,8 en 1737,0; gedraineerd binnen 0,5 % | volledig (ongedraineerd), deel (gedraineerd) |
| V10 | Zelfde bron, voorbeeld 2 | excentrische, schuine last: e, b', B/3 − e, afschuiven | e 0,867 m; b' 2,35 m; B/3 − e 0,49 m; Rh;d 1659,97 kN | gelijk | deel |
| V11 | Statische berekening woning (B10148, 2015), strook als rechthoek 1,30 × 5,00 m op gelaagde grond | factoren en σ'max;d uit de gewogen parameters van de bron; ongedraineerd op een fictief vlak | 144,07 en 123,23 kPa; 814,03 kPa | binnen 0,3 % | deel |
| V12 | Statische hoofdberekening woonhuis (817.277, 2017), blad "Gronddraagvermogen" | strook en vierkante plaat op homogeen zand | stroken 58 tot 114 kPa; platen 244 tot 315 kPa; sq 1,45, sc 1,49, sγ 0,70 | binnen 1 % | deel |
| V13 | Ontwerpberekeningen keerconstructies (werk 2810, 2024), par. 4.1.1 | e, b' en glijden met δ = ⅔·φ'd | b' 1,22 m; Rh;d 24,81 kN/m | 1,22 m; 25,5 kN/m | deel |
| V14 | Europees rapport EUR 26227 EN (2013), voorbeeld A.4 (T-vormige keermuur) | kantelende en stabiliserende momenten | Mdst;d 332,5; Mstb 1055,5 kNm/m; 31 % | gelijk | deel |

Negen voorbeelden zijn volledig nagerekend (V1 tot en met V9, met de genoemde beperkingen bij V3 en V9), vijf zijn een deelcontrole (V10 tot en met V14). Samen dekken ze gedraineerd draagvermogen van strook en poer, ongedraineerd draagvermogen, doorponsen, afschuiven, excentrische en schuine belasting en gelaagde grond met ze.

**Niet gevonden.** Een openbaar uitgewerkt voorbeeld van een kanteltoets met de EQU-factoren 0,9 / 1,1 / 1,5 en uitgeschreven momenten. De kanteltoets is daarom alleen op haar rekenkundige opbouw gecontroleerd (V14, met de factoren van die bron, en een eigen rekensom in de test). Ook niet gevonden: een voorbeeld met ongedraineerd afschuiven op klei direct onder de voet, en een voorbeeld met een hellende onderkant.

### Verschillen met de bronnen

- **V1.** De bron rekent door met afgeronde tussenwaarden (niveau van ze op 0,1 m, φ' op 0,1°, N-factoren uit de tabel, factoren op twee decimalen) en komt op 235 kPa; de module rekent zonder afronden en komt op 230,6 kPa (1,9 % lager). Met de afgeronde factoren van de bron zelf volgt 235 kPa; die som staat in de test. De variant met taludverharding (259 kPa) is met de formule nagerekend, omdat de module geen losse bovenbelasting op de dekking kent.
- **V2, gedraineerd.** De bron neemt ic = 0,83 over uit stap 1d, berekend met Nq = 14,6; bij het fictieve vlak horen Nq = 13,6 en iq = 0,86, dus ic = 0,85. Daardoor 418,9 tegen 412 kPa. Ongedraineerd laat de bron de taludreductie weg omdat de berm breder is dan ae; de test rekent dat geval daarom zonder helling.
- **V3, ongedraineerd.** De bron rekent cu;d·b' met de cu van de klei 1,5 m onder de voet. De module toetst ongedraineerd afschuiven alleen als de laag direct onder de voet cohesief is; de test zet de klei daarom direct onder de voet.
- **V7.** De bron trekt het grondgewicht boven het fictieve vlak af van de weerstand, met rekenwaarden van het gewicht (49 kN/m en 74 kN); de module telt het representatieve gewicht maal 1,2 op bij de belasting (59,6 kN/m en 91,1 kN), zoals de reader. σ'max;d en de weerstand zijn gelijk; de unity check van de module is hoger. Het voorbeeldblad van de bron drukt voor de weerstand 323 kN/m en 1545 kN af, haar eigen tabel 215 en 478; die laatste volgen uit σ'max;d·A'.
- **V8.** De bron leest ze en ae af met de rekenwaarde van φ' (ze = 3,08 m bij de eerste rij), de module met de representatieve waarde zoals de reader en de bronnen van V5 tot en met V7 (3,49 m). Op σ'max;d scheelt dat hier minder dan 1 %.
- **V9, gedraineerd, en V12.** Deze bronnen rekenen het effectieve gewicht anders (γw = 9,81 in V9; (γsat − γw)/1,1 en een dekking met 0,9·γ in V12). De tests zetten daarom hun rekenwaarden rechtstreeks in de formule.
- **V10.** De hellingsfactoren van die bron volgen NEN-EN 1997-1 bijlage D (met een exponent m) en verschillen van de Nederlandse; ze zijn niet vergeleken.
- **V11.** Met de lagen van de bron komt de module op 155,5 en 128,5 kPa tegen 144,07 en 123,23 kPa. De bron rekent de dekking met het representatieve gewicht (7,20 tegen 6,55 kPa), komt op een kleinere invloedsdiepte (1,71 tegen 1,92 m) en op lagere gemiddelden (φ' 23,43° tegen 24,44°). Welke regel zij voor ze en voor de grond boven het grondwater gebruikt, is uit de uitvoer niet op te maken. De test controleert daarom alleen de formule met haar gewogen parameters.
- **V13.** De bron deelt de hoek zelf door 1,15 (28,26°); de module deelt tan φ' (28,99°). Daardoor 2,8 % meer afschuifweerstand.
- **V14.** Die bron toetst kantelen met 1,35 / 1,5 op de kantelende en 1,0 op de stabiliserende momenten, niet met de EQU-factoren.

Een funderingsadvies met een voorbeeldberekening voor een strook en een poer op gelaagde grond (rapport 1702797.006XF, 2019) is niet gebruikt: de afgedrukte invloedsdiepte (1,49·b) en gemiddelden (φ' 28,90°, γ' 8,10 kN/m³) zijn met de afgedrukte lagen niet te herleiden.

## Weggelaten

- Zettingen en zettingsverschillen.
- Algehele stabiliteit (glijvlakberekening); de module waarschuwt als de helling groter is dan de helft van φ'gem;d.
- Zijdelings wegpersen (squeezing) van een dunne cohesieve laag.
- Het ontwerp van de betonvoet zelf, en opdrijven.
- Horizontale belasting in twee richtingen tegelijk.

## Open punten

- De normtekst van art. 6.5.2 tot en met 6.5.4 en van de tabellen A.1 en A.4a is niet ingezien; alle regels komen uit de genoemde bronnen.
- Invloedsdiepte: de tabel komt uit de reader. Of de norm lineair interpoleren in φ' en in H/V voorschrijft, en of met de representatieve of de rekenwaarde van φ' moet worden afgelezen (V8 doet het anders), is niet geverifieerd. De invloedsbreedte bij φ' = 0 staat niet in de tabel; de module gebruikt 1,00·b' (Prandtl) en een doorgetrokken 0,53·b' bij H/V = 1, alleen voor de tekening.
- Het gewogen gemiddelde van φ' is genomen over de hoeken in graden, zoals de reader en de adviezen; niet over tan φ'.
- De reader onderscheidt bij gelaagde grond gevallen a, b en c en staat middelen alleen toe bij een verschil in φ'k tot 6°. De module rekent altijd het gewogen gemiddelde en voegt de doorponstoets toe waar dat verschil groter is; een cohesieve laag direct onder de voet met niet-cohesieve lagen eronder wordt ongedraineerd als oneindig diep beschouwd.
- Doorponsen: of het grondgewicht boven het fictieve vlak met het representatieve gewicht maal 1,2 (reader) of met rekenwaarden (V7) moet worden gerekend, en of de toets ook onder de invloedsdiepte moet, is niet in de norm nagegaan.
- De dekking: de reader beperkt de in rekening te brengen dekking tot 2·B; de module waarschuwt, maar kapt niet af. De adviezen rekenen de dekking met γ/1,1; twee constructieberekeningen (V11, V12) doen het anders.
- De basisfactor bij ongedraineerd komt uit NEN-EN 1997-1 bijlage D, niet uit een Nederlandse bron; een voorbeeld met een hellende onderkant is niet gevonden. De tekening laat de onderkant oplopen in de richting van Hd; de factoren kennen geen richting.
- Kantelen: geen openbaar voorbeeld met de EQU-factoren gevonden; de factoren komen uit secundaire bronnen. De toets rekent om de rand van de voet en neemt aan dat de excentriciteit van VG;rep naar de kantelrand wijst.
- De startwaarden per grondsoort in `catalog.ts` zijn indicatief en niet tegen tabel 2.b van de norm nagelopen. De grondsoort uit de sondering komt uit de indicatieve laagindeling.
- Grondwater boven het aanlegniveau: de module rekent de dekking en de grond met het effectieve gewicht en verwacht Vd als effectieve belasting; de opwaartse waterdruk wordt niet zelf berekend.
- Het volumegewicht van water is vast 10 kN/m³.
