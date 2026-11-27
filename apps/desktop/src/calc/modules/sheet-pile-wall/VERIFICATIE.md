# Damwand en beschoeiing: rekenregels en verificatie

Status: **beta release**. De module rekent een wand met een hoge en een lage zijde, in één fase of in
bouwfasen, met één of meer steunpunten, en desgewenst met het stappenplan 6.1 tot en met 6.5 (hoofdstuk
12 tot en met 16). Dit document zegt welke formules erin zitten, waar ze vandaan komen, wat er
tegen een bekende uitkomst is gelegd en wat niet. De normteksten zelf (NEN 9997-1, CUR 166,
NEN-EN 1993-5, NEN-EN 1995-1-1, NEN-EN 338) lagen bij het bouwen niet op tafel: alles wat
daaruit komt is uit kennis van de norm geschreven en staat in hoofdstuk 7 als open punt.

Tests: `earth-pressure.test.ts`, `blum.test.ts`, `spring-model.test.ts`, `compute.test.ts`,
`grout-anchor.test.ts`, `grout-anchor-ui.test.tsx`, `reference-cases.test.ts`, `module.test.tsx`.

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

met y positief naar de lage zijde. Per laag één beddingsconstante (één tak), of de drietakkige
veer van CUR 166 met kh1, kh2 en kh3. Bij drie takken zijn het secanswaarden vanaf het actieve
punt: de druk bereikt 50 %, 80 % en 100 % van (σ′p − σ′a) na een verplaatsing van 0,5·Δp/kh1,
0,8·Δp/kh2 en Δp/kh3; de lijn wordt verschoven tot hij bij y = 0 door de neutrale druk gaat. Die
lezing van de drie takken is niet tegen de tekst van CUR 166 gelegd, maar reproduceert de
afgedrukte berekening van hoofdstuk 6.2 (moment, dwarskracht, verplaatsing en de som van de
gronddruk aan beide zijden) binnen 3 %.

Het waterdrukverschil is belasting. Een anker of stempel is een lineaire veer: horizontaal
k·cos²α / h.o.h. per m wand, of star; bij een groutanker met de voorspankracht als beginkracht
(kracht = k·y + voorspanning).

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
| Zelfde, één steun met 5 kN voorspanning, k = 10⁵ kN/m | beide 20 kN; y = 0,15 en 0,20 mm | gelijk |
| Drie takken, σ′a = 0, σ′p = 100, k = 20 000 / 10 000 / 5 000: knikpunten | 2,5, 8 en 20 mm | gelijk |
| Stijve wand tegen die veer, 40, 65 en 90 kPa | 2,0, 5,25 en 14,0 mm (tak 1, 2, 3) | gelijk |
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
- **Buigstijfheid**: een reductiefactor op EI (invoer, standaard 1,0) voor U-planken zonder
  volledige schuifkrachtoverdracht in de sloten.
- **Water**: γw is invoer (standaard 10 kN/m³). Wateroverspanning per laag, lineair van de
  bovenkant naar de onderkant van de laag, boven op de hydrostatische druk; de onderste laag
  houdt de bovenwaarde.
- **Passieve weerstand**: de som van de korreldruk aan de lage zijde uit het verenmodel tegen de
  som van de passieve korreldruk.
- **Inheidiepte**: aanwezige lengte onder de ontgraving tegen wat Blum vraagt.

### Groutanker

Soort steun: stempel (horizontaal, naar de lage zijde), ankerstaaf naar een ankerschot of ankerpaal
(veerstijfheid als invoer, of star) of groutanker.

| Grootheid | Formule |
|---|---|
| Veerstijfheid per anker | k = E·A / L_vrij |
| Horizontaal per m wand | k·cos²α / h.o.h. |
| Voorspanning in de wand | P0·cos α / h.o.h. als beginkracht van de veer |
| Ankerkracht per anker | F = F_h · h.o.h. / cos α |
| Normaalkracht in de wand | F_h · tan α, telt mee in de toets buiging met normaalkracht |
| Rekenwaarde ankerkracht | F_A;d = factor · F (factor is invoer, voorstel 1,25) |
| Trekelement | R_t;d = A·f / γs, met f = f_p0,1k (strengen) of f_y (staaf); γs invoer, voorstel 1,15 |
| Houdkracht groutlichaam | R_a;k = π·D·L_grout·τ; R_a;d = R_a;k / γa; τ is invoer, γa invoer, voorstel 1,1 |
| Actief glijvlak | vanaf de teen onder θ = 45° + φ′gem;d / 2, φ′ gewogen naar laagdikte over de hoogte van de wand |
| Vrije lengte minstens | L = (z_anker − z_teen) / (tan θ·cos α + sin α): het snijpunt van de ankerlijn met het glijvlak |

Verder meldt de module als het groutlichaam boven het maaiveld uitkomt of door een laag gaat met
φ′ < 27,5° of een ongedraineerde laag, en geeft ze de lengte van het groutlichaam per laag.

Controle in `grout-anchor.test.ts`: 4 strengen van 150 mm² (A = 600 mm², E = 195 000 N/mm²),
6 m vrij: k = 19 500 kN/m, horizontaal 5223 kN/m per m bij 30° en h.o.h. 2,8 m. Staal:
600·1600/1,15 = 834,8 kN. Groutlichaam rond 150 mm, 6 m, τ = 200 kPa: 565,5 kN, gedeeld door 1,1
is 514,1 kN. Ligging: begin op 5,196 m achter de wand op NAP −4,0 m; het snijpunt met het
glijvlak ligt op het glijvlak (hoogte boven de teen = afstand · tan θ). Met voorspanning sluit
het horizontale evenwicht en is de ankerkracht k·y + voorspanning.

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

### 6.2 Onverankerde stalen damwand langs een rivier (nagerekend en verklaard)

Bron: damwandberekening van een permanente grond- en waterkering, 2022,
<https://repository.officiele-overheidspublicaties.nl/externebijlagen/exb-2023-30219/currentItem>.
Het stuk is voor dit hoofdstuk zelf gelezen (tekstlaag, 28 pagina's). De bron is een externe
referentie-berekening met een verenmodel; zij drukt de representatieve berekening (stap 6.5)
volledig af, met de gronddruk per segment aan beide zijden, en geeft van de berekening met
rekenwaarden (stap 6.3 en 6.4) de uitkomsten.

Invoer van de bron: profiel GU 8N in S240GP, bovenkant NAP +20,50 m, teen NAP +13,00 m;
EI = 2,5221·10⁴ kNm²/m met een reductiefactor 0,66 (1,6646·10⁴); water NAP +20,44 m (hoog) en
NAP +18,65 m (laag), γw = 9,81 kN/m³; bodem lage zijde NAP +18,65 m; vier lagen met δ = ⅔φ′ en drie
beddingsconstanten; aan de lage zijde een wateroverspanning per laag (0 tot 5,37 kPa in het zand,
5,37 tot 17,56 kPa in de klei, 17,56 kPa in het grind: de stijghoogte loopt met de diepte op
naar het rivierpeil); passieve gronddruk met rechte glijvlakken (Kp = 5,74 voor het zand);
maaiveld achter de wand na 2 m aflopend. Rekenwaarden: RC3 met γφ′ = 1,2, γc′ = 1,4, lage
beddingsconstanten gedeeld door 1,3, kerende hoogte +10 % (hooguit 0,5 m), water hoge zijde
+0,05 m en lage zijde −0,25 m; stap 6.5 maal 1,35 als extra toets.

**Eerste stap: de rekenkern los van de gronddruk.** Met de gronddrukken, waterdrukken en
beddingsconstanten zoals de bron ze afdrukt, geeft `spring-model.ts`:

| Stap 6.5 | Bron | Rekenkern met de drukken van de bron |
|---|---|---|
| Moment | 50,03 kNm/m | 49,7 kNm/m |
| Dwarskracht | −28,48 en +26,96 kN/m | −28,4 en +27,2 kN/m |
| Verplaatsing kop en teen | 31,4 en 1,6 mm | 30,6 en 1,7 mm |
| Korreldruk links en rechts | 100,1 en 180,8 kN/m | 100,0 en 180,7 kN/m |

De liggeroplosser, de iteratie en de drietakkige veer zijn dus in orde; het verschil van de
eerste versie zat in de invoer van het model. (Deze proef is eenmalig gedaan en zit niet in de
tests, omdat ze de tabellen van de bron zou moeten overnemen.)

**Tweede stap: de module met de invoer van de bron** (`reference-cases.test.ts`). De enige
afwijking die overblijft is het maaiveld achter de wand: hier vlak, in de bron aflopend.

| | Bron | Module | Verschil |
|---|---|---|---|
| Stap 6.5: moment | 50,03 kNm/m | 49,9 kNm/m | −0,3 % |
| Stap 6.5: dwarskracht | −28,48 kN/m | −28,5 kN/m | 0 % |
| Stap 6.5: verplaatsing kop | 31,4 mm | 30,1 mm | −4 % |
| Stap 6.5: aangesproken weerstand | 35,6 % | 38,6 % | +3 procentpunt |
| Stap 6.3: moment | 89,75 kNm/m | 87,7 kNm/m | −2,3 % |
| Stap 6.3: dwarskracht | 48,93 kN/m | 48,1 kN/m | −1,7 % |
| Stap 6.3: aangesproken weerstand | 62,3 % | 64,5 % | +2 procentpunt |

Ook de tussenwaarden kloppen: Kp van het zand 5,74, waterspanning aan de lage zijde 31,37 kPa op
NAP +16,00 m en 66,89 kPa op NAP +13,00 m, passieve korreldruk 115,9 kPa op NAP +16,17 m. De
test eist 5 % op moment en dwarskracht en 10 % op de verplaatsing.

**Waar het verschil van de eerste versie vandaan kwam** (representatief; moment in kNm/m):

| Stap | Moment | Verplaatsing kop |
|---|---|---|
| Eerste versie: één tak, hydrostatisch, volle EI, gekromd glijvlak, γw = 10 | 45,4 | 15,6 mm |
| Passief met het rechte glijvlak, zoals de bron (Kp 5,74 in plaats van 4,63) | 39,5 | 12,3 mm |
| Wateroverspanning aan de lage zijde, γw = 9,81 | 48,5 | 17,5 mm |
| Drie takken | 50,6 | 22,3 mm |
| EI maal 0,66 | 49,9 | 30,1 mm |

1. **Wateroverspanning aan de lage zijde: +23 % op het moment.** Dit was de oorzaak aan de
   onveilige kant. De bron laat de stijghoogte aan de lage zijde met de diepte oplopen; dat
   verhoogt daar de waterdruk en verlaagt de korrelspanning en dus de passieve weerstand. De
   eerste versie rekende hydrostatisch. Hersteld: wateroverspanning per laag is invoer, en zonder
   die invoer waarschuwt de module bij een waterstandsverschil met dit getal erbij.
2. **Glijvlak voor de passieve gronddruk: −13 %.** De bron rekent passief met rechte glijvlakken
   bij δ = ⅔φ′ en verlaagt δ alleen boven φ′ = 30° (35° wordt 16,6°). De module rekent bij δ > φ′/3
   met het gekromde glijvlak van bijlage C.2 en komt lager uit (4,63 tegen 5,74). Dit compenseerde
   in de eerste versie een deel van punt 1. Het is geen fout maar een keuze, en de module is hier
   strenger: met het gekromde glijvlak en verder de invoer van de bron is er met rekenwaarden
   geen evenwicht. Welke van de twee CUR 166 voorschrijft is niet nagelopen (hoofdstuk 7).
3. **Drie takken: +4 % op het moment, +27 % op de verplaatsing.** Hersteld: kh2 en kh3 zijn invoer.
4. **Reductie op EI: moment vrijwel gelijk, verplaatsing +35 %.** Hersteld: reductiefactor is invoer.
5. **Rekenwaarden**: de bron deelt de beddingsconstanten door 1,3 en past de waterstanden aan
   (+0,05 en −0,25 m); beide zijn in de module in te stellen en staan in de sets op 1,0 en 0.
6. **Aflopend maaiveld achter de wand**: niet in de module. In dit geval is het effect klein
   (de module zit met vlak maaiveld binnen 3 % van de bron).

De −15 % op het moment en −28 % op de dwarskracht uit de eerste versie zijn daarmee verklaard.
De dwarskracht week meer af omdat de grootste dwarskracht in de bron onder in de wand ligt, waar
de wateroverspanning het zwaarst telt.

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
| Toeslag op de waterstanden | 0 (de berekening van 6.2 gebruikt +0,05 en −0,25 m) | niet nagelopen; aanpasbaar |
| Factor op de beddingsconstante | 1,0 (de berekening van 6.2 deelt de lage waarden door 1,3) | niet nagelopen; aanpasbaar |
| Stappenplan 6.1 tot en met 6.5 van CUR 166, lage en hoge stijfheid, factor op de uitkomst van de representatieve berekening | hoofdstuk 13 | zoals openbare uitvoer het per stap afdrukt; niet tegen de tekst van CUR 166 gelegd |
| Fasering: begindruk van een veer in een volgende fase = druk aan het eind van de vorige fase + K0 · Δσ′v, binnen de nieuwe grenzen; geen ontlasttak | hoofdstuk 12 | eigen schematisering; niet tegen CUR 166 gelegd; gecontroleerd met openbare berekeningen nr. 5 en 6 |
| Spreiding van belastingen op afstand en van een talud (Boussinesq, gespiegeld in de wand) | hoofdstuk 14 | gangbare elastische benadering (Poulos en Davis, 1974); de openbare berekeningen rekenen met Culmann, zie 16.3 |
| Verticaal evenwicht: alleen de wrijving aan de hoge zijde omlaag, puntweerstand q_b;max · A / (ξ · γ_b), ξ = 1,39 en γ_b = 1,2 | hoofdstuk 15 | in de vorm van openbare uitvoer (nr. 3, sluit op 0,1 %); niet tegen NEN 9997-1 gelegd |
| Ankerstaaf: k_t = 0,6, γ_M2 = 1,25, F_tt;Rd en F_tg;Rd | hoofdstuk 15 | uit kennis van NEN-EN 1993-5 art. 7.2.3; niet tegen de normtekst gelegd |
| Gording: M = q · a² / c met c = 10 voor een doorgaande ligger | hoofdstuk 15 | benadering; c is invoer |
| Beddingsconstanten CUR 166 tabel 3.3 | geen tabelwaarden; invoer (één of drie per laag) | bewust weggelaten |
| Regel δ > φ′/3 voor het gekromde glijvlak | als keuze "auto" | uit kennis van CUR 166; de openbare berekening van 6.2 rekent passief met rechte glijvlakken en een verlaagde δ boven φ′ = 30°. De module is met "auto" strenger; welke regel de publicatie geeft is niet nagelopen |
| Drietakkige veer: secanswaarden vanaf het actieve punt, knikken op 50 en 80 % | hoofdstuk 3 | niet tegen CUR 166 gelegd; reproduceert de afgedrukte berekening van 6.2 |
| Groutanker: extra factor 1,25 op de ankerkracht | invoer | zo gebruikt in openbare rapporten; niet tegen NEN 9997-1 en CUR 166 gelegd |
| Groutanker: γs = 1,15 en γa = 1,1 | invoer | γs uit NEN-EN 1992-1-1 voor voorspanstaal, γa uit NEN-EN 1997-1 tabel A.12 (aanbevolen waarde); de Nederlandse bijlage en de ξ-factoren voor proeven niet nagelopen |
| Groutanker: schachtwrijving | invoer, geen afleiding uit de conusweerstand | bewust weggelaten |
| Groutanker: glijvlak vanaf de teen onder 45° + φ′/2, zonder extra marge | hoofdstuk 5 | gangbare schematisering; de eis van CUR 166 (vertrekpunt en marge) niet nagelopen |
| Trekelementen Y1860S7 (1600 / 195 000), Y1050H (950 / 205 000), B500B (500 / 200 000) | keuzelijst | uit kennis van de productnormen; aanpasbaar |
| Laag "draagkrachtig" voor het groutlichaam: φ′ ≥ 27,5° en gedraineerd | alleen een melding | eigen grens, geen normwaarde |
| Formules bijlage C.2 | hoofdstuk 2 | uit kennis van de norm; getoetst op de grenzen, niet op een tabelwaarde |
| NEN-EN 1993-5: Av, interactie M-N (1,11 en 1,33, grenzen 0,10 en 0,25), βB | hoofdstuk 5 | uit kennis van de norm |
| NEN-EN 338 sterkteklassen (fm;k, fv;k, E0;mean) | C18 tot D70 | uit kennis van de norm; aanpasbaar |
| kmod klimaatklasse 3 (0,50), γM = 1,3, kcr = 0,67 | standaard | uit kennis van NEN-EN 1995-1-1; kcr volgens de nationale bijlage niet nagelopen |
| Factor ruimtelijke werking 3 (Broms) | standaard, invoer | geldt voor een losse paal in niet-cohesieve grond; voor klei en voor palen dicht bij elkaar niet onderbouwd |
| Afroesting: dikteverlies NEN-EN 1993-5 tabel 4-1 en 4-2, doorsnedeklasse met de verkleinde flensdikte (grenzen tabel 5-1: U 37/49, Z 45/66) | hoofdstuk 11 | aanbevolen waarden uit kennis van de norm, niet tegen de normtekst of de Nederlandse bijlage gelegd; de klasse volgt uit de klassen van de catalogus en is bij twijfel de ongunstigste |
| Vorm van het stalen profiel in de tekeningen | hoofdstuk 9 | 122 profielen met de exacte contour uit de fabriekstekening, getoetst op A, I, W_el en W_pl; de overige 62 schematisch: b, h, t en s uit de tabel, flensbreedte en lijfhoek afgeleid uit A en I, slotvorm schematisch |

## 8. Niet in deze versie

- Uitval van een anker als aparte berekening; een ontlasttak van de veer (bij terugbewegen volgt
  de veer dezelfde takken, verschoven naar de stand van nu).
- Rekenwaarden alleen in de getoetste fase (de "methode B" van sommige uitvoer); hier gelden de
  rekenwaarden in alle fasen.
- Een glijvlakberekening (Culmann) over het hele profiel met het werkelijke maaiveld: de module rekent
  de gronddruk per laag (Coulomb, bijlage C.2) en een talud of belasting op afstand als extra
  verticale spanning (hoofdstuk 14). De verlaging van δ boven φ′ ≈ 30° die de uitvoer afdrukt (16,6°) is
  geen automatisme; δ is per laag en per zijde in te voeren.
- Een puntlast of moment op de kop van de wand (nr. 2 van de verzameling).
- Bij een groutanker: de stabiliteit van het diepe glijvlak (Kranz), de afleiding van de
  schachtwrijving uit de sondering, beproeving, kruip en de vrije lengte met een extra marge.
- Een berekening van de grondwaterstroming om de teen: de wateroverspanning per laag is invoer, en
  geldt in alle fasen.
- Algehele stabiliteit (Bishop), opbarsten en onderloopsheid.
- Het ankerschot en de ankerpaal; de stabiliteit van het ankerlichaam.
- Plooi en doorsnedeklasse 4 van koudgevormde profielen, reductie van het moment bij
  hoge dwarskracht, knik.
- Kruip van hout en kunststof (kdef), aantasting van hout op de waterlijn.
- Andere grondlagen per fase (bijvoorbeeld een zandbed van ander materiaal): de lagen gelden in alle
  fasen.
- In 3D: het maaiveldprofiel en de belastingen op afstand (alleen in de doorsnede getekend).
- Beschoeiing van palen met schotten met een verankerde paal; schotten van een ander materiaal
  dan hout.
- De uitdraai is in het Nederlands; de teksten op het scherm zijn vertaald.

## 9. Profielvorm in de tekeningen

De contour van een stalen damwandprofiel komt uit één functie, `calc/library/sheetPileContour.ts`,
die de doorsnede, het detail in de invoer en de uitdraai, de 3D-weergave en de schets in de module
voor horizontaal belaste palen voedt.

### 9.1 Exacte contour uit de fabriekstekening

Voor 122 van de 184 profielen staat de exacte doorsnede in `calc/library/sheet-pile-contours.json`:
de omtrek van de planken met de sloten zoals de openbare CAD-tekening van de fabrikant hem geeft
(meestal een dubbele plank), met per profiel de fabrikant, het bestand, het adres en de
ophaaldatum (27-11-2026). Bogen zijn opgedeeld met een koordafwijking van ten hoogste 0,05 mm,
punten afgerond op 0,01 mm; x loopt langs de wand vanaf de linker slotas, y = 0 is de zwaartelijn
van de getekende planken (de as van de wand). De eenheid van de tekening (mm of inch) volgt uit de
wandhoogte in de bibliotheek. De tekeningen zelf staan niet in de repo.

| Fabrikant | Reeks | Met contour | Bron |
|---|---|---|---|
| ArcelorMittal | AZ, AU, PU, GU, AS 500 | 40 + 6 + 14 + 26 + 6 = 92 (alle) | zip met DXF (en dezelfde tekeningen als DWG), download center, september 2026 |
| terra infrastructure | TKL | 16 van 55 | DXF per productpagina; de overige 39 varianten hebben geen eigen tekening |
| Nucor Skyline | NZ, PZ | 10 + 4 = 14 (alle) | zip met DWG (NZ in inch, PZ metrisch), CAD-pagina van de fabrikant |
| JFE Steel | U en hoed | 0 van 12 | geen openbare CAD-download gevonden |
| Nippon Steel | U en hoed | 0 van 11 | CAD alleen na een formulier met persoonsgegevens; niet opgehaald |

Controle per profiel (`calc/library/sheetPileDrawings.test.ts`): uit de opgeslagen omtrekken
(veelhoeken, formules van Green) volgen per m wand A, I om de zwaartelijn, W_el = I / e met e de
afstand tot de uiterste vezel, en W_pl = S_boven + S_onder om de plastische neutrale lijn (gelijke
oppervlakken). Eis: A binnen 3 % en I, W_el en W_pl binnen 5 % van de profieltabel. Dit is een
onafhankelijke controle: de tekening en de tabel komen los van elkaar van de fabrikant. Uitkomst:

- ArcelorMittal: A, I, W_el en W_pl binnen 0,4 %, behalve A van GU 7S (+2,0 %; I, W_el en W_pl
  binnen 0,3 %). AS 500: de catalogus geeft geen A per m wand; de toets gaat via de massa
  (A = massa / 7850 kg/m³), binnen 0,7 %. I en W van de vlakke profielen staan niet in de tabel.
- terra infrastructure: alle vier grootheden binnen 0,1 %.
- Nucor Skyline: NZ binnen 0,3 %, behalve A van NZ 14 (−0,6 %), NZ 21 (+1,3 %) en NZ 42 (−0,4 %);
  PZ tot 1,9 % (A), 2,1 % (I), 3,8 % (W_el van PZ 27) en 0,4 % (W_pl). De PZ-tekeningen geven de
  slotvorm vereenvoudigd.
- Geen enkel profiel met een tekening viel buiten de grenzen.

Narekenbaar voorbeeld: AZ 18-700 (catalogus A = 139,2 cm²/m, I = 37 800 cm⁴/m, W_el = 1 800 cm³/m,
W_pl = 2 116 cm³/m) geeft uit de tekening 139,4 cm²/m, 37 805 cm⁴/m, 1 800 cm³/m en 2 116 cm³/m; de
zwaartelijn en de plastische neutrale lijn liggen op de as van de wand.

In de tekeningen: de platen zijn de getekende planken, per getekende strook herhaald; de sloten
zitten in de omtrek en worden niet apart getekend. Het detail, de uitdraai en de 3D-weergave
melden "contour uit fabrieks-DWG" met de fabrikant. De hartlijn (voor de doorsnede) blijft de
schematische, gespiegeld naar de kant van de tekening.

### 9.2 Schematische vorm (profielen zonder tekening)

Wat maatvast is: de plankbreedte b, de wandhoogte h, de flensdikte t en de lijfdikte s uit de
profieltabel, en de plaats van het slot per soort (Z: aan de flens op de buitenvezel; U: op de
neutrale lijn van de wand). De platen zijn getekend met hun dikte en met verstek in de knikken.

Wat de openbare profieltabellen niet geven: de breedte van de flens, de hoek van het lijf, de
afrondingen en de vorm van het slot. Nagelopen is de tabel met technische gegevens van de
warmgewalste U-profielen van één van de fabrikanten in de bibliotheek (tien pagina's, volledig
gelezen): kolommen W, gewicht, I, t, s, h, b en de doorsnedeklasse, en per profiel A, omtrek, S,
I en de traagheidsstraal per m wand en per plank. De algemene catalogus van de fabrikant van de
Z- en de overige U-profielen was te groot om binnen te halen en is niet gelezen; de bibliotheek
zelf noemt uit die catalogus ook alleen b, h, t en s. De velden `flangeWidthMm`, `webAngleDeg`
en `cornerRadiusMm` bestaan in de bibliotheek, maar zijn voor elk profiel leeg.

In plaats van een geschatte flens rekent de contour de flensbreedte terug uit de tabel: de
breedte waarbij vlakke platen met de diktes t en s, plus het slot als puntmassa op zijn plaats,
precies de A en de I van de tabel geven (bij U volgt de flens uit I en het slot uit A; bij Z
beide samen). Dat is een afgeleide maat en geen fabrieksmaat; de tekening heet dan
"schematisch" en zegt dat erbij. De lijfhoek volgt uit de flensbreedte. Het slot is een blokje
met de afgeleide doorsnede. Hoedprofielen, vlakke profielen en profielen zonder volledige
tabelwaarden houden een vaste verhouding (flens 40 % van de plankbreedte).

Controle (`sheetPileContour.test.ts`): voor alle Z- en U-profielen met volledige tabelwaarden
liggen de A en de I die uit de schematische omtrek volgen (veelhoeken, formules van Green) binnen
2 % van de bibliotheek. Omdat de flens uit dezelfde A en I is afgeleid, toetst dit de
contourfunctie en het terugrekenen, niet de fabrieksmaten; een tikfout in b, h, t of s vangt de
test alleen als het platenmodel er niet meer op past. Dezelfde vorm geeft W_el en W_pl binnen 10 %
van de tabel (`sheetPileDrawings.test.ts`); ook dat is **niet onafhankelijk**, want de vorm is uit
A en I van dezelfde tabel afgeleid. Koudgevormde profielen zitten niet in de bibliotheek.

Beschoeiing: houten planken met messing en groef (een derde van de dikte, schematisch), een
eigen doorsnede als rechte plank; palen rond of vierkant op hun hart-op-hartafstand met de
schotten aan de hoge zijde; de gording op het niveau van het anker.

## 10. Profieltoets met profielen uit de fabriekstekening

Openbare berekeningen uit `docs/damwand/referentieberekeningen.md` (de nummers zijn die van dat
bestand) met een profiel dat nu een exacte contour heeft. De toets is die van de module
(`steelChecks` in `compute.ts`, NEN-EN 1993-5: buiging art. 5.2.2, dwarskracht art. 5.2.2,
buiging met normaalkracht art. 5.2.3), met γM0 = 1,0 en βB = 1,0. W_el en W_pl zijn daarnaast uit de
contour berekend, als controle op de tabelwaarde die de toets gebruikt. Tests:
`reference-cases.test.ts` (nr. 3) en `profile-check-cases.test.ts` (nr. 1, 26 en 25).

| Nr. | Profiel | Uit de contour | Belasting | Module | Bron |
|---|---|---|---|---|---|
| 3 (6.2) | GU 8N, S240GP, klasse 2 | W_el 770, W_pl 937 cm³/m (tabel 770 en 935) | M 87,7 kNm/m en V 48,1 kN/m uit de module (bron 89,75 en 48,93) | M_c;Rd = 935 · 240 = 224,4 kNm/m, u.c. 0,39; V_pl;Rd = 499 kN/m, u.c. 0,10; N = 0 | toelaatbaar 122,46 kNm/m na afroesting, u.c. 0,73 |
| 1 | AZ 18-700, S240GP, klasse 2 | W_el 1 800, W_pl 2 116 cm³/m | M 410 kNm/m, V 122 kN/m (bron) | M_c;Rd = 2 116 · 240 = 507,8 kNm/m, u.c. 0,81; V_pl;Rd = 732 kN/m, u.c. 0,17 | M_r;d = 432 kNm/m, u.c. 0,95 |
| 26 (6.1) | AZ 13-770, S355GP, klasse 3 (keuze; de bron geeft geen profiel) | W_el 1 300 cm³/m | M 359,24 kNm/m en anker 172 kN/m onder 10° (bron); V 141,1 kN/m uit Blum | benodigd W_el = 1 012 cm³/m; M_c;Rd = 461,5 kNm/m, u.c. 0,78; N_Ed = 30,3 kN/m, M_N;Rd = 458,4 kNm/m, u.c. 0,78; V_pl;Rd = 803 kN/m, u.c. 0,18 | alleen M_max |
| 25 | PZ 22, S355GP (bron: 50 ksi), geen klasse in de bibliotheek | W_el 985 cm³/m (tabel 973) | M 34 149 ft-lb/ft = 151,9 kNm/m (bron) | M_c;Rd = 973 · 355 = 345,4 kNm/m, u.c. 0,44 | benodigd S = 16,39 in³/ft = 881 cm³/m bij 0,5·f_y; in die vorm 881 / 985 = 0,89 |

Wat de verschillen verklaart:

- **Nr. 3:** de bron rekent met afroesting (1,2 mm per zijde in 100 jaar): 122,46 kNm/m is 0,55
  van het plastische moment zonder afroesting. Zonder afroesting ligt de unity check van de module
  (0,39) daarom lager dan die van de bron (0,73); met afroesting komt de module op 0,70 (hoofdstuk
  11.3). Moment en dwarskracht uit de
  module liggen binnen 2,5 % van de bron (hoofdstuk 6.2).
- **Nr. 1:** de bron toetst elastisch: 432 kNm/m is precies W_el · f_y (1 800 · 240). De module
  rekent bij klasse 2 plastisch en komt hoger uit. Waarom de bron elastisch rekent, staat niet in
  het uittreksel.
- **Nr. 26:** de bron geeft alleen het moment en de ankerkracht; het profiel is een keuze om de
  toets met normaalkracht te laten zien. De normaalkracht is de verticale component van het
  anker, 172 · tan 10° = 30,3 kN/m.
- **Nr. 25:** de bron werkt met een toelaatbare spanning van 0,5 · f_y, de module met de
  rekenwaarde f_y / γM0; de unity checks zijn daarom niet gelijk. De vergelijking van het
  benodigde met het aanwezige weerstandsmoment (881 tegen 985 cm³/m) is in de vorm van de bron.

Niet opgenomen: nr. 14 (AZ 24-700 en AZ 13-770 in S240GP). De bron geeft M_Rd = 426 en 191 kNm/m;
uit de tabel volgt 2 430 · 240 = 583 en 1 300 · 240 = 312 kNm/m elastisch. Het verschil komt
vermoedelijk uit afroesting en een reductie in de bron, maar dat staat niet in het uittreksel en is
niet nagegaan.

## 11. Verificatie afroesting

Rekenkern: `src/calc/shared/corrosion.ts` (gedeeld met de horizontaal belaste paal). Invoerblok
"Afroesting" (`panels.tsx`), verwerking in `compute.ts` (`corrosionZones`, `steelChecks` met een
zone). Tests: `src/calc/shared/corrosion.test.ts`, `corrosion.test.ts` in deze map; de tabel hieronder
staat ook in de app, in het uitklapblok "Verificatie" onder Afroesting, en wordt daar live met de
huidige code doorgerekend (`shared/corrosion-verification.ts`, `shared/CorrosionVerification.tsx`).

### 11.1 Wat de module doet

- **Dikteverlies per zijde** (hoge en lage zijde), over de hele wand of in twee zones boven en onder
  een niveau (bijvoorbeeld de waterlijn). Per zijde: geen, een tabelwaarde of een eigen waarde.
- **Tabelwaarden**: NEN-EN 1993-5 tabel 4-1 (grond) en 4-2 (water), de aanbevolen waarden, per
  ontwerplevensduur 5, 25, 50, 75 en 100 jaar:

  | Tabel | Milieu | 5 | 25 | 50 | 75 | 100 |
  |---|---|---|---|---|---|---|
  | 4-1 | onverstoorde natuurlijke grond (zand, silt, klei) | 0,00 | 0,30 | 0,60 | 0,90 | 1,20 |
  | 4-1 | verontreinigde natuurlijke grond en industrieterrein | 0,15 | 0,75 | 1,50 | 2,25 | 3,00 |
  | 4-1 | agressieve natuurlijke grond (moeras, veen) | 0,20 | 1,00 | 1,75 | 2,50 | 3,25 |
  | 4-1 | aanvulling, niet verdicht, niet agressief | 0,18 | 0,70 | 1,20 | 1,70 | 2,20 |
  | 4-1 | aanvulling, niet verdicht, agressief (as, slakken) | 0,50 | 2,00 | 3,25 | 4,50 | 5,75 |
  | 4-1 | aanvulling, verdicht (niet agressief en agressief) | de helft van niet verdicht (opmerking bij de tabel) | | | | |
  | 4-2 | zoet water (rivier, kanaal), zone van sterke aantasting (waterlijn) | 0,15 | 0,55 | 0,90 | 1,15 | 1,40 |
  | 4-2 | zeer verontreinigd zoet water, zone van sterke aantasting (waterlijn) | 0,30 | 1,30 | 2,30 | 3,30 | 4,30 |
  | 4-2 | zeewater, gematigd klimaat, zone van sterke aantasting (laagwater en spatzone) | 0,55 | 1,90 | 3,75 | 5,60 | 7,50 |
  | 4-2 | zeewater, gematigd klimaat, blijvend onder water of getijdezone | 0,25 | 0,90 | 1,75 | 2,60 | 3,50 |

  Waarden in mm per blootgestelde zijde. **Uit kennis van de norm overgenomen en niet tegen de
  normtekst of de Nederlandse bijlage gelegd.** Alle cellen zijn ingevuld omdat de waarden in de
  openbare literatuur breed zo worden aangehaald; de rij "onverstoorde grond, 100 jaar = 1,20 mm" is
  bovendien precies de waarde die referentie nr. 3 gebruikt. Niet opgenomen: zoet water blijvend onder
  water (de tabel geeft daarvoor geen aparte rij) en atmosferische afroesting; gebruik daarvoor een
  eigen waarde.
- **Doorsnede met een exacte contour** (122 profielen): elke rand van de omtrek schuift loodrecht naar
  binnen over het verlies van de zijde waar hij naar toe kijkt (hoge zijde = +y van de contour, lage
  zijde = −y; een rand precies loodrecht op de as blijft staan). Hoekpunten zijn de snijpunten van de
  verschoven randen. A, I, W_el en W_pl volgen opnieuw uit de verkleinde omtrek; de verhouding
  verkleind / onverkleind wordt toegepast op de tabelwaarden, zodat de toets op de profieltabel
  aansluit. De doorsnede is symmetrisch, dus welke zijde "hoog" is maakt voor A, I en W niet uit.
- **Zonder exacte contour** (benadering, in de uitdraai en een melding zo genoemd): I, W_el en W_pl
  maal (t_f − Δt) / t_f, A maal (t_m − Δt) / t_m met t_m = (t_f + t_w) / 2, Δt het verlies van beide
  zijden samen.
- **Plaatdikten, hoogte**: t_f en t_w worden Δt kleiner, h ook (beide buitenvezels). Dwarskracht en
  normaalkracht rekenen met de verkleinde waarden.
- **Doorsnedeklasse**: bepaald met de verkleinde flensdikte, b / (t_f · ε) volgens NEN-EN 1993-5
  tabel 5-1. De bibliotheek geeft b niet en de afgeleide of gemeten flensbreedte past niet goed bij de
  klassen van de catalogus (bij de U-profielen met een contour lag de gemeten b/t steeds 5 tot 15 %
  boven wat de catalogus toelaat; de definitie van b of de grenzen zijn dus niet met zekerheid na te
  bootsen). Daarom wordt het bereik van b / t_f afgeleid uit de klassen die de catalogus bij de
  verschillende staalsoorten geeft (met de grenzen 37/49 voor U en 45/66 voor Z, uit kennis van de
  norm); na afroesting wordt dat bereik t_f / (t_f − Δt) maal zo groot. Omdat alleen de verhouding van
  de grenzen telt, maakt een fout in de absolute grenzen weinig uit. Valt het bereik in twee klassen,
  dan rekent de module met de ongunstigste en meldt zij dat; de gebruiker kan een klasse kiezen
  ("Klasse na afroesting"). De klasse wordt nooit gunstiger dan die van de catalogus. Dat de klasse
  met de verkleinde dikte wordt bepaald, volgt de gangbare praktijk; het artikel is niet tegen de
  normtekst gelegd.
- **Waar het telt**: alleen in de toetsen van de doorsnede (buiging, buiging met normaalkracht,
  dwarskracht). Niet in de gronddruk. De krachtsverdeling rekent standaard met de EI zonder
  afroesting; met het vinkje "EI na afroesting" met de kleinste EI van de zones.
- **Zones**: elke zone wordt getoetst met het grootste moment en de grootste dwarskracht binnen die
  zone (de normaalkracht is over de wand gelijk genomen).
- **Dikteverlies 0** geeft exact de uitkomst zonder afroesting (test).

### 11.2 Verificatietabel

| Geval | Invoer | Grootheid | Verwacht | Module | Verschil | Oordeel | Bron of formule |
|---|---|---|---|---|---|---|---|
| D1 | plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm | A [cm²/m] | 70 | 70 | 0,00 % | in orde | 1 000 · 7 mm |
| D1 | plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm | I [cm⁴/m] | 2,85833 | 2,85833 | 0,00 % | in orde | b · t³ / 12 |
| D1 | plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm | W_el [cm³/m] | 8,16667 | 8,16667 | 0,00 % | in orde | b · t² / 6 |
| D1 | plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm | W_pl [cm³/m] | 12,25 | 12,25 | 0,00 % | in orde | b · t² / 4 |
| D1 | plaat 1000 × 10 mm, Δ 1,0 / 2,0 mm | zwaartelijn [mm] | 0,5 | 0,5 | 0,00 % | in orde | (4 − 3) / 2 |
| D2 | AZ 18-700, Δ 1,2 / 1,2 mm | A uit de contour [cm²/m] | 104,163 | 104,132 | -0,03 % | in orde | A − Δ₁ L₊ − Δ₂ L₋ |
| D2 | AZ 18-700, Δ 1,2 / 1,2 mm | t_f [mm] | 6,6 | 6,6 | 0,00 % | in orde | t_f − Δ₁ − Δ₂ |
| D2 | AZ 18-700, Δ 1,2 / 1,2 mm | W_el [cm³/m] | 1320 | 1363,17 | 3,27 % | in orde | W · (t_f − Δ) / t_f, dunwandig |
| D3 | PU 18, Δ 2 / 0 mm | A uit de contour [cm²/m] | 131,321 | 131,157 | -0,12 % | in orde | A − Δ₁ L₊ − Δ₂ L₋ |
| D3 | PU 18, Δ 2 / 0 mm | t_f [mm] | 9,2 | 9,2 | 0,00 % | in orde | t_f − Δ₁ − Δ₂ |
| D3 | PU 18, Δ 2 / 0 mm | W_el [cm³/m] | 1478,57 | 1480,91 | 0,16 % | in orde | W · (t_f − Δ) / t_f, dunwandig |
| D4 | GU 8N S240GP, Δ 1,2 / 1,2 mm, klasse 3 | M_c;Rd [kNm/m] | 122,46 | 125,51 | 2,49 % | in orde | referentie nr. 3 (2022) |
| D4 | GU 8N S240GP, Δ 1,2 / 1,2 mm | klasse na afroesting, laagst | 3 | 3 | 0,00 % | in orde | b/t_f uit de catalogus · 7,5 / 5,1 |
| D4 | GU 8N S240GP, Δ 1,2 / 1,2 mm | klasse na afroesting, automatisch | 4 | 4 | 0,00 % | in orde | ongunstigste van 3 en 4 |
| D5 | GU 8N, Δ 0 | W_pl [cm³/m] | 935 | 935 | 0,00 % | in orde | tabel |

D1 is met de hand: de plaat loopt na afroesting van y = −3 tot +4 mm. D2 en D3 toetsen het
naar binnen schuiven van de exacte contour tegen een handformule (A uit de lengte van de randen per
zijde maal het verlies) en W tegen de dunwandige vuistregel W · (t_f − Δt) / t_f; die laatste
verkleint alleen de flens en is daarom een grovere controle (6 %).

### 11.3 Referentie nr. 3 opnieuw gerekend

GU 8N in S240GP, 1,2 mm per zijde in 100 jaar (in de module: tabel 4-1, onverstoorde grond, 100
jaar), invoer verder als hoofdstuk 6.2 met de rekenwaarden van de bron (`corrosion.test.ts`).

| | Bron | Module |
|---|---|---|
| W_el na afroesting | niet gegeven | 770 → 523 cm³/m (uit de contour; benadering 524) |
| W_pl na afroesting | niet gegeven | 935 → 628 cm³/m |
| doorsnedeklasse | elastisch getoetst (af te leiden uit 122,46 ≈ W_el · f_y) | catalogus klasse 2; na afroesting 3 of 4 (b/t_f · 7,5 / 5,1) |
| M_c;Rd | 122,46 kNm/m | 125,5 kNm/m met klasse 3 (+2,5 %); zonder keuze klasse 4: geen buigtoets, wel een melding |
| u.c. buiging | 89,75 / 122,46 = 0,73 | 87,7 / 125,5 = 0,70 |

Het verschil van 2,5 % komt uit het weerstandsmoment na afroesting: de bron gaat uit van
122,46 / 240 = 510 cm³/m, de module rekent uit de exacte contour 523 cm³/m. 510 / 770 = 0,663;
de contour geeft 0,679 en de vuistregel (7,5 − 2,4) / 7,5 = 0,680. Vermoedelijk rekent de bron met
een vaste of eigen reductie op W_el (of met een iets ander uitgangsprofiel); het uittreksel geeft de
tussenstap niet, dus dat is niet nagegaan. Dat de bron elastisch rekent past bij klasse 3 na
afroesting; de module kan uit de catalogus niet vaststellen of het 3 of 4 is en kiest zonder keuze
van de gebruiker voor 4.

## 12. Bouwfasen en meer steunpunten

Rekenkern: `runPhases` en `runSpringModel` in `compute.ts`, de veer met een beginstand in
`spring-model.ts`. Tests: `stages.test.ts`, `spring-model.test.ts`.

### 12.1 Wat de module doet

- **Fase**: wat er ten opzichte van de vorige fase verandert: ontgraving of waterbodem aan de lage zijde,
  maaiveld aan de hoge zijde (aanvullen), waterstanden, gelijkmatige bovenbelasting, maaiveldprofiel per
  zijde, steunpunten aanbrengen of verwijderen, belastingen op afstand aan of uit. Een leeg veld houdt de
  waarde van de vorige fase. Zonder fasen is er één fase met alle steunpunten (de berekening van vroeger).
- **Verder vanaf de vervormde stand**: elke fase gebruikt dezelfde elementindeling. Een veer die er al
  was, begint op de druk p aan het eind van de vorige fase bij de verplaatsing van toen:
  p0;nieuw = p_vorig + K0 · (σ′v;nieuw − σ′v;vorig), binnen de nieuwe actieve en passieve grens. De
  drietakkige lijn wordt door dat punt gelegd (secanswaarden vanaf het actieve punt, als in hoofdstuk 3).
  Plastische verplaatsing blijft dus staan. Nieuwe grond (aanvullen) begint neutraal op de vervormde
  wand; afgegraven grond valt weg. Een aparte ontlasttak is er niet.
- **Steunpunt**: werkt vanaf de verplaatsing y_a waarbij het wordt aangebracht: F = k · (y − y_a) +
  voorspanning. Een stempel en een ankerstaaf hebben een voorspankracht als invoer (een groutanker al).
  Een verwijderd steunpunt draagt niets meer.
- **Uitkomst**: per fase (en per stap, hoofdstuk 13) moment, dwarskracht, verplaatsing, kracht per
  steunpunt en aangesproken weerstand. Voor de toetsen telt de omhullende: per grootheid de grootste
  waarde, per steunpunt de grootste kracht. Blum wordt gerekend in de fase met de diepste ontgraving,
  en alleen met hooguit één steunpunt.
- **Toeslag op de kerende hoogte** per fase, vanaf het onderste steunpunt dat in die fase werkt.

### 12.2 Controle

| Geval | Verwacht | Module |
|---|---|---|
| Eén fase met één steunpunt (zes varianten: verankerd, groutanker met voorspanning, onverankerd, planken, palen, starre steun) | dezelfde uitkomst als vóór de fasering | gelijk op 9 cijfers; bij de starre steun was de grootste dwarskracht een piek binnen de band (12.3) |
| Veer met beginstand, met de hand: fase 1 q = 20 kPa, links actief op 4 kPa, y = 14 mm; fase 2 zonder belasting | 4 − 1000·d = 24 + 1000·d: y = 4 mm, beide zijden 14 kPa | gelijk |
| Lineair-elastisch (alleen de bovenste veren op p0 = pa): in twee stappen ontgraven tegen in één keer | gelijk (superpositie) | binnen 10⁻⁶ |
| Fase zonder verandering | niets verandert | eerste herhaling verschuift tot 2,5 % (12.3), daarna < 0,1 % |
| Stempel aangebracht zonder verdere verandering | kracht ≈ 0 | < 0,5 kN/m |
| Evenwicht in elke fase (ΣH grond, water, steunpunten) | 0 | binnen 0,5 % van de passieve weerstand |

### 12.3 Wat bij het bouwen naar boven kwam

- **Reststijfheid**: een veer voorbij zijn grens houdt 10⁻⁴·kh (hoofdstuk 3). In één berekening levert
  hij daardoor iets meer dan zijn grens. Begint de volgende fase de grens op de stand van nu, dan valt
  dat weg: bij een onverankerde wand vlak bij bezwijken 2,5 % op de verplaatsing, bij een verankerde wand
  minder dan 0,5 %.
- **Band van een stijve steun op een slappe wand**: de steun is over een band uitgesmeerd; die houdt de
  wand ook tegen draaien (k·b²/12). Bij een lichte kunststof wand met een vrijwel star anker (nr. 13) gaf
  dat een te klein moment en een dwarskracht van 137 kN/m bij een ankerkracht van 25 kN/m. De band wordt
  nu smaller tot die draaistijfheid hooguit 2 % van EI per meter is (b = √(0,24·EI/k), tussen 2 mm en
  4 cm), en binnen de band loopt de dwarskracht lineair van boven naar onder. Voor de bestaande voorbeelden
  verandert alleen de grootste dwarskracht bij de starre steun (−101,6 werd 64,9 kN/m; −101,6 was groter
  dan de steunkracht zelf, 96,7 kN/m, en dus geen echte waarde).
- **Knik**: een veer die precies op een knik staat (zoals aan het begin van een fase) wisselde soms
  eindeloos tussen twee takken; een veer blijft nu op zijn tak zolang hij binnen 0,1 µm ervan ligt.

## 13. Stappenplan CUR 166

De tekst van CUR 166 lag niet op tafel. De stappen volgen wat openbare uitvoer van het stappenplan per
stap afdrukt (nagelezen in de uitvoer van de gevallen 2, 3, 4, 5, 6, 13, 16 en 20 van de verzameling, en
in een tiende rapport):

| Stap | Grond | Beddingsconstante | Water lage zijde | Water hoge zijde | Kerende hoogte | Factor op M, V, F |
|---|---|---|---|---|---|---|
| 6.1 | rekenwaarden | invoer / 1,3 | omhoog | +0,05 m | toeslag | 1 |
| 6.2 | rekenwaarden | invoer × 2,25 | omhoog | +0,05 m | toeslag | 1 |
| 6.3 | rekenwaarden | invoer / 1,3 | omlaag | +0,05 m | toeslag | 1 |
| 6.4 | rekenwaarden | invoer × 2,25 | omlaag | +0,05 m | toeslag | 1 |
| 6.5 | representatief | invoer | – | – | – | 1,2 (RC3: 1,35); de verplaatsing zonder factor |

- De rekenwaarden gelden in alle fasen (zo drukt de uitvoer het af bij acht van de negen gevallen).
- Waterstandtoeslag aan de lage zijde: 0,20 m (RC1) of 0,25 m (RC2, RC3); de knoppen RC1/RC2/RC3 in het
  blok Stappenplan zetten ook de factor op de variabele belasting (1,0 / 1,1 / 1,25).
- Stap 6.1 en 6.2 vervallen als aan de lage zijde in elke fase vrij water staat (de uitvoer: dan is een
  lage waterstand het meest ongunstig). Dat is een vinkje.
- Alles staat in een tabel in de invoer en is aan te passen. **Niet tegen de tekst van CUR 166 gelegd.**
  Eén RC3-uitvoer gebruikt 1,2 in plaats van 1,35 op stap 6.5 (nr. 4).

Controle (`reference-cases.test.ts`): bij nr. 3 vervallen 6.1 en 6.2 zoals in de bron; 6.3 is precies de
losse berekening met de rekenwaarden van de bron; 6.4 en 6.5 binnen 5 % van de bron; de omhullende is het
grootste van 6.3, 6.4 en 1,35 × 6.5.

## 14. Maaiveld en belastingen op afstand

`surface-loads.ts`. Een strooklast q van x1 tot x2 uit de wand of een lijnlast P op x geeft langs de wand
extra verticale spanning volgens Boussinesq: strook σz = q/π · (θ2 − θ1 + sin θ2 cos θ2 − sin θ1 cos θ1)
met θ = atan(x/z), lijnlast σz = 2Pz³/(π(x² + z²)²) (Poulos en Davis, 1974). De wand is een gladde,
starre rand: de last wordt gespiegeld, dus maal 2. Een strook vanaf de wand tot oneindig geeft dan precies
q op elke diepte, dezelfde uitkomst als de gelijkmatige bovenbelasting (test). De extra spanning telt in
σ′v en daarmee in de actieve, neutrale en passieve druk; σ′v wordt niet negatief. De factor op de
bovenbelasting geldt ook hiervoor.

Een maaiveld dat van de wand af niet vlak is (talud, aflopende waterbodem) is per stukje van 0,25 m een
strooklast γ · Δh, met γ van de bovenste laag (onder water γsat − γw); voorbij het laatste punt blijft de
hoogte gelijk. Aan de lage zijde zakt het profiel met de toeslag op de kerende hoogte evenwijdig mee, zoals
de uitvoer het doet. Dit is een schematisering: de openbare berekeningen rekenen met een glijvlakmethode
(Culmann) over het hele profiel. Voor een talud dat onbeperkt doorloopt is het niet bedoeld.

Controle (`surface-loads.test.ts`): strook en lijnlast met de hand (op 6 cijfers), de strook tot oneindig
gelijk aan de bovenbelasting, een maaiveld 0,01 m van de wand 1 m hoger binnen 1 % van 18 kPa
bovenbelasting, een aflopende bodem verkleint de passieve weerstand.

## 15. Vervorming, verticaal evenwicht, ankerstaaf en gording

Alle vier staan standaard uit; bestaande berekeningen houden dezelfde toetsen. Tests: `extra-checks.test.ts`.

- **Vervorming**: grootste verplaatsing met representatieve waarden (stap 6.5) tegen min(H / r; u_max),
  met H de grootste kerende hoogte over de fasen; r en u_max zijn invoer (100 en 50 mm).
- **Verticaal evenwicht**: F_v = Σ σ′h · tan δ aan de hoge zijde (representatief, de fase met de grootste
  waarde) + verticale component van de ankers + normaalkracht, tegen R_b;d = q_b;max · A / (ξ · γ_b), met
  A de staaldoorsnede per m wand. De wrijving aan de lage zijde (omhoog) telt niet mee. Nr. 3: bron R_b;d
  61,75 kN/m (q_b;max 10 MPa, ξ 1,39, γ_b 1,2), module 61,8; bron F 29,49 kN/m, module 30,5 (+3,5 %), met
  het aflopende maaiveld van de bron.
- **Ankerstaaf** (NEN-EN 1993-5 art. 7.2.3, uit kennis van de norm): F_t;Rd = min(k_t · f_ua · A_s / γ_M2;
  f_y · A_g / γ_M0) met k_t = 0,6, γ_M2 = 1,25, tegen de extra factor (1,25) maal de ankerkracht per anker.
- **Gording**: q · a² / c met q de horizontale ankerkracht per m wand, a de h.o.h.-afstand en c = 10
  (doorgaande ligger, benadering) of 8 (één veld), tegen W · f_y / γ_M0.
- Kranz en algehele stabiliteit zitten er **niet** in (hoofdstuk 8).

## 16. Openbare berekeningen met fasering en stappenplan

Tests: `reference-stages.test.ts` (nr. 5, 6, 13, 20) en `reference-cases.test.ts` (nr. 3). De getallen
zijn in de bron-pdf zelf nagelezen (paginanummers bij de koppen). Tolerantie, vooraf vastgelegd en voor
alle gevallen gelijk: moment, dwarskracht en anker- of stempelkracht 15 %, verplaatsing 25 %, aangesproken
weerstand 10 procentpunt. Wat daarbuiten valt, staat hieronder met de verklaring en wordt in de test niet
getoetst. Ankerkrachten axiaal per m wand; "× 1,2" is stap 6.5 maal de factor.

### 16.1 Nr. 6: bestaande kade met groutanker aan een boezem, drie fasen (bron p. 23)

RC2; EI 2,4192·10⁴ × 0,70; anker als veer E·A/L = 2,1·10⁸ · 10⁻⁴ / 12 per m wand onder 45°; 6.1 en
6.2 vervallen (vrij water), zoals in de bron. Benaderingen: het verhoogde maaiveld van fase 2 en 3 als
profiel per fase; de laag "zand −d" met δ = −20° aan de hoge zijde.

| Fase / stap | Bron M | Module M | Bron anker | Module anker | Bron u | Module u |
|---|---|---|---|---|---|---|
| 1 / 6.3 | 21,21 | 21,60 (+2 %) | 22,64 | 22,01 (−3 %) | | |
| 1 / 6.4 | 26,51 | 26,43 (0 %) | 19,99 | 19,44 (−3 %) | | |
| 1 / 6.5 | 15,38 | 15,45 (0 %) | 14,35 (× 1,2) | 14,17 (−1 %) | 10,8 | 10,6 (−2 %) |
| 2 / 6.3 | 23,22 | 23,60 (+2 %) | 25,94 | 24,90 (−4 %) | | |
| 2 / 6.4 | 29,48 | 29,28 (−1 %) | 23,00 | 22,15 (−4 %) | | |
| 2 / 6.5 | 17,89 | 17,71 (−1 %) | 17,03 (× 1,2) | 16,56 (−3 %) | 12,8 | 12,4 (−3 %) |
| 3 / 6.3 | 22,87 | 23,63 (+3 %) | 33,19 | 32,31 (−3 %) | | |
| 3 / 6.4 | 32,74 | 33,13 (+1 %) | 29,87 | 29,11 (−3 %) | | |
| 3 / 6.5 | 20,47 | 20,29 (−1 %) | 20,26 (× 1,2) | 19,58 (−3 %) | 15,0 | 14,5 (−3 %) |

Dwarskracht fase 3: bron 24,45 / 26,80 / 18,09, module 24,60 / 26,85 / 17,98. Aangesproken weerstand fase 3:
38,3 / 40,4 % tegen 38,9 / 40,8 %. Alles binnen 4 %.

### 16.2 Nr. 5: bouwput met stempelraam en later de keldervloer als stempel, vier fasen (bron p. 36)

RC1, alle stappen; EI 73 269 kNm²/m (eigen doorsnede); raam E·A/L = 2,1·10⁸ · 10⁻³ / 38, vloer
2·10⁷ · 0,30 / 38 per m wand; strook 20 kPa van 4,90 tot 11,00 m (fase 1) en van 0,20 tot 10,20 m (fase
2–4); wateroverspanning voor de stijghoogte van de diepe zandlaag. Benaderingen: de wateroverspanning
aan de lage zijde (−2 kPa, die van fase 2–4) ook in fase 1; het zandbed van fase 3 met de grond die er al
lag (in de bron drainagezand); de kleine sleuf in de bodem niet; δ = 16,6° voor de lagen met φ′ = 32°
aan beide zijden.

| Fase | Stap | Bron M | Module M | Bron stempel | Module stempel |
|---|---|---|---|---|---|
| 1 | 6.1 / 6.2 / 6.3 / 6.4 | 24,12 / 15,73 / 26,16 / 16,81 | 21,00 / 13,57 / 23,15 / 14,77 (−11 tot −14 %) | – | – |
| 1 | 6.5 | 20,50 | 17,31 (**−16 %**) | – | – |
| 2 | 6.1 / 6.2 / 6.3 / 6.4 | 288,63 / 269,53 / 300,63 / 285,10 | 273,35 / 241,69 / 299,71 / 273,12 (−5 / −10 / 0 / −4 %) | 124,85 / 120,24 / 127,99 / 124,28 | 117,38 / 109,46 / 124,36 / 117,82 (−6 / −9 / −3 / −5 %) |
| 2 | 6.5 | 189,50 | 175,30 (−7 %) | 111,31 (× 1,2) | 103,06 (−7 %) |
| 3 | 6.3 | 302,83 | 297,05 (−2 %) | 128,76 | 125,38 (−3 %) |
| 3 | 6.5 | 190,45 | 173,66 (−9 %) | | |
| 4 | 6.1 / 6.2 / 6.3 / 6.4 | 169,76 / 188,36 / 183,53 / 206,10 | 158,66 / 161,30 / 175,70 / 188,27 (−7 / −14 / −4 / −9 %) | 225,59 / 246,74 / 232,76 / 255,07 | 212,16 / 224,84 / 223,94 / 241,71 (−6 / −9 / −4 / −5 %) |
| 4 | 6.5 | 113,83 | 98,06 (−14 %) | 210,37 (× 1,2) | 199,24 (−5 %) |

Omhullende: moment 302,83 tegen 299,71 kNm/m (−1 %), raam 128,76 tegen 125,38 kN/m (−3 %), vloer 255,07
tegen 241,71 kN/m (−5 %); grootste verplaatsing 37,5 tegen 34,4 mm (−8 %). Fase 1, stap 6.5 (−16 %) valt
buiten de tolerantie: een klein moment (20 kNm/m) in een onverankerde fase, waar de toeslag op de kerende
hoogte (de bron rekent die bij een onverankerde wand vanaf de kop van de wand, de module vanaf het
maaiveld) en de wateroverspanning aan de lage zijde in fase 1 (in de bron −25 kPa, hier −2 kPa) het meest
tellen. De module ligt in dit geval over de hele linie iets onder de bron; zie 16.3.

### 16.3 Nr. 13 en nr. 20: lichte (kunststof) damwanden met één anker

Nr. 13 (bron p. 4 en 29; RC1; EI 205,3 kNm²/m; anker E·A/L zoals afgedrukt; aflopende bodem; strook
10 kPa van 0 tot 8 m). Nr. 20, profiel B (bron p. 15; RC1; EI 327 kNm²/m; anker M20 als veer; aflopende
bodem; strook 10 kPa van 0 tot 4,20 m).

| | Bron | Module | Verschil |
|---|---|---|---|
| 13: anker 6.3 / 6.4 / 6.5 × 1,2 | 26,35 / 28,64 / 20,40 | 25,27 / 27,51 / 19,04 | −4 / −4 / −7 % |
| 13: dwarskracht 6.3 / 6.4 / 6.5 | 15,6 / 15,5 / 8,8 | 14,7 / 14,4 / 8,4 | −6 / −7 / −5 % |
| 13: moment 6.5, verplaatsing 6.5 | 3,8; 14,3 mm | 3,5; 12,1 mm | −8 %; −15 % |
| 13: moment 6.3 / 6.4 | 10,8 / 10,3 | 9,2 / 8,4 | **−15 / −19 %** |
| 13: aangesproken weerstand 6.3 / 6.5 | 82,8 / 48,7 % | 71,2 / 40,2 % | **−12** / −9 procentpunt |
| 20: anker 6.3 / 6.4 / 6.5 × 1,2 | 42,09 / 45,06 / 29,50 | 38,27 / 40,43 / 27,05 | −9 / −10 / −8 % |
| 20: dwarskracht 6.3 / 6.4 / 6.5 | 23,6 / 23,7 / 13,3 | 21,3 / 20,9 / 12,5 | −10 / −12 / −6 % |
| 20: moment 6.5, verplaatsing 6.5 | 6,4; 30,1 mm | 5,8; 23,9 mm | −9 %; −21 % |
| 20: moment 6.3 / 6.4 | 18,9 / 18,4 | 15,3 / 13,9 | **−19 / −25 %** |
| 20: aangesproken weerstand 6.3 | 100,0 % | 83,9 % | **−16 procentpunt** |

Verklaring. Het profiel van de bodem en de strooklast zijn het niet: zonder profiel, of met de strook als
gelijkmatige last, verandert het moment hier minder dan 6 %. De bron drukt per segment "fictieve"
gronddrukcoëfficiënten af die uit een glijvlakberekening over het hele gelaagde profiel komen (Culmann):
bij nr. 20 bijvoorbeeld Kp 3,21 in de klei direct onder het zand en 2,27 dieper, en een K0 van 0,89 aan het
maaiveld; de module rekent per laag met Coulomb (Kp van de klei ≈ 2,6) en K0 = 1 − sin φ′d. Bij deze lichte
wanden, die in 6.3 en 6.4 tot 80 à 100 % van de passieve weerstand aanspreken, werkt dat verschil in de
gronddruk sterk door in het moment; anker- en dwarskracht (die het evenwicht volgen) blijven binnen 12 %.
De module ligt hier voor het moment met rekenwaarden aan de **onveilige kant**. Een glijvlakberekening
over het hele profiel staat in hoofdstuk 8.

### 16.4 Samenvatting en niet nagerekend

| Nr. | Wat | Uitkomst |
|---|---|---|
| 1 | profieltoets (hoofdstuk 10) | ongewijzigd |
| 3 | stappenplan, maaiveld achter de wand, verticaal evenwicht | met het maaiveld van de bron: M 6.3 −4 %, 6.4 −5 %, 6.5 −1 %; u −5 %; R_b;d 0 %, F_v +3,5 % |
| 5 | vier fasen, twee stempels | omhullende M −1 %, stempels −3 en −5 %; per fase en stap −16 tot 0 % |
| 6 | drie fasen, groutanker | alles binnen 4 % |
| 13 | lichte wand met anker | anker, dwarskracht en stap 6.5 binnen de tolerantie; M met rekenwaarden −15 tot −19 % |
| 20 | lichte wand met anker | idem; M met rekenwaarden −19 tot −25 % |
| 25, 26 | Blum, profieltoets (hoofdstuk 6 en 10) | ongewijzigd |
| 2 | onverankerde stuwwand | niet nagerekend: horizontale kracht en moment op de kop van de wand zitten niet in de module; de beddingsconstanten staan niet in de afgedrukte uitvoer |
| 4 | vijf waterstandsfasen | niet nagerekend: lagen met negatieve δ per fase en zijde, en belasting en factorset tegenstrijdig in de bron |
| 14 | oeverbeschoeiing | niet nagerekend: het adres in de verzameling geeft een ander stuk (de uitvoer van nr. 13); de bron is niet gevonden |
| 16 | kade met ankers, twee fasen | niet nagerekend: de invoer van fase 1 is niet afgedrukt, en de bovenste laag (slib, φ′ = 0, c′ = 0) is in de module geen gedraineerde laag |
| 30 | kanaaloever met kraanlast | niet nagerekend: de bron rekent met rekenwaarden alleen in de getoetste fase, met dertien lagen en een onregelmatig maaiveld per fase |

Correcties op de verzameling (uit de bron-pdf's): nr. 13 grootste moment 10,8 kNm/m (de 15,6 is de
dwarskracht), verplaatsing 14,3 mm, δ = 0; de adressen van nr. 13 en 14 kloppen niet; nr. 16 verplaatsing
14,0 mm; nr. 20 profiel C grootste ankerkracht 16,65 kN/m (6.4).
