# Damwand en beschoeiing: rekenregels en verificatie

Status: **concept alpha**. De module rekent één wand met een hoge en een lage zijde in één
ontgravingsfase. Dit document zegt welke formules erin zitten, waar ze vandaan komen, wat er
tegen een bekende uitkomst is gelegd en wat niet. De normteksten zelf (NEN 9997-1, CUR 166,
NEN-EN 1993-5, NEN-EN 1995-1-1, NEN-EN 338) lagen bij het bouwen niet op tafel: alles wat
daaruit komt is uit kennis van de norm geschreven en staat in hoofdstuk 7 als open punt.

Tests: `earth-pressure.test.ts`, `blum.test.ts`, `spring-model.test.ts`, `compute.test.ts`,
`reference-cases.test.ts`, `module.test.tsx`.

## 1. Opzet

- Hoge zijde links, lage zijde rechts. Niveaus in m NAP, per strekkende meter wand.
- Per zijde: maaiveld, waterstand, grondlagen. Hoge zijde met een gelijkmatige bovenbelasting.
- Twee berekeningen met het verenmodel: met rekenwaarden (snedekrachten, ankerkracht, toetsen)
  en met representatieve waarden (verplaatsingen).
- Daarnaast Blum met dezelfde rekenwaarden, als controle.
- Soort constructie: stalen damwand uit de profielbibliotheek, doorgaande wand van planken
  (hout of een eigen doorsnede voor kunststof en beton), of palen met schotten.

## 2. Gronddruk

Alle coëfficiënten geven de horizontale component, voor een verticale wand en horizontaal maaiveld.

| Grootheid | Formule | Bron |
|---|---|---|
| Neutraal | K0 = 1 − sin φ′ | Jaky |
| Actief, recht glijvlak | Ka = cos²φ′ / (1 + √(sin(φ′+δ)·sin φ′ / cos δ))² | Coulomb, Müller-Breslau |
| Passief, recht glijvlak | Kp = cos²φ′ / (1 − √(sin(φ′+δ)·sin φ′ / cos δ))² | Coulomb, Müller-Breslau |
| Passief, gekromd glijvlak | Kp = (1 + sin φ′·sin(2m_w+φ′)) / (1 − sin φ′) · e^(2·v·tan φ′), met cos(2m_w+φ′+δ) = sin δ / sin φ′ en v = 45° − φ′/2 − m_w | NEN-EN 1997-1 bijlage C.2 |
| Cohesie | σ′a = Ka·σ′v − 2c′√Ka ≥ 0; σ′p = Kp·σ′v + Kpc·c′, Kpc = 2√Kp (recht) of (Kp − 1)·cot φ′ (gekromd) | Rankine/Bell; bijlage C.2 |
| Ongedraineerd | σh = σv − 2cu (actief) en σv + 2cu (passief), in totaalspanningen | Rankine, φ = 0 |

Keuze van het glijvlak: actief altijd recht. Passief recht zolang δ ≤ φ′/3 en daarboven gekromd,
de regel van CUR 166; de gebruiker kan ook altijd recht of altijd gekromd kiezen. De wandwrijving
wordt begrensd op φ′.

Verticale spanning: bovenbelasting plus het gewicht van de grond (γ boven en γsat onder de
waterstand), per zijde vanaf het eigen maaiveld. Waterdruk hydrostatisch per zijde met
γw = 10 kN/m³; staat het water boven het maaiveld (watergang), dan werkt het vanaf de
waterspiegel en telt de korrelspanning vanaf de bodem.

### Controle

| Geval | Verwacht | Module |
|---|---|---|
| φ′ = 30°, δ = 0: Ka, Kp, K0 | 1/3, 3, 0,5 | gelijk (12 decimalen) |
| δ = 0, φ′ = 20 tot 40°: recht en gekromd tegen Rankine tan²(45° ∓ φ′/2) | gelijk | gelijk (10 decimalen) |
| Coulomb φ′ = 30°, δ = 20°: Ka = 0,2973 en Kp = 6,105 langs de resultante; horizontaal maal cos 20° | 0,2794 en 5,737 | 0,2794 en 5,737 |
| Gekromd φ′ = 30°, δ = 20°, formule met de hand ingevuld | 2,4515 · 1,8899 = 4,633 | 4,633 |
| Gekromd φ′ = 30°, δ = 30° | 1,5 · 3,351 = 5,026 | 5,026 |
| Gekromd, cohesie bij δ = 0 | 2√3 | gelijk |
| Gekromd actief tegen Coulomb actief, δ = ⅔φ′ | binnen enkele procenten | binnen 5 % |

De Coulomb-waarden 0,2973 en 6,105 zijn de gangbare tabelwaarden uit de leerboeken. Voor het
gekromde glijvlak is **geen** gepubliceerde tabelwaarde gebruikt: de waarden uit de tabellen van
Caquot en Kérisel liggen naar herinnering ongeveer 10 % hoger dan de formule van bijlage C.2
(die aan de veilige kant ligt), maar die tabel lag er niet naast. De controle is dus: de
formule is juist ingevuld en sluit bij δ = 0 aan op Rankine.

## 3. Verenmodel

Elastisch ondersteunde ligger met aan beide zijden grondveren:

    σ′hoog = σ′0 − kh·y,  σ′laag = σ′0 + kh·y,  elk begrensd tot σ′a ≤ σ′ ≤ σ′p

met y positief naar de lage zijde en één beddingsconstante kh per laag. Het waterdrukverschil
is belasting. Een anker of stempel is een lineaire veer: horizontaal k·cos²α / h.o.h. per m wand,
of star.

De ligger wordt opgelost door de liggeroplosser van de module voor horizontaal belaste palen
(`laterally-loaded-pile/beam.ts`, ongewijzigd geïmporteerd). Die kent per element een constante
bedding en een constante lijnlast. `spring-model.ts` schrijft elke veer per element als bedding
plus lijnlast en itereert over de toestand (elastisch, actief, passief) tot die niet meer
verandert. Consequenties van deze keuze:

- De druk is per element constant (elementen van hooguit 1/140 van de wandlengte).
- Het anker is over 4 cm uitgesmeerd in plaats van een puntveer.
- Een veer op zijn grens houdt een reststijfheid van 10⁻⁴·kh, zodat het stelsel oplosbaar blijft.
  Wat de veren daardoor boven hun grens leveren wordt opgeteld; is dat meer dan 0,5 % van de
  passieve weerstand, dan meldt de module "geen evenwicht".
- Grenzen op minder dan 1 cm van elkaar vallen samen.

Wat de liggeroplosser mist voor dit gebruik (niet aangepast, wel gemeld): een puntveer of
steunpunt op een tussenknoop, een lineair verlopende lijnlast per element, en een begrensde veer
met een beginspanning. De niet-lineaire oplosser (`nonlinear-beam.ts`) is niet gebruikt: die
kent alleen een symmetrische veer zonder beginspanning.

### Controle

| Geval | Verwacht | Module |
|---|---|---|
| Gelijke grond aan beide zijden, geen belasting | y = 0, neutrale druk, één stap | gelijk |
| Lange ligger op lineaire bedding met een kracht op de kop (Hetényi): y0 = 2Hβ/k, Mmax = 0,3224·H/β op z = π/(4β) | k = 20 000 kN/m², EI = 4·10⁴ kNm², H = 50 kN | y0 op 6 decimalen, Mmax op 0,1 kNm |
| Stijve wand, q = 8 kPa, kL = kR = 1000 | y = q/(kL+kR) = 4,0 mm | 4,0 mm |
| Zelfde wand, q = 20 kPa: hoge zijde valt op de actieve grens (4 kPa) | lage zijde 24 kPa, y = 14,0 mm | 24,0 kPa, 14,0 mm |
| q = 60 kPa bij een grootste weerstand van 46 kPa | overschot 14 kPa · 4 m = 56 kN/m | 56 kN/m |
| Stijve wand op twee steunen | elk de helft van de belasting | gelijk |
| Voorbeelden (damwand verankerd en onverankerd, planken, palen): ΣH = 0, drukken binnen de grenzen, M = 0 aan kop en teen | sluit | binnen 0,5 % van de passieve weerstand |

Het verenmodel tegen Blum, met dezelfde rekenwaarden (voorbeeld in zand, 4 m kerende hoogte):

| | Verenmodel | Blum |
|---|---|---|
| Onverankerd, teen NAP −12: Mmax | 450 kNm/m | 458 kNm/m |
| Verankerd (veer), teen NAP −9: Mmax | 89,8 kNm/m | 104,5 (vrij) en 80,0 (ingeklemd) |
| Verankerd: ankerkracht horizontaal | 62,5 kN/m | 68,0 (vrij) en 58,7 (ingeklemd) |
| Teen te hoog (NAP −6) | geen evenwicht | vraagt NAP −7,01 |

De test eist dezelfde orde: binnen 30 %.

Let op bij een **starre** steun: de kop van de wand draait dan terug de grond in en de veren
boven de steun leveren extra druk. In een nagerekend geval (10 m kerende hoogte, stijf profiel,
starre steun, korte voet) is de ankerkracht uit het verenmodel bijna tweemaal die van Blum.
Dat is eigen aan een verenmodel met één beddingsconstante tot aan het maaiveld, niet aan een
rekenfout (het evenwicht sluit), maar het is een reden om de beddingsconstante van de bovenste
laag en de stijfheid van de steun met zorg te kiezen.

## 4. Blum

Uitgangspunt: p(z) = σ′a;hoog + u;hoog − σ′p;laag − u;laag, numeriek geïntegreerd (stap 1 cm).

- Onverankerd: het theoretische voetpunt ligt waar het moment van alle belasting erboven nul is.
  Benodigde teen t = u + 1,2·x, met u het belastingnulpunt onder de ontgraving en x de afstand
  van dat nulpunt tot het voetpunt.
- Verankerd, vrij opgelegde voet: momentenevenwicht om het anker; ankerkracht uit horizontaal
  evenwicht. Geen toeslag op de lengte.
- Verankerd, ingeklemde voet: de wand is ingeklemd in het voetpunt en verplaatst niet bij het
  anker; het voetpunt ligt waar het moment nul is. Toeslag als bij onverankerd.

De toets van de inheidiepte gebruikt bij een verankerde wand de vrij opgelegde voet (de kleinste
lengte waarbij er evenwicht is) en bij een onverankerde wand de ingeklemde voet met toeslag.

### Controle

| Geval | Verwacht | Module |
|---|---|---|
| Onverankerd, h = 3 m, γ = 18, Ka = 1/3, Kp = 3: d = h/((Kp/Ka)^⅓ − 1) | 2,7776 m | 2,778 m |
| Zelfde: belastingnulpunt u = h·Ka/(Kp − Ka) | 0,375 m | 0,375 m |
| Zelfde: Mmax = γ(Ka·4,5³ − Kp·1,5³)/6 op 1,5 m onder de ontgraving | 60,75 kNm/m | 60,75 kNm/m |
| Verankerd vrij, h = 6 m, anker op 1 m: d uit het momentenevenwicht (bisectie), A = ½γ(Ka(h+d)² − Kp·d²) | gelijk | d op 1 mm, A op 0,1 kN/m |
| Verankerd ingeklemd: een ligger die in het voetpunt is ingeklemd, opgelost met de liggeroplosser | zelfde ankerkracht, geen moment in het voetpunt | binnen 2 % |

## 5. Veiligheid en toetsen

Rekenwaarden: tan φ′d = tan φ′/γφ′, c′d = c′/γc′, cu;d = cu/γcu, γd = γ/γγ, q·γQ, kh/γk. De
wandwrijving houdt haar verhouding tot φ′. Toeslag op de kerende hoogte: een percentage van de
hoogte (onder de steun, of vanaf het maaiveld bij een onverankerde wand) met een maximum.
Waterstanden: hoge zijde omhoog, lage zijde omlaag. Alle factoren staan in de invoer en zijn
aan te passen.

Sets in de keuzelijst (voorstel, zie hoofdstuk 7):

| Set | γφ′ | γc′ | γcu | Toeslag kerende hoogte | Water |
|---|---|---|---|---|---|
| RC1 | 1,15 | 1,15 | 1,50 | 10 %, hooguit 0,50 m | 0 |
| RC2 | 1,175 | 1,25 | 1,60 | 10 %, hooguit 0,50 m | 0 |
| RC3 | 1,20 | 1,40 | 1,65 | 10 %, hooguit 0,50 m | 0 |

Toetsen:

- **Staal** (NEN-EN 1993-5): Mc;Rd = βB·W·fy/γM0 met W plastisch voor doorsnedeklasse 1 en 2
  en elastisch voor klasse 3 (de klasse komt uit de profielbibliotheek; klasse 4 geeft geen
  toets). Dwarskracht: Av = tw(h − tf) per plankbreedte, Vpl;Rd = Av·fy/(√3·γM0). Normaalkracht:
  Npl;Rd = A·fy/γM0; interactie 1,11·(1 − n) voor Z en 1,33·(1 − n) voor U in klasse 1 en 2
  boven n = 0,10 en 0,25, lineair in klasse 3.
- **Hout** (NEN-EN 1995-1-1): fd = kmod·fk/γM; buiging σm;d ≤ fm;d; afschuiving
  τd = 1,5·V/(kcr·A) (rechthoek) of 4/3·V/(kcr·A) (rond) ≤ fv;d. Standaard klimaatklasse 3 met
  blijvende belasting: kmod = 0,50, γM = 1,3.
- **Eigen doorsnede** (kunststof, beton): tegen het opneembare moment en de dwarskracht die de
  gebruiker invoert, met de buigstijfheid die hij invoert.
- **Palen met schotten**: per m wand met EI van de paal gedeeld door de h.o.h.-afstand. Boven de
  onderkant van de schotten werkt de druk over de volle breedte; eronder de gronddruk en het
  waterdrukverschil over paalbreedte/h.o.h., en de passieve weerstand en de bedding over
  factor × paalbreedte/h.o.h. (niet meer dan 1). De standaard voor de factor is 3, naar Broms
  (1964) voor een losse paal in niet-cohesieve grond; het is invoer. Moment en dwarskracht per
  paal zijn de uitkomst per m wand maal de h.o.h.-afstand. Het schot: ligger op twee steunpunten
  met overspanning h.o.h. en de grootste druk op het schot, M = q·a²/8 en V = q·a/2.
- **Passieve weerstand**: de som van de korreldruk aan de lage zijde uit het verenmodel tegen de
  som van de passieve korreldruk.
- **Inheidiepte**: aanwezige lengte onder de ontgraving tegen wat Blum vraagt.

Controle in `compute.test.ts`, met de hand uitgeschreven: spanningen in gelaagde grond met water
(σv = 47, u = 5, σ′a = 14, σ′0 = 21, σ′p = 126 kPa), open water boven de bodem, de ongedraineerde
laag, de rekenwaarden en de toeslag (0,30 m, 0,40 m en het maximum 0,50 m), AZ 18-700 in S355GP
(639 kNm/m, 1083 kN/m, 4942 kN/m), een houten plank D40 van 50 mm (EI = 135,4 kNm²/m,
MRd = 6,41 kNm/m, VRd = 36,1 kN/m), een ronde paal van 160 mm (MRd = 6,19 kNm, VRd = 16,3 kN) en
de breedtefactoren 0,2 en 0,6 onder de schotten.

## 6. Openbare berekeningen

Een verzameling van dertig openbaar gepubliceerde berekeningen van kerende wanden is naast de
module gelegd. De getallen hieronder zijn overgenomen uit een uittreksel van de tekstlaag van
die stukken; de stukken zelf zijn bij het narekenen niet opnieuw geopend.

### 6.1 Collegevoorbeeld verankerde damwand, vrije opleg (nagerekend)

Bron: werkcollege grondmechanica van een universiteit, 2012,
<https://users.metu.edu.tr/nejan/366/files/Recitation5_RetainingStructures_Part_B_Spring2012_Version3.pdf>.
Kerende hoogte 10 m, anker op 3 m onder de kop, bovenbelasting 10 kPa, geen grondwater, zand
φ = 35°, γ = 18 kN/m³, Rankine met de afgeronde Ka = 0,27 en Kp = 3,69.

| | Bron | Module (Blum, vrije opleg) | Verschil |
|---|---|---|---|
| Inheidiepte D | 2,80 m | 2,81 m | +0,4 % |
| Ankerkracht | 172 kN/m | 171,1 kN/m | −0,5 % |
| Dwarskracht nul op | 7,88 m | 7,86 m | −2 cm |
| Mmax | 359,24 kNm/m | 354,9 kNm/m | −1,2 % |

Met de onafgeronde coëfficiënten (0,2710 en 3,690) geeft de module D = 2,82 m, A = 171,8 kN/m en
Mmax = 356,6 kNm/m. De test eist 2 %.

### 6.2 Onverankerde stalen damwand langs een rivier (nagerekend, met verschillen)

Bron: damwandberekening van een permanente grond- en waterkering, 2022,
<https://repository.officiele-overheidspublicaties.nl/externebijlagen/exb-2023-30219/currentItem>.
Profiel GU 8N in S240GP, bovenkant NAP +20,50 m, teen NAP +13,00 m; water NAP +20,44 m (hoog) en
NAP +18,65 m (laag); bodem lage zijde NAP +18,65 m; vier lagen (dijksmateriaal, opgebracht zand,
zandhoudende klei, vast zand en grind) met δ = ⅔φ′ en drie beddingsconstanten per laag;
factorset RC3. De buigstijfheid van de module (25 221 kNm²/m) is gelijk aan die in de bron.

De bron rekent met een verenmodel uit een extern geotechnisch software-pakket. De module wijkt
af in de invoer: één beddingsconstante per laag (hier de eerste tak), een vlak maaiveld achter
de wand (de bron heeft een aflopend maaiveld), geen stappenplan met lage en hoge stijfheid, en de
factoren en toeslagen van hoofdstuk 5 in plaats van die van de bron.

| | Bron | Module | Verschil |
|---|---|---|---|
| Moment | 89,75 kNm/m | 76,4 kNm/m | −15 % |
| Dwarskracht | 48,93 kN/m | 35,1 kN/m | −28 % |
| Verplaatsing (representatief) | 31,4 mm | 15,6 mm | −50 % |
| Aangesproken passieve weerstand | 62,3 % | 57,9 % | −4 procentpunt |

Varianten van de module: met de waterstandstoeslag die in zulke rapporten gangbaar is (hoog
+0,05 m, laag −0,25 m) wordt het moment 81,2 kNm/m en de dwarskracht 37,5 kN/m; met de derde tak
van de beddingsconstante wordt de verplaatsing 19,1 mm en verandert het moment minder dan 1 %.
Blum geeft met dezelfde rekenwaarden 76,9 kNm/m.

Conclusie: moment, dwarskracht en aangesproken weerstand liggen in dezelfde orde maar **lager dan
de bron**, en de verplaatsing is de helft. De verplaatsing is verklaarbaar (één lineaire tak is
stijver dan de drietakkige veer); voor het verschil in moment en dwarskracht is geen oorzaak
aangewezen. Mogelijke oorzaken zijn de factoren en toeslagen van de bron, een andere passieve
coëfficiënt en het stappenplan. Dit geval is dus geen bevestiging van het verenmodel, wel een
maat voor hoe ver de eerste versie van een volledige berekening af ligt. De test legt het
verschil vast (binnen 30 %, aan de lage kant) en toetst de verplaatsing niet tegen de bron.

### 6.3 Niet nagerekend

- Handboekvoorbeeld onverankerde damwand bij een oever (Rankine met een talud boven de wand):
  de module kent geen hellend maaiveld.
- De oevers met kunststof en houten wanden uit de verzameling: van één ontbreekt de grondopbouw
  in het uittreksel, van de andere de buigstijfheid van het profiel, en ze hebben een aflopende
  waterbodem. Voor de beschoeiingen is er dus **geen** vergelijking met een openbare berekening.
- De overige rapporten met volledige invoer hebben fasering, taluds, strookbelastingen of
  voorspanning; bij een aantal is de tabel in de tekstlaag door elkaar geraakt.

## 7. Niet tegen de normtekst of een publicatie gelegd

| Onderwerp | Wat erin zit | Status |
|---|---|---|
| Partiële factoren per RC (γφ′, γc′, γcu) | tabel in hoofdstuk 5 | uit kennis van NEN 9997-1 tabel A.4 voor damwanden; γφ′ met vertrouwen, γc′ en γcu minder zeker |
| Factor op volumegewicht, bovenbelasting, beddingsconstante | 1,0 | aanname; aanpasbaar |
| Toeslag op de kerende hoogte | 10 %, hooguit 0,50 m | NEN-EN 1997-1 art. 9.3.2.2; de Nederlandse invulling niet nagelopen |
| Toeslag op de waterstanden | 0 (openbare rapporten gebruiken vaak +0,05 en −0,25 m) | niet nagelopen; aanpasbaar |
| Stappenplan 6.1 tot en met 6.5 van CUR 166, lage en hoge stijfheid, factor op de uitkomst van de representatieve berekening | niet aanwezig | niet in deze versie |
| Beddingsconstanten CUR 166 tabel 3.3 | geen tabelwaarden; invoer | bewust weggelaten |
| Regel δ > φ′/3 voor het gekromde glijvlak | als keuze "auto" | uit kennis van CUR 166 |
| Formules bijlage C.2 | hoofdstuk 2 | uit kennis van de norm; getoetst op de grenzen, niet op een tabelwaarde |
| NEN-EN 1993-5: Av, interactie M-N (1,11 en 1,33, grenzen 0,10 en 0,25), βB | hoofdstuk 5 | uit kennis van de norm |
| NEN-EN 338 sterkteklassen (fm;k, fv;k, E0;mean) | C18 tot D70 | uit kennis van de norm; aanpasbaar |
| kmod klimaatklasse 3 (0,50), γM = 1,3, kcr = 0,67 | standaard | uit kennis van NEN-EN 1995-1-1; kcr volgens de nationale bijlage niet nagelopen |
| Factor ruimtelijke werking 3 (Broms) | standaard, invoer | geldt voor een losse paal in niet-cohesieve grond; voor klei en voor palen dicht bij elkaar niet onderbouwd |
| Plattegrond van het stalen profiel in 3D | plankbreedte, wandhoogte en plaatdikten uit de bibliotheek; flensbreedte geschat, sloten niet getekend | tekenmaat, geen rekenwaarde |

## 8. Niet in deze versie

- Fasering, voorspanning, meer dan één ankerrij, uitval van een anker.
- De drietakkige veer (kh1, kh2, kh3) en het stappenplan van CUR 166.
- Hellend maaiveld, taluds, een aflopende waterbodem, belastingen op afstand van de wand.
- Grondwaterstroming om de teen en het effect daarvan op de korrelspanning; stijghoogten per laag.
- Verticaal evenwicht, algehele stabiliteit, opbarsten en onderloopsheid.
- Ontwerp van ankerstaaf, groutlichaam, ankerschot en gording; stabiliteit van het ankerlichaam.
- Corrosie, plooi en doorsnedeklasse 4 van koudgevormde profielen, reductie van het moment bij
  hoge dwarskracht, knik.
- Kruip van hout en kunststof (kdef), aantasting van hout op de waterlijn, de toets van de
  vervorming tegen een eis.
- Beschoeiing van palen met schotten met een verankerde paal; schotten van een ander materiaal
  dan hout.
- De uitdraai is in het Nederlands; de teksten op het scherm zijn vertaald.
