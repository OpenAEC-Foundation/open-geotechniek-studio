# Fundering op staal: twintig openbare rekenvoorbeelden nagerekend

Dit document hoort bij `reference-examples.test.ts`. Het legt vast hoe de module uitkomt op twintig uitgewerkte rekenvoorbeelden uit openbare bronnen: een vakblad, lesmateriaal van een hogeschool, een Europees rapport met uitgewerkte Eurocode 7-voorbeelden, een leerboek en uitgewerkte voorbeelden op vakwebsites. Het zijn andere bronnen dan V1 tot en met V14 in `VERIFICATIE.md`; alleen het Europese rapport komt daar ook voor, met een ander onderdeel (V14 gebruikt de kantelmomenten, hier het draagvermogen).

## Uitkomst in het kort

- **Twintig gevallen** uit dertien documenten van zeven auteurs of instellingen.
- **Elf gelijk**: de module rekent van de invoer van de bron tot haar einduitkomst en komt binnen de afronding van het afgedrukte getal uit (R1, R2, R4 tot en met R12).
- **Negen verklaarbaar afwijkend** (R3, R13 tot en met R20), alle negen door dezelfde oorzaak: de hellingfactoren bij gedraineerd draagvermogen met een horizontale belasting. De bronnen volgen NEN-EN 1997-1 bijlage D of DIN 4017; de module volgt de Nederlandse formules. In elk van deze gevallen is de keten van de bron nagerekend met Nq, Nc, Nγ en de vormfactoren van de module en de hellingfactoren volgens de formule van de bron; die keten komt binnen 0,1 % tot 0,5 % op de uitkomst van de bron. De rest van de berekening is dus gelijk.
- **Geen onverklaarde afwijking en geen rekenfout gevonden.**
- **Niet gevonden** bij nieuwe bronnen: een voorbeeld met gelaagde grond of doorponsen, met een hellend maaiveld of met een hellende onderkant. Die onderdelen zijn hier dus niet opnieuw getoetst; zie *Wat niet is getoetst*.

## Hoe is vergeleken

De bronnen rekenen met eigen partiële factoren. De module is daarom per geval gedraaid met de factoren van de bron: meestal alles 1,0 (de bron rekent met karakteristieke waarden en deelt de weerstand achteraf, of voert rekenwaarden in), soms 1,2 of 1,25 op tan φ' en c', of 1,8 op cu. De factor op het volumegewicht is steeds 1,0. Het grondwater is zo gelegd dat de dekking en het effectieve gewicht onder de voet gelijk zijn aan die van de bron. Alle gevallen hebben één grondsoort onder de voet; de invloedsdiepte speelt daardoor geen rol.

Gelijk aan de module zijn in alle bronnen:

- `Nq`, `Nc` en `Nγ = 2·(Nq − 1)·tan φ'`. DIN 4017 schrijft `Nb0 = (Nq − 1)·tan φ'` bij een term `γ·b'·Nb0`; dat is hetzelfde als `½·γ·b'·Nγ`.
- de vormfactoren `sq = 1 + (b'/l')·sin φ'`, `sγ = 1 − 0,3·b'/l'`, `sc = (sq·Nq − 1)/(Nq − 1)`, en ongedraineerd `sc = 1 + 0,2·b'/l'`;
- de effectieve afmetingen `b' = B − 2·eB`, `l' = L − 2·eL`;
- de rekenwaarde van de wrijvingshoek via tan φ';
- de ongedraineerde formule met `ic = ½·(1 + √(1 − H/(A'·cu)))`.

Anders zijn de hellingfactoren bij gedraineerd draagvermogen, met `x = H/(V + A'·c'·cot φ')`:

| | H evenwijdig aan b' | H evenwijdig aan l' |
|---|---|---|
| Bijlage D en DIN 4017 | `iq = (1 − x)^m`, `iγ = (1 − x)^(m+1)`, `m = (2 + b'/l')/(1 + b'/l')` (strook: m = 2) | zelfde vorm, `m = (2 + l'/b')/(1 + l'/b')` |
| Module (Nederlandse formules) | `iq = (1 − 0,70·x)³`, `iγ = (1 − x)³` | `iq = iγ = 1 − x` |

DIN 4017 rekent bovendien met `x = H/V`, zonder de cohesieterm in de noemer. In beide stelsels is `ic = (iq·Nq − 1)/(Nq − 1)`.

Gevolgen, zoals ze in de voorbeelden zichtbaar worden:

- **Strook, H evenwijdig aan b'.** `iγ` is identiek aan bijlage D (m = 2). `iq` verschilt: bij H/V ≈ 0,07 minder dan 1 %, bij H/V = 0,38 is de module 3 % hoger en bij H/V = 0,49 ruim 9 % hoger (R16 tot en met R18). Op σ'max;d scheelt dat 1,1 % tot 5,2 %, steeds aan de gunstige kant.
- **Poer, H evenwijdig aan l'.** De lineaire reductie `1 − x` van de module is kleiner dan `(1 − x)^1,33` en `(1 − x)^2,33` van de bron: +2,1 % bij H/V = 0,026 (R13), +0,4 % bij H/V = 0,007 (R14). Bij een grote horizontale belasting loopt het verschil hard op: in R3 (H/V = 0,27, met cohesie) komt de module met H evenwijdig aan l' 29 % hoger uit dan de bron.

Dit is een verschil tussen normen, geen rekenfout: de module rekent de Nederlandse formules zoals ze in `VERIFICATIE.md` staan. Het is wel het punt waarop de module het meest van de Europese bijlage afwijkt, en steeds naar de gunstige kant. De regel voor H evenwijdig aan l' komt uit de HBO-reader; de normtekst zelf is niet ingezien. **Aanbevolen: deze ene regel (`iq = iγ = 1 − Hd/(Vd + A'·c'·cot φ')`) in NEN 9997-1 art. 6.5.2 nalopen.**

## De twintig gevallen

"Uitkomst bron" en "uitkomst module" zijn σ'max of de weerstand, zoals de bron die afdrukt. Het verschil is module ten opzichte van bron.

| Nr | Bron | Soort geval | Uitkomst bron | Uitkomst module | Verschil | Oordeel |
|---|---|---|---|---|---|---|
| R1 | Smith en Gilbert (2011), fig. 3 en tabel 3 | strook 2,0 m op klei, ongedraineerd, geen dekking | 617 kN/m | 617,0 kN/m | 0,0 % | gelijk |
| R2 | HTW Dresden, oefening 17, geval a | rechthoek 3,0 × 5,0 m, ongedraineerd, excentriciteit in twee richtingen, horizontale belasting, dekking | 5392,046 kN | 5392,046 kN | 0,0 % | gelijk |
| R3 | HTW Dresden, oefening 17, geval b | hetzelfde geval gedraineerd, met cohesie en grondwater | 4513,475 kN | keten van de bron 4513,5 kN; module 4506,7 kN (H // B) en 5830,3 kN (H // L) | 0,0 % (keten); −0,1 % en +29,2 % | verklaarbaar: hellingfactoren, en H in twee richtingen |
| R4 | Structural Basics, strook in klei | strook 1,4 m op klei, ongedraineerd, dekking, grondwater aan maaiveld, γcu = 1,8 | 261,1 kPa; 365,5 kN/m | 261,1 kPa; 365,5 kN/m | 0,0 % | gelijk |
| R5 | Structural Basics, poer in klei | vierkante poer 1,7 m op klei, ongedraineerd, sc = 1,2 | 346,8 kPa; 1002 kN | 346,8 kPa; 1002,2 kN | 0,0 % | gelijk |
| R6 | Bond en Harris (2008), voorbeeld 10.1, DA1-1 | poer 1,5 × 2,5 m op droog zand, gedraineerd, centrisch | 903,5 kPa | 903,5 kPa | 0,0 % | gelijk |
| R7 | Zelfde voorbeeld, DA1-2 | idem met γφ' = 1,25 op tan φ' | 394,4 kPa | 394,4 kPa | 0,0 % | gelijk |
| R8 | Structural Basics, poer in zand | vierkante poer 2,1 m op zand, grondwater op aanlegniveau, γφ = 1,2 | 379,9 kPa; 1675 kN | 379,9 kPa; 1675,4 kN | 0,0 % | gelijk |
| R9 | Structville, combinatie 1 | vierkante poer 1,5 m, c' en φ', excentriciteit in twee richtingen | 834,0 kPa | 834,0 kPa | 0,0 % | gelijk |
| R10 | Structville, combinatie 2 | idem met γφ' = γc' = 1,25 | 474,1 kPa | 474,1 kPa | 0,0 % | gelijk |
| R11 | Sachpazis, poer, combinatie 1 | poer 1,5 × 2,5 m, c' en φ', excentriciteit in de lengterichting | 941,9 kPa | 941,9 kPa | 0,0 % | gelijk |
| R12 | Sachpazis, poer, combinatie 2 | idem met γφ' = γc' = 1,25 | 534,3 kPa | 534,3 kPa | 0,0 % | gelijk |
| R13 | HTW Dresden, brugpijler, gewapend blok | poer 3,75 × 8,25 m op kiezel, grondwater, H en moment in de lengterichting | 62931 kN | keten 62931 kN; module 64275 kN | +2,1 % | verklaarbaar: hellingfactoren H // l' |
| R13 | Zelfde oefening | afschuiven met δ = ⅔·φ'; kantelen met 0,9 en 1,1 | 13275,094 kN; 10741,139 en 105689,422 kNm | 13275,094 kN; 10741,139 en 105689,421 kNm | 0,0 % | gelijk |
| R14 | HTW Dresden, brugpijler, ongewapend blok | poer 3,75 × 8,50 m, 5,25 m dekking, kleine H in de lengterichting | 121148 kN | keten 121148 kN; module 121665 kN | +0,4 % | verklaarbaar: hellingfactoren H // l' |
| R15 | HTW Dresden, oefening 13 | strook 1,5 m onder een keermuur, c' en φ', excentriciteit, H, dekking, grondwater | 346,622 kN/m | keten 346,6 kN/m; module 365,7 kN/m | +5,5 % | verklaarbaar: DIN rekent de helling met H/V zonder cohesieterm |
| R16 | EUR 26227 EN (2013), voorbeeld A.4, DA1-1 | strook 3,9 m onder een T-vormige keermuur, H/V = 0,38, excentriciteit, dekking | 279,8 kPa; 574 kN/m | 284,1 kPa; 582,8 kN/m | +1,5 % | verklaarbaar: iq; gewichtsterm gelijk (137,6 kPa) |
| R17 | Zelfde voorbeeld, DA1-2 | idem met γφ' = 1,25, H/V = 0,49 | 92 kPa; 242 kN/m | 96,8 kPa; 254,2 kN/m | +5,2 % | verklaarbaar: iq; gewichtsterm gelijk (40,4 kPa) |
| R18 | Zelfde voorbeeld, DA2* | idem met karakteristieke belasting | 351,1 kPa; 1076 kN/m | 355,1 kPa; 1088,1 kN/m | +1,1 % | verklaarbaar: iq |
| R19 | Sachpazis, strook, combinatie 1 | strook 0,8 m, c' en φ', excentriciteit, H/V = 0,08 | 420,0 kPa | keten 420,0 kPa; module 405,9 kPa | −3,3 % | verklaarbaar: de bron neemt m = 1,66 in plaats van 2 |
| R20 | Sachpazis, strook, combinatie 2 | idem met γφ' = γc' = 1,25 | 248,9 kPa | keten 249,0 kPa; module 240,8 kPa | −3,2 % | verklaarbaar: als R19 |

"Keten" is de berekening van de bron, nagerekend met de draagkracht- en vormfactoren van de module en de hellingfactoren volgens de formule van de bron.

### Wat per geval wel en niet vergelijkbaar is

- **R1, R2, R4, R5 (ongedraineerd).** Volledig vergelijkbaar. In R2 is de resultante van twee horizontale krachten ingevoerd als één Hd; ongedraineerd maakt de richting niet uit. De module toetst deze gevallen ook gedraineerd, met een aangenomen φ'; die toets hoort niet bij de bron en is niet vergeleken.
- **R3.** De bron heeft horizontale belasting in twee richtingen (50 en 150 kN) en middelt de exponent m over de richting. De module kent één richting. Vergeleken zijn b', l', Nq, Nc, Nγ, de vormfactoren en de keten van de bron. De eigen uitkomst van de module is voor beide richtingen vastgelegd; dat de waarde bij H // B vrijwel op die van de bron uitkomt, is toeval (een andere formule en een andere x heffen elkaar op).
- **R6 tot en met R12.** Volledig vergelijkbaar: geen horizontale belasting, alle tussenwaarden van de bron gelijk tot op de laatste afgedrukte decimaal. R7, R10 en R12 controleren daarnaast dat de partiële factor op tan φ' werkt (25° wordt 20,458°, 35° wordt 29,3°), R8 het effectieve gewicht onder water met de dekking erboven droog.
- **R13 en R14.** Vergelijkbaar tot en met de vormfactoren; de hellingfactoren verschillen. De bron rekent de dekking en de grond met γ' = 10 kN/m³; in de module is daarvoor het grondwater op maaiveld gelegd. Afschuiven en kantelen in R13 zijn volledig vergelijkbaar en gelijk. Daarmee is er nu wel een openbaar voorbeeld van de kanteltoets met 0,9 en 1,1 (in `VERIFICATIE.md` staat dat er geen was gevonden); de bron zet 1,1 ook op het veranderlijke moment, de test voert dat moment daarom in als permanent.
- **R15.** Vergelijkbaar tot en met Nq, Nc, Nγ en b'. De bron rekent `tan δ = H/V`; de module telt de cohesie mee in de noemer, wat de reductie verkleint (x = 0,219 tegen 0,240). Zonder cohesie is iγ van de module gelijk aan die van de bron en wijkt iq 0,4 % af.
- **R16 tot en met R18.** De excentriciteit volgt uit de momenten om de teen die de bron geeft. b', Nq, Nγ, iγ en de gewichtsterm zijn gelijk; de dekkingsterm verschilt door iq. De bron rekent door met factoren op twee decimalen; de marge op de keten is daarom 0,5 %.
- **R19 en R20.** De bron behandelt de strook als een rechthoek van 1 m lengte en komt zo op m = 1,66 in plaats van 2. Met m = 2 is iγ gelijk aan die van de module en scheelt iq 0,6 %; de bron is hier dus zelf ruimer dan bijlage D voor een strook. In R20 voldoet de bron (243,5 ≤ 248,9 kPa) en de module net niet (u.c. 1,01).

## Gevonden fouten

Geen. Twee dingen die geen fout zijn, maar wel aandacht vragen:

1. **Hellingfactoren bij H evenwijdig aan l'.** Zie hierboven: de lineaire reductie geeft bij een grote horizontale belasting een veel hoger draagvermogen dan bijlage D (R3: +29 %). De regel is niet in de normtekst nagelopen.
2. **Horizontale belasting in twee richtingen.** De module kent één richting (staat al onder *Weggelaten* in `VERIFICATIE.md`). In R3 ligt de uitkomst van de bron tussen de twee uitkomsten van de module; wie de resultante invoert, moet zelf de ongunstigste richting kiezen (H // B).

## Wat niet is getoetst

- **Gelaagde grond, invloedsdiepte en doorponsen.** Geen nieuw openbaar voorbeeld gevonden dat de tussenwaarden geeft. De Duitse norm heeft er een bijblad met rekenvoorbeelden voor (geschichteter Baugrund, Durchstanzen), maar dat is niet vrij beschikbaar. Deze onderdelen steunen dus alleen op V1, V2, V5 tot en met V8 en V11.
- **Hellend maaiveld en hellende onderkant.** Geen voorbeeld gevonden.
- **Ongedraineerd afschuiven.** Geen voorbeeld gevonden.
- De Nederlandse normregels zelf (factoren 1,15 / 1,6 / 1,35 / 1,1, de invloedsdiepte uit de tabel) komen in deze buitenlandse bronnen niet voor.

## Bekeken en niet gebruikt

- Hetzelfde Europese rapport, voorbeeld A.3 (strook onder een gebouw): de afgedrukte tabellen zijn niet te herleiden. De lengte van de strook staat alleen in een figuur, sγ is in de ene tabel 0,95 en in de andere 0,98 bij dezelfde B/L, en uit Rd en de afgedrukte factoren volgt een andere lengte dan uit sq.
- Een voorbeeld bij de tweede generatie van Eurocode 7 (Lesny en Orr, ECSMGE 2024): andere formules (onder meer dieptefactoren) en alleen eindwaarden.
- Twee funderingsadviezen bij vergunningen: het zijn de bronnen van V5 en V7.
- Tentamens en opgaven zonder uitwerking (Bochum, Cambridge), en een ontwerpleidraad met alleen formules (Lublin).
- De HBO-reader (voorbeeld 2) kon niet opnieuw worden geopend; of dat voorbeeld bruikbaar is, is niet nagegaan.

## Bronnen

| Gevallen | Bron | Adres |
|---|---|---|
| R1 | C. Smith en M. Gilbert (University of Sheffield), "Ultimate Limit State design to Eurocode 7 using numerical methods, Part II: proposed design procedure and application", *Ground Engineering*, november 2011, blz. 26-27 (figuur 3, tabel 3) | https://eprints.whiterose.ac.uk/94144/1/ULS_Design_Ground_Engineering_Part_II.pdf |
| R2, R3 | HTW Dresden, lesmateriaal bodemmechanica, "17. Übung: Grundbruch", uitwerking | https://www.zaft.htw-dresden.de/bodenmechanik/17uebung_Grundbruch/17uebung_gbr_l.pdf |
| R4 | L. Ernst, "Strip Foundation In Clay {Design Of Soil And Concrete}", Structural Basics, bijgewerkt 13 januari 2024 | https://www.structuralbasics.com/strip-foundation-clay-concrete/ |
| R5 | L. Ernst, "Pad Foundation In Clay [Design Of Soil And Concrete]", Structural Basics, bijgewerkt 2 augustus 2023 | https://www.structuralbasics.com/pad-foundation-clay-concrete/ |
| R6, R7 | A. Bond en A. Harris, *Decoding Eurocode 7*, Taylor & Francis, 2008, hoofdstuk 10, voorbeeld 10.1. | (boek; geen openbaar adres) |
| R8 | L. Ernst, "Pad Foundation Design: Sand & Concrete Verification Under Vertical Load", Structural Basics, bijgewerkt 30 april 2023 | https://www.structuralbasics.com/pad-foundation-sand-concrete/ |
| R9, R10 | Structville, "Design of Biaxial Eccentrically Loaded Pad Footing" | https://structville.com/design-of-biaxial-eccentrically-loaded-pad-footing |
| R11, R12 | C. Sachpazis, "Pad Footing Analysis & Design (EN1997-1:2004)", 15 april 2014 | https://www.slideshare.net/slideshow/sachpazis-pad-footing-analysis-design-en199712004/33546017 |
| R13 | HTW Dresden, lesmateriaal funderingstechniek, "Übung 1.1-2, Flächengründung 2", gewapend funderingsblok brugpijler as 80, versie 25 oktober 2015, par. 3 tot en met 5 | https://www.zaft.htw-dresden.de/grundbau/11_u_slf2/11_u_slf2_21l.pdf |
| R14 | HTW Dresden, zelfde reeks, ongewapend funderingsblok, par. 3 | https://www.zaft.htw-dresden.de/grundbau/11_u_slf2/11_u_slf2_1l.pdf |
| R15 | HTW Dresden, lesmateriaal funderingstechniek, oefening 13 "Schwergewichtsmauer", versie 25 april 2021, par. 4 | https://www.zaft.htw-dresden.de/grundbau/13_u_mwl2/13_u_mwl2l.pdf |
| R16, R17, R18 | A.J. Bond, B. Schuppener, G. Scarpelli en T.L.L. Orr, *Eurocode 7: Geotechnical Design. Worked examples*, JRC Scientific and Policy Report EUR 26227 EN, 2013, bijlage A.4, blz. 120-128 | https://eurocodes.jrc.ec.europa.eu/sites/default/files/2021-12/2013_06_WS_GEOa.pdf |
| R19, R20 | C. Sachpazis, "Strip Foundation Analysis and Design example (EN1997-1:2004)" | https://www.slideshare.net/slideshow/sachpazis-strip-foundation-analysis-en199712004example/30972151 |

Kanttekeningen bij de bronnen:

- De vier documenten van HTW Dresden zijn als pdf gelezen; de getallen zijn rechtstreeks uit de tekst overgenomen. Hetzelfde geldt voor het artikel van Smith en Gilbert en het Europese rapport.
- De overige bronnen zijn webpagina's; de getallen zijn daar uit de paginatekst gehaald. Elke keten is daarna uit de afgedrukte termen nageteld (de som van de termen geeft de afgedrukte uitkomst), zodat een leesfout zou zijn opgevallen.
- De rekenbladen van R9 tot en met R12 en R19 en R20 hebben dezelfde opmaak en zijn vermoedelijk met hetzelfde rekenhulpmiddel gemaakt; ze zijn onderling dus niet onafhankelijk. Dat geldt ook voor de drie artikelen van één auteur (R4, R5, R8) en de vier oefeningen van één hogeschool.
- R6 en R7 komen uit een leerboek; het hoofdstuk is ingezien in een kopie die iemand anders openbaar heeft gedeeld. Er zijn alleen getallen overgenomen.
- Er staan geen bronbestanden in de repo, alleen de getallen en de verwijzing.
