# Verificatie rekenkern horizontale paal

Twee testbestanden vergelijken de rekenkern met onafhankelijke referenties:

- `verification.test.ts` (V1–V11): gesloten oplossingen en een eigen,
  onafhankelijke differentieoplossing, steeds via `computeLateral`.
- `reference-solutions.test.ts` (R1–R12): gepubliceerde gesloten oplossingen,
  dimensieloze coëfficiënten en uitgewerkte voorbeelden uit een openbaar
  studieboek, plus de doorsnedetoets en de herstelde fouten.

Tabel met de werkelijke afwijkingen:

    VERIFY_REPORT=1 npx vitest run verification reference-solutions --disable-console-intercept

## Tekenafspraak

z loopt omlaag vanaf de paalkop, y is de horizontale verplaatsing (H positief
naar +y), de rotatie is dy/dz. Het kopmoment M is de kracht die bij die rotatie
hoort. Gevolg: **een positief ingevoerd M werkt een positieve H tegen.** Een
kracht H die op hoogte e boven de kop aangrijpt, geeft M = −H·e. De literatuur
(Hetényi, Matlock & Reese, Broms) telt M = H·e positief; bij het overnemen van
een voorbeeld moet het teken dus om. Het invoerscherm zegt dit nu bij het veld;
test R1 legt het vast. De dwarskracht van de rekenkern is aan de kop −H; het
afschuifteken in de diagrammen toont de kracht op het bovenvlak.

## Gevallen V1–V11 (bestaand)

| Geval | Situatie | Referentie | Grootste afwijking |
|---|---|---|---|
| V1 | lange paal, vrije kop, kopkracht | Hetényi, half-oneindige ligger | 0,001 % |
| V2 | lange paal, vrije kop, kopmoment | Hetényi, half-oneindige ligger | < 0,0001 % |
| V3 | lange paal, ingeklemde kop | Hetényi, half-oneindige ligger | < 0,0001 % |
| V4 | korte starre paal | evenwicht kracht en moment | 0,001 % |
| V5 | korte buigzame paal, H + M | exacte eindige ligger (homogene oplossing) | < 0,0001 % |
| V6 | ingeklemde paalvoet | exacte eindige ligger | < 0,0001 % |
| V7 | bedding k = nh·z | Matlock & Reese (Zmax ≥ 5) en differentieoplossing | 0,001 % (rekenkern), zie opmerking |
| V8 | twee lagen, slap op stijf | differentieoplossing, 960 intervallen | 0,001 % |
| V9 | niet-lineair, hoge mobilisatie (> 90 %) | differentieoplossing met Newton | 0,002 % |
| V10 | niet-lineair, pu toenemend met bovengrens | differentieoplossing met Newton | 0,004 % |
| V11 | niet-lineair, twee lagen, Georgiadis | differentieoplossing; equivalente diepte zelfstandig afgeleid | < 0,0001 % |

De differentieoplossing is een eigen, onafhankelijke methode (knopen met
spookpunten, Newton-iteratie, Richardson-extrapolatie bij gladde bedding).
Zij is zelf eerst gecontroleerd tegen de exacte eindige ligger.

## Gevallen R1–R12 (nieuw)

Per geval: bron, uitkomst van de bron, uitkomst van de module, verklaring van
het verschil. Tenzij anders vermeld: paal □400 (EI = 71 221 kNm²), werkende
breedte 1 m, elementen 0,1 m.

### R1 Hetényi, lange paal: plaats van het grootste moment, dwarskracht, excentrische last

Bron: Hetényi (1946), half-oneindige ligger. k = 20 000 kN/m², L = 16 m, H = 100 kN.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| diepte grootste moment, π/(4β) | 1,5258 m | 1,5258 m | < 0,001 % |
| grootste moment, 0,3224·H/β | 62,63 kNm | 62,63 kNm | 0,001 % |
| grootste dwarskracht (aan de kop) | 100 kN | 100,00 kN | 0 |
| kopverplaatsing bij H op e = 1,5 m, 2Hβ(1+βe)/k | 9,122 mm | 9,122 mm | < 0,001 % |
| grootste moment bij H op e = 1,5 m | 182,59 kNm | 182,59 kNm | < 0,001 % |

De excentrische last is ingevoerd als M = −H·e (zie tekenafspraak).

### R2 Hetényi, eindige paal met vrije einden

Bron: Hetényi (1946), ligger van eindige lengte met last op het einde.
k = 8000 kN/m², L = 4 m (βL = 1,6).

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| kopverplaatsing bij H = 60 kN | 7,9896 mm | 7,9896 mm | < 0,0001 % |
| kopverplaatsing bij M = 30 kNm | 1,7452 mm | 1,7452 mm | < 0,0001 % |

### R3 Starre korte paal, ingeklemde kop, constante bedding

Bron: Broms (1964), y = H/(k·L). k = 1000 kN/m², L = 2 m, H = 40 kN, paal □1500.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| kopverplaatsing | 20,000 mm | 20,001 mm | 0,006 % |
| inklemmoment H·L/2 (tevens grootste moment, aan de kop) | 40,00 kNm | 40,00 kNm | 0,003 % |

Verschil: de paal is zeer stijf maar niet oneindig stijf.

### R4 Starre paal, bedding lineair toenemend met de diepte

Bron: Barber (1953). nh = 2000 kN/m³, L = 3 m, H = 50 kN, paal □2000.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| kopverplaatsing vrije kop, 18H/(nh·L²) | 50,00 mm | 49,96 mm | 0,08 % |
| kophoek vrije kop, 24H/(nh·L³) | 22,22 mrad | 22,21 mrad | 0,07 % |
| kopverplaatsing ingeklemde kop, 2H/(nh·L²) | 5,556 mm | 5,559 mm | 0,06 % |
| inklemmoment, 2H·L/3 | 100,0 kNm | 99,97 kNm | 0,03 % |

Verschil: k = nh·z is in 40 lagen opgeknipt; de paal is niet oneindig stijf.

### R5 Matlock & Reese: korte palen, ingeklemde kop, kophoek

Bron: Matlock & Reese (1960/1961), tabelwaarden aan maaiveld voor k = nh·z,
T = (EI/nh)^0,2. nh = 6000 kN/m³, T = 1,640 m.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| Ay / By bij Zmax = 2 | 4,738 / 3,418 | 4,733 / 3,415 | 0,10 % / 0,08 % |
| Ay / By bij Zmax = 3 | 2,727 / 1,758 | 2,723 / 1,755 | 0,14 % / 0,15 % |
| Ay / By bij Zmax = 4 | 2,442 / 1,622 | 2,436 / 1,618 | 0,26 % / 0,26 % |
| As (kophoek door H), lange paal | 1,623 | 1,609 | 0,9 % |
| Bs (kophoek door M), lange paal | 1,750 | 1,740 | 0,6 % |
| diepte grootste moment / T, lange paal | 1,3 | 1,33 | 2 % (bron geeft één decimaal) |
| Fy, ingeklemde kop | 0,93 | 0,925 | 0,5 % |
| Fm, inklemmoment / (H·T) | 0,93 | 0,925 | 0,6 % |

Verschil: het opknippen van k = nh·z in 40 lagen (zie Bevindingen); de
tabelwaarden hebben drie of vier cijfers. De waarden voor Zmax = 2, 3 en 4
zijn overgenomen zoals ze in studieboeken staan; zie Open punten.

### R6 Uitgewerkt voorbeeld: stalen buis Ø400/390 in klei, ingeklemde kop

Bron: Kouretzis (2025), *Fundamentals of foundation engineering and their
applications*, University of Newcastle (open studieboek), voorbeeld 6.12.
Su = 100 kPa, L = 10 m, σy = 450 MPa, E = 210 GPa.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| traagheidsmoment | 0,000121 m⁴ | 0,00012103 m⁴ | 0,02 % (afronding bron) |
| plastisch moment (D³ − d³)/6·σy | 351 kNm | 351,1 kNm | 0,02 % (afronding bron) |
| kopverplaatsing bij Hw = 263,5 kN, Kh = 16 750 kN/m³ | 19 mm (19,7 mm uit de formule) | 19,93 mm | 1,3 % |
| bezwijkbelasting korte paal, 9·Su·D·(L − 1,5D) | 3384 kN | 3387 kN | 0,08 % |
| inklemmoment bij bezwijken, 4,5·Su·D·(L² − 2,25D²) | 17 935 kNm | 17 563 kNm bij 98 % Hf (bron × 0,98 = 17 576) | 0,08 % |

Kopverplaatsing: de bron leest β·L = 5 af uit een grafiek (β = 0,50); met de
niet-afgeronde β = 0,5067 geeft dezelfde formule 19,93 mm, gelijk aan de module
(0,015 %). Bezwijken: de module rekent met een starre paal (EI = 10⁹ kNm²) op
veren met pu = 9·Su·D vanaf 1,5D; de bezwijkbelasting is de grootste kracht
waarbij nog evenwicht wordt gevonden. De tanh-veer nadert pu asymptotisch,
vandaar de vergelijking van het moment bij 98 %. De bron vindt voor deze
slanke buis een lagere bezwijkbelasting (527 kN) door vloeien van de paal;
plastische scharnieren in de paal rekent de module niet (zie Open punten).

### R7 Uitgewerkt voorbeeld: dezelfde paal in zand, ingeklemde kop

Bron: Kouretzis (2025), voorbeeld 6.13. φ' = 33°, γ = 18 kN/m³, Kp = 3,39,
pu = 3·Kp·γ·D·z.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| bezwijkbelasting korte paal, 1,5·γ·Kp·L²·D | 3661,2 kN | 3661,5 kN | 0,008 % |
| inklemmoment bij bezwijken, γ·Kp·L³·D | 24 408 kNm | 23 770 kNm bij 98 % Hf (bron × 0,98 = 23 920) | 0,6 % |

Verschil in het moment: bij 98 % van de bezwijkbelasting zijn de diepe veren
(grote pu) minder ver gemobiliseerd dan de ondiepe; de resultante ligt daardoor
iets hoger dan in het volplastische beeld van de bron. De kopverplaatsing leest
de bron af uit een grafiek ("ongeveer nul"); die is niet vergeleken.

### R8 Broms, korte paal met vrije kop in cohesieve grond

Bron: Broms (1964a), in de vorm van Kouretzis (2025) vgl. 6.104, 6.105 en 6.111.
D = 0,4 m, L = 4 m, Su = 100 kPa, e = 0.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| bezwijkbelasting | 403,25 kN | 403,23 kN | 0,005 % |
| grootste moment bij 97 % Hf, H·(1,5D + 0,5f) | 447,19 kNm | 447,22 kNm | 0,005 % |
| diepte grootste moment, 1,5D + f | 1,6865 m | 1,6869 m | 0,02 % |

### R9 Broms, korte paal met vrije kop in zand

Bron: Broms (1964b), Hf = ½·γ·Kp·D·L² bij e = 0. L = 4 m, pu = g·z met
g = 3·Kp·γ·D = 73,22 kN/m².

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| bezwijkbelasting volgens Broms | 195,3 kN | 152,2 kN | −22 % (Broms 28 % hoger) |
| bezwijkbelasting met dezelfde pu aan weerszijden van het draaipunt, g·L²·(2^(−2/3) − ½) | 152,26 kN | 152,25 kN | 0,008 % |

Verklaring: Broms vervangt de tegendruk onder het draaipunt door een puntlast
aan de paalvoet. De module verdeelt de tegendruk over de werkelijke lengte
onder het draaipunt met dezelfde pu(z); dat geeft exact de tweede regel. Het
verschil zit dus in de schematisering van Broms, niet in de rekenkern; de
module is hier de voorzichtige kant.

### R10 Stalen buis, plastische N–M-interactie

Bron: gesloten uitdrukking voor de dunwandige buis, M = Mpl·cos(π·n/2), en
Mpl = (D³ − d³)/6·fy. Buis Ø600×12, fy = 355 MPa.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| MRd bij N = 0,25·Npl | 1360,9 kNm | 1361,0 kNm | 0,001 % |
| MRd bij N = 0,5·Npl (druk en trek) | 1041,6 kNm | 1041,7 kNm | 0,007 % |
| MRd bij N = 0,75·Npl | 563,7 kNm | 563,9 kNm | 0,04 % |

Verschil: de module integreert de werkelijke wanddikte; de bron is dunwandig.

### R11 Betonpaal vierkant 400, 4Ø20, zuivere buiging

Bron: handberekening met de coëfficiënten van het parabool-rechthoekdiagram
(vulling 17/21, zwaartepunt op 99/238·x), fcd = 20 MPa, fyd = 435 MPa.

| Grootheid | Bron | Module | Verschil |
|---|---|---|---|
| MRd bij N = 0 | 91,251 kNm | 91,251 kNm | < 0,001 % |

### R12 Betonpaal rond en betongevulde buis

Bron: onafhankelijke herberekening van hetzelfde rekmodel met een andere
integratie (over de hoek in plaats van in stroken) en een eigen bepaling van de
neutrale lijn. Dit toetst de uitwerking, niet het model.

| Grootheid | Herberekening | Module | Verschil |
|---|---|---|---|
| rond Ø500, 8Ø20, N = 0 | 196,01 kNm | 196,01 kNm | 0,001 % |
| rond Ø500, 8Ø20, N = 800 kN | 279,23 kNm | 279,23 kNm | 0,002 % |
| gevulde buis Ø508×10, 6Ø20, buis werkt mee, N = 500 kN | 1097,8 kNm | 1098,3 kNm | 0,04 % |

## Herstelde fouten

1. **Laaggrenzen die op afronding na samenvallen** (`beam.ts`). Een laaggrens
   die één afrondingsstap naast de paalpunt of naast de buurlaag lag (bijvoorbeeld
   40 × L/40 in plaats van L), gaf een element van vrijwel nul lengte en de
   melding "Instabiel of te slecht geconditioneerd model". Grenzen binnen 1e-9 m
   vallen nu samen. Uitkomsten van berekeningen die al slaagden veranderen niet.
   Het invoerscherm rondt niveaus af op millimeters en raakte dit niet; invoer
   uit een script of koppeling wel.
2. **Onnodig gehalveerde elementen** (`beam.ts`). Door dezelfde afronding kreeg
   een laag van precies één elementlengte soms twee elementen. Dat gaf geen
   verkeerde uitkomst, maar bij veel lagen wel sneller de melding "Maximaal 200
   elementen". Het standaardvoorbeeld houdt hetzelfde net en dezelfde uitkomst.
3. **Geen convergentie bij een zeer stijve paal met korte elementen**
   (`nonlinear-beam.ts`). Het residu is een verschil van grote elementkrachten
   en kan niet kleiner worden dan enkele malen de machineprecisie daarvan; bij
   een paal □2000 met elementen van 75 mm bleef het boven de grens van 1e-7 × de
   belasting en volgde "Geen convergentie", ook lineair. De grens telt nu die
   afrondingsvloer mee, begrensd op 100 × de tolerantie (relatief 1e-5), zodat
   bezwijken nooit als evenwicht wordt aangenomen (test "bezwijken wordt niet
   als evenwicht geaccepteerd"). Uitkomsten van berekeningen die al slaagden
   veranderen niet.
4. **Afschuifteken in de diagrammen** (`ForceDiagrams.tsx`). Het pijltjespaar
   stond gespiegeld ten opzichte van de kracht op het bovenvlak. Alleen de
   tekening; de getallen waren en zijn goed.

In het rekenmodel zelf (liggervergelijking, veerwet, laagcorrectie,
doorsnedetoets, beddingswaarden uit de tabel, paaltabel) is geen fout gevonden.

## Bevindingen

- **Rekenkern:** in alle gevallen gelijk aan de referentie binnen de genoemde
  afwijking. Evenwicht van grondreactie en kopbelasting sluit tot 1e-6 kN.
- **Elementlengte:** met de standaard van 0,5 m wijkt het voorbeeld minder dan
  0,001 % af van een net met 0,1 m (kopverplaatsing en moment); met 2 m is het
  0,03 %. De keuze is dus niet kritisch.
- **Bedding die met de diepte toeneemt:** de invoer kent per laag een
  constante bedding (maximaal 40 lagen). Een lineair toenemende bedding moet
  dus in lagen worden opgeknipt. De afwijking door dat opknippen is bij
  10 / 20 / 40 lagen circa 10 / 2,9 / 0,7 % in de kopverplaatsing van een lange
  paal. Dit is een beperking van de invoer, niet van de oplossing.
- **Zeer korte elementen bij een slappe toplaag:** de lineaire oplosser weigert
  een model waarin de bedding verwaarloosbaar is tegenover de buigstijfheid van
  één element (melding "slecht geconditioneerd"). Kies dan een grotere
  elementlengte.
- **Beddingswaarden:** de acht grondsoorten in `soil.ts` zijn nagelopen tegen
  CUR-publicatie 166, tabel 3.3 (eerste secanttraject, laag en hoog gemiddelde)
  en komen overeen.

## Open punten

- **Tekenafspraak van het kopmoment.** De afspraak wijkt af van de literatuur
  (zie boven). Omdraaien zou de uitkomst van bestaande projecten met M ≠ 0
  veranderen en is daarom niet gedaan; het staat nu bij het invoerveld. Besluit
  van de eigenaar gevraagd.
- **Matlock & Reese, Zmax = 2, 3 en 4.** De tabelwaarden zijn overgenomen zoals
  ze in studieboeken staan; de oorspronkelijke publicatie is niet geraadpleegd.
  De module en de onafhankelijke differentieoplossing bevestigen ze tot op het
  opknipverschil.
- **Gepubliceerde p-y-gevallen.** De gevallen in `reference-cases.json` en
  voorbeeld 6.15 van Kouretzis (betonpaal in klei op zand, Mmax = 227,1 kNm bij
  200 kN) vragen p-y-krommen voor klei en zand die de rekenkern niet heeft; ze
  zijn niet nagerekend.
- **Bezwijken van de paal zelf.** Lange-paalbezwijken volgens Broms (plastisch
  scharnier in de paal) rekent de module niet; de paal blijft elastisch en de
  doorsnede wordt apart getoetst.
- **Doorsnedetoets beton rond en gevulde buis.** Alleen de uitwerking is
  onafhankelijk nagerekend (R12), niet tegen een gepubliceerd rekenvoorbeeld.
  Voor de gevulde buis wijkt het rekmodel (vlakke doorsnede, betonstuik 3,5 ‰)
  af van de plastische methode voor staal-betonkolommen.
- **Bovenbelastingsmodel** (Ka·q op een kerende breedte) en de automatische
  keuze van de beddingswaarde bij een losse paal (wandbedding × werkende
  breedte, zonder ruimtelijke correctie) zijn aannames, geen geverifieerde
  uitkomsten.
- **Grondwaterstand** zit niet in de invoer en dus niet in de 3D-weergave.

## Materiaaltoetsing (material-check.ts)

De materiaaltoetsing leest de snedekrachten uit en verandert verplaatsing,
snedekrachten en de N–M-toets niet; `material-check.test.ts` legt de waarden
van vóór de toevoeging vast voor de vijf doorsnedevarianten (tien gevallen).

**Geen van de formules is tegen de normtekst gelegd.** De normen zijn niet
openbaar; alles komt uit kennis van de norm. Elke toets heeft een geval dat met
de hand is nagerekend (de handberekening staat als commentaar bij de test), maar
dat toetst de uitwerking, niet of de formule en de waarden van de Nederlandse
bijlage juist zijn overgenomen. Vóór gebruik buiten een concept moet iemand de
onderstaande punten naast de normtekst leggen.

| Toets | Bron zoals gebruikt | Niet gecontroleerd tegen de tekst |
|---|---|---|
| Beton: V_Rd,c | NEN-EN 1992-1-1 art. 6.2.2 (1), formule (6.2) | C_Rd,c = 0,18/γc, k_1 = 0,15 en v_min in de Nederlandse bijlage |
| Beton: V_Rd,s, V_Rd,max | art. 6.2.3 (3), formules (6.8), (6.9) | ν_1, α_cw, grenzen van cot θ in de Nederlandse bijlage |
| Beton: beugels | art. 9.2.2 (5), (6) | of deze balkregels voor palen gelden; art. 9.5.3 is niet opgenomen |
| Beton: A_s,min, A_s,max | art. 9.5.2 (2), (3) | waarden in de Nederlandse bijlage |
| Beton: boorpaal | art. 9.8.5 (3) tabel 9.6N, (4) | waarden in de Nederlandse bijlage; staafafstand niet getoetst |
| Beton rond: b_w en d | Clarke & Birjandi (1993), Feltham (2004) | de publicaties zelf; staat niet in de norm |
| Beton rond: beugels π/4 | Priestley, Seible & Calvi (1996) | de publicatie zelf; staat niet in de norm |
| Buis: klasse | NEN-EN 1993-1-1 tabel 5.2 (50, 70, 90 ε²) | de tabel zelf |
| Buis: N, M, V | art. 6.2.3–6.2.6, A_v = 2A/π | γ_M0 = 1,0 in de Nederlandse bijlage |
| Buis: interactie | art. 6.2.8–6.2.10 | de norm van 2005 geeft voor buizen geen formule voor M_N,Rd; gebruikt is de exacte plastische interactie, en (1 − ρ) op de hele doorsnede |
| Gevulde buis | NEN-EN 1994-1-1 art. 6.7.1, 6.7.3.2, 6.7.3.6, tabel 6.3 | α_M, de grenzen van δ, D/t ≤ 90·235/f_y, 6 % wapening |
| Damwand | NEN-EN 1993-5 art. 5.2.2, 5.2.3 | A_V per profielvorm, de drempels 0,10 en 0,25 en de factoren 1,11 en 1,33; β_B en β_D zijn invoer |
| Sterkteklassen | NEN-EN 1992-1-1 tabel 3.1; NEN-EN 1993-1-1 tabel 3.1 | f_y bij wanddikten boven 40 mm |

Keuzes aan de veilige kant: σ_cp alleen als verlaging in α_cw; bij
V_Ed > 0,5 V_pl,Rd de vloeigrens van de hele staaldoorsnede verlaagd; geen
omsnoering bij de gevulde buis; damwand zonder bekende klasse of W_pl elastisch.

Niet mogelijk en daarom niet gedaan: de scheurwijdte (art. 7.3). De module kent
één belastingsgeval, dat als rekenwaarde wordt getoetst; een quasi-blijvende of
frequente combinatie zit niet in de invoer.

Buiten de toetsing: doorsnedeklasse 4 (buis en damwand), knik, P–Δ, verankering
en lassen, schuifverbinding van de gevulde buis, plooi van het damwandlijf (de
lijfhoek staat niet in de bibliotheek) en hout.

## Damwandprofiel en koppeling met het paaldraagvermogen

- **Damwandprofiel.** I, W, A, klasse en staalsoort komen uit
  `calc/library/sheetPiles`, per m doorgaande wand. De rekenbreedte is 1 m wand
  of één plankbreedte; EI = β_D·E·I·b. De grondveren gebruiken de werkende
  breedte: 1,00 m bij een doorgaande wand (geen spreiding opzij), de
  plankbreedte bij een losse plank. Voor een losse U-plank zijn de
  wandwaarden te gunstig; dat moet de gebruiker met β_B en β_D of met
  fabriekswaarden inrekenen. Het is geen damwandberekening: de veren zijn
  tweezijdig gelijk, zonder actieve en passieve gronddruk, anker of fasering.
  De tekening en het 3D-beeld zijn schematisch (flensbreedte en lijfhoek staan
  niet in de bibliotheek).
- **Overnemen uit een paaldraagvermogenberekening** (`pile-link.ts`). De
  grondsoort van de verticale berekening zegt niet hoe vast de laag is: zand
  wordt "matig", klei en veen "slap" (aanname, door de gebruiker na te lopen).
  De verticale berekening kent geen p_u; de overgenomen berekening rekent
  daarom lineair. Grondwaterstand en maaiveld worden vermeld maar niet gebruikt.
