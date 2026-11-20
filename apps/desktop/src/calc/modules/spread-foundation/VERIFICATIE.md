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

De doorsnede en het snijvlak van de 3D-weergave tonen hetzelfde bezwijkvlak; de geometrie staat in `slip.ts` (`slipSurface`) en wordt via `scene.ts` (`spreadSlip`) door beide weergaven en de uitdraai gebruikt. Het vlak wordt getekend met φ'gem;rep, de hoek waarmee ook ze en ae worden afgelezen.

**Verticale belasting.** Het glijlijnenveld van Prandtl (1920) voor een strook op gewichtsloze grond: de actieve wig onder b' (basishoeken μ = 45° + φ'/2), de overgangszone (logaritmische spiraal `r = r0·e^(θ·tan φ')` over 90°; bij φ' = 0 een cirkelboog) en de passieve wig (45° − φ'/2) naar het funderingsniveau. Dit vlak valt samen met ze en ae uit de tabel (zie hierboven).

**Hellende belasting.** De oplossing van de plasticiteitstheorie voor dezelfde strook met een hellende belasting (Sokolovskii, *Statics of soil media*, 1960; Brinch Hansen, *A general formula for bearing capacity*, 1961, waarop de hellingfactoren teruggaan). Deze publicaties zijn niet ingezien; de afleiding hieronder is zelf uitgeschreven en gecontroleerd op de grensgevallen.

1. Onder de voet heerst een gelijkmatige spanningstoestand op de bezwijkgrens. Op het funderingsvlak werkt de belasting onder een hoek δ met de normaal, met `tan δ = Hd / (Vd + A'·c'·cot φ')`: de term van de hellingfactoren (de cohesie is verwerkt door de normaalspanning met c'·cot φ' te verhogen).
2. Uit de cirkel van Mohr (middelpunt p, straal p·sin φ') volgt voor een vlak waarvan de normaal een hoek α maakt met de grootste hoofdspanning: `σ = p·(1 + sin φ'·cos 2α)`, `τ = p·sin φ'·sin 2α`. Met `τ/σ = tan δ` geeft dat `sin(2α − δ) = sin δ / sin φ'`, dus `α = (Δ + δ)/2` met `sin Δ = sin δ / sin φ'`. De grootste hoofdspanning staat onder de voet dus niet verticaal, maar is α gedraaid naar de kant waarheen de belasting wijst.
3. Glijlijnen maken een hoek 45° − φ'/2 met de grootste hoofdspanning. De actieve wig krijgt daardoor de basishoeken μ − α (aan de kant waar de belasting vandaan komt) en μ + α (aan de kant waarheen hij wijst); de tophoek blijft 90° − φ'.
4. In de passieve wig is de grootste hoofdspanning horizontaal. Van de passieve wig naar de wig onder de voet draait de hoofdspanning aan de kant waarheen de belasting wijst over 90° − α: dat is de openingshoek van de overgangszone. De spiraal begint in de punt van de wig met `r0 = b'·sin(μ − α)/cos φ'`. Aan de andere kant zou de draaiing 90° + α zijn; dat mechanisme vraagt een grotere belasting en treedt niet op. Het vlak is daarom eenzijdig.
5. Diepte en reikwijdte volgen in gesloten vorm: `diepte = b'·sin(μ − α)·e^((μ − α)·tan φ')` en `reikwijdte = 2·sin μ·sin(μ − α)/cos φ' · e^((π/2 − α)·tan φ') · b'`. Bij α = 0 zijn dit de waarden van Prandtl; bij δ = φ' is α = μ en verdwijnt het mechanisme (de voet schuift af).
6. Het bijbehorende draagvermogen is `Nq(δ) = (1 + sin φ'·cos(Δ + δ))/(1 − sin φ') · e^((π − Δ − δ)·tan φ')`. Bij δ = 0 is dat de Nq van Prandtl. De verhouding Nq(δ)/Nq(0) wijkt in de geteste gevallen (φ' 25° tot 35°, H/V 0,1 tot 0,3) minder dan 8 % af van de hellingfactor `iq = (1 − 0,70·H/V)³` uit de rekenregels.
7. Ongedraineerd (φ' = 0): `sin 2α = Hd / (A'·cu;d)`, een cirkelboog met straal `b'·sin(45° − α)` over 90° − α, en `Nc(α) = 1 + π − 2α + cos 2α`. De normformule `ic = ½·(1 + √(1 − Hd/(A'·cu;d)))` volgt deze exacte waarde binnen 3 % en is er gelijk aan bij Hd = 0 en bij Hd = A'·cu;d.

Uitgewerkt geval (in `slip.test.ts`): φ' = 30°, H/V = 0,2, b' = 2 m geeft δ = 11,31°, Δ = 23,09°, α = 17,20°; wig 42,80° en 77,20°; openingshoek 72,80°; r0 = 1,569 m; diepte 2,09 m (Prandtl 3,17 m); reikwijdte 5,66 m (Prandtl 8,58 m).

Beperkingen van de tekening:

- De **berekening** leest ze en ae nog steeds af uit de tabel, lineair in Hd/Vd. Die waarden zijn bij een hellende belasting groter dan het getekende mechanisme (in het uitgewerkte geval ze = 1,39·b' uit de tabel tegen 1,05·b'). De stippellijn ze in de tekening is de diepte waarover is gemiddeld, niet de onderkant van het vlak. Waar de kolom H/V = 1 van de tabel vandaan komt, is niet gevonden; met deze theorie valt hij niet te herleiden (bij H/V = 1 is δ groter dan φ').
- Het vlak wordt met één hoek getekend, φ'gem;rep over de invloedsdiepte, zoals de berekening de gelaagde grond als één gemiddelde grond behandelt. Het knikt dus niet per laag met de wrijvingshoek van die laag; zo was het ook al bij verticale belasting.
- De theorie geldt voor gewichtsloze grond en een horizontaal maaiveld. Het eigen gewicht van de grond, een maaiveldhelling en een hellende onderkant veranderen het werkelijke vlak; bij een excentriciteit of een helling tekent de module alleen één kant. Werkt Hd bij een poer evenwijdig aan L, dan blijft het vlak in de doorsnede over de breedte dat van Prandtl.
- De 3D-weergave toont het vlak alleen op het snijvlak (omtrek met een lichte vulling); er is geen ruimtelijk bezwijklichaam.

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
| V11 | Statische berekening woning (B10148, 2015), strook als rechthoek 1,30 × 5,00 m op gelaagde grond | gedraineerd uit de lagen, met de rekenregels van de bron en met die van de module; ongedraineerd op een fictief vlak | ze 1,71 en 1,27 m; φ'e;d 23,43° en 22,18°; 144,07 en 123,23 kPa; 814,03 kPa | met de regels van de bron: gelijk (144,07 en 123,23); met de eigen regels 155,5 en 128,5 kPa | volledig (met de regels van de bron) |
| V12 | Statische hoofdberekening woonhuis (817.277, 2017), blad "Gronddraagvermogen" | strook en vierkante plaat op homogeen zand | stroken 58 tot 114 kPa; platen 244 tot 315 kPa; sq 1,45, sc 1,49, sγ 0,70 | binnen 1 % | deel |
| V13 | Ontwerpberekeningen keerconstructies (werk 2810, 2024), par. 4.1.1 | e, b' en glijden met δ = ⅔·φ'd | b' 1,22 m; Rh;d 24,81 kN/m | 1,22 m; 25,5 kN/m | deel |
| V14 | Europees rapport EUR 26227 EN (2013), voorbeeld A.4 (T-vormige keermuur) | kantelende en stabiliserende momenten | Mdst;d 332,5; Mstb 1055,5 kNm/m; 31 % | gelijk | deel |

Negen voorbeelden zijn volledig nagerekend (V1 tot en met V9, met de genoemde beperkingen bij V3 en V9); V11 is volledig nagerekend met de rekenregels van de bron, die op vier punten van die van de module afwijken; vier zijn een deelcontrole (V10, V12, V13 en V14). Samen dekken ze gedraineerd draagvermogen van strook en poer, ongedraineerd draagvermogen, doorponsen, afschuiven, excentrische en schuine belasting en gelaagde grond met ze.

**Niet gevonden.** Een openbaar uitgewerkt voorbeeld van een kanteltoets met de EQU-factoren 0,9 / 1,1 / 1,5 en uitgeschreven momenten. De kanteltoets is daarom alleen op haar rekenkundige opbouw gecontroleerd (V14, met de factoren van die bron, en een eigen rekensom in de test). Ook niet gevonden: een voorbeeld met ongedraineerd afschuiven op klei direct onder de voet, en een voorbeeld met een hellende onderkant.

### Verschillen met de bronnen

- **V1.** De bron rekent door met afgeronde tussenwaarden (niveau van ze op 0,1 m, φ' op 0,1°, N-factoren uit de tabel, factoren op twee decimalen) en komt op 235 kPa; de module rekent zonder afronden en komt op 230,6 kPa (1,9 % lager). Met de afgeronde factoren van de bron zelf volgt 235 kPa; die som staat in de test. De variant met taludverharding (259 kPa) is met de formule nagerekend, omdat de module geen losse bovenbelasting op de dekking kent.
- **V2, gedraineerd.** De bron neemt ic = 0,83 over uit stap 1d, berekend met Nq = 14,6; bij het fictieve vlak horen Nq = 13,6 en iq = 0,86, dus ic = 0,85. Daardoor 418,9 tegen 412 kPa. Ongedraineerd laat de bron de taludreductie weg omdat de berm breder is dan ae; de test rekent dat geval daarom zonder helling.
- **V3, ongedraineerd.** De bron rekent cu;d·b' met de cu van de klei 1,5 m onder de voet. De module toetst ongedraineerd afschuiven alleen als de laag direct onder de voet cohesief is; de test zet de klei daarom direct onder de voet.
- **V7.** De bron trekt het grondgewicht boven het fictieve vlak af van de weerstand, met rekenwaarden van het gewicht (49 kN/m en 74 kN); de module telt het representatieve gewicht maal 1,2 op bij de belasting (59,6 kN/m en 91,1 kN), zoals de reader. σ'max;d en de weerstand zijn gelijk; de unity check van de module is hoger. Het voorbeeldblad van de bron drukt voor de weerstand 323 kN/m en 1545 kN af, haar eigen tabel 215 en 478; die laatste volgen uit σ'max;d·A'.
- **V8.** De bron leest ze en ae af met de rekenwaarde van φ' (ze = 3,08 m bij de eerste rij), de module met de representatieve waarde zoals de reader en de bronnen van V5 tot en met V7 (3,49 m). Op σ'max;d scheelt dat hier minder dan 1 %.
- **V9, gedraineerd, en V12.** Deze bronnen rekenen het effectieve gewicht anders (γw = 9,81 in V9; (γsat − γw)/1,1 en een dekking met 0,9·γ in V12). De tests zetten daarom hun rekenwaarden rechtstreeks in de formule.
- **V10.** De hellingsfactoren van die bron volgen NEN-EN 1997-1 bijlage D (met een exponent m) en verschillen van de Nederlandse; ze zijn niet vergeleken.
- **V11.** Met de lagen van de bron komt de module op 155,5 en 128,5 kPa tegen 144,07 en 123,23 kPa. Het verschil is geen rekenfout: de bron gebruikt vier andere rekenregels. Ze zijn gevonden door het geval met de hand na te rekenen; met die regels volgen uit de lagen alle afgedrukte tussenwaarden van de bron (zie de tabel hieronder en de test, die beide ketens uitrekent).

  1. *Rekenwaarde van φ'.* De bron deelt de hoek door 1,15 (25° wordt 21,74°); de module deelt tan φ' (22,07°), zoals tabel A.4a voorschrijft. Dezelfde keuze als de bron van V13.
  2. *Invloedsdiepte.* De bron bepaalt ze in één stap: middel φ'd over 1,5·b', lees ze af met die rekenwaarde, en middel daarna over die ze. De module itereert tot ze niet meer verandert en leest af met φ'gem;rep (zoals de reader en V5 tot en met V7). Bron: 1,5·1,30 = 1,95 m → φ'gem;d = 24,04° → ze = 1,3135·1,30 = 1,708 m (NAP +10,19 m). Module: 1,914 m.
  3. *Volumegewicht boven het grondwater.* De bron rekent alle grond onder het aanlegniveau met γsat/1,1 − 10, ook de 0,10 m boven de grondwaterstand; de module rekent die strook met γ/1,1.
  4. *Dekking.* De bron rekent de dekking met het representatieve gewicht (0,40·18 = 7,20 kPa), de module met γ/1,1 (6,55 kPa).

  De overige stappen zijn gelijk: gewogen gemiddelden met gewicht h·z, c'/1,6, Nq, Nc, Nγ, de vormfactoren voor de rechthoek 1,30 × 5,00 m; er is geen horizontale belasting, helling of diepte- of basisfactor in het spel.

  | Stap (b = 1,30 m) | Bron | Nagerekend met de regels van de bron | Module |
  |---|---|---|---|
  | σ'v;z;d [kPa] | 7,20 | 0,40·18 = 7,20 | 0,40·18/1,1 = 6,55 |
  | ze [m] | 1,71 (tot NAP +10,19) | 1,708 | 1,914 |
  | φ'gem;rep [°] | – | – | 27,5 → ze/b' = 1,472 |
  | φ'gem;d [°] | 23,43 | 23,43 | 24,44 |
  | c'gem;d [kPa] | 1,78 | 1,78 | 1,65 |
  | γ'gem;d [kN/m³] | 8,43 | 8,43 | 9,30 |
  | Nq ; Nc ; Nγ | 9,05 ; 18,58 ; 6,98 | 9,05 ; 18,58 ; 6,98 | 10,1 ; 19,9 ; 8,2 |
  | sq ; sc ; sγ | 1,10 ; 1,12 ; 0,92 | 1,10 ; 1,12 ; 0,92 | 1,11 ; 1,12 ; 0,92 |
  | σ'max;d [kPa] | 36,91 + 71,92 + 35,24 = 144,07 | 144,07 | 155,5 |

  Van de bron naar de module, regel voor regel: 144,07 → 137,54 (dekking met γ/1,1) → 141,43 (droog gewicht boven het grondwater) → 149,65 (γφ' op tan φ') → 155,47 kPa (ze geïtereerd met φ'gem;rep). Voor b = 1,00 m: bron ze = 1,27 m, φ'gem;d = 22,18°, c' 2,12 kPa, γ' 8,33 kN/m³, 123,23 kPa, alle gelijk nagerekend; module 128,5 kPa. De regels 1, 3 en 4 van de module volgen de norm en de overige bronnen; alleen regel 2 (hoe ze wordt bepaald) is een open punt, zie hieronder. De gedraineerde doorponstabel van de bron (φ'e;d 23,97° op NAP +11,61 m enzovoort) is niet herleid: die gemiddelden lijken vanaf het aanlegniveau te zijn genomen, niet vanaf het fictieve vlak.
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
- Invloedsdiepte: de tabel komt uit de reader. Of de norm lineair interpoleren in φ' en in H/V voorschrijft, of met de representatieve of de rekenwaarde van φ' moet worden afgelezen (V8 en V11 gebruiken de rekenwaarde) en of ze iteratief of in één stap vanaf 1,5·b' moet worden bepaald (V11 doet het laatste), is niet geverifieerd. Bij V11 scheelt dat 4 % op σ'max;d. De invloedsbreedte bij φ' = 0 staat niet in de tabel; de module gebruikt 1,00·b' (Prandtl) en een doorgetrokken 0,53·b' bij H/V = 1, alleen voor de tekening.
- Het gewogen gemiddelde van φ' is genomen over de hoeken in graden, zoals de reader en de adviezen; niet over tan φ'.
- De reader onderscheidt bij gelaagde grond gevallen a, b en c en staat middelen alleen toe bij een verschil in φ'k tot 6°. De module rekent altijd het gewogen gemiddelde en voegt de doorponstoets toe waar dat verschil groter is; een cohesieve laag direct onder de voet met niet-cohesieve lagen eronder wordt ongedraineerd als oneindig diep beschouwd.
- Doorponsen: of het grondgewicht boven het fictieve vlak met het representatieve gewicht maal 1,2 (reader) of met rekenwaarden (V7) moet worden gerekend, en of de toets ook onder de invloedsdiepte moet, is niet in de norm nagegaan.
- De dekking: de reader beperkt de in rekening te brengen dekking tot 2·B; de module waarschuwt, maar kapt niet af. De adviezen rekenen de dekking met γ/1,1; twee constructieberekeningen (V11, V12) doen het anders.
- De basisfactor bij ongedraineerd komt uit NEN-EN 1997-1 bijlage D, niet uit een Nederlandse bron; een voorbeeld met een hellende onderkant is niet gevonden. De tekening laat de onderkant oplopen in de richting van Hd; de factoren kennen geen richting.
- Kantelen: geen openbaar voorbeeld met de EQU-factoren gevonden; de factoren komen uit secundaire bronnen. De toets rekent om de rand van de voet en neemt aan dat de excentriciteit van VG;rep naar de kantelrand wijst.
- De startwaarden per grondsoort in `catalog.ts` zijn indicatief en niet tegen tabel 2.b van de norm nagelopen. De grondsoort uit de sondering komt uit de indicatieve laagindeling.
- Grondwater boven het aanlegniveau: de module rekent de dekking en de grond met het effectieve gewicht en verwacht Vd als effectieve belasting; de opwaartse waterdruk wordt niet zelf berekend.
- Het volumegewicht van water is vast 10 kN/m³.
