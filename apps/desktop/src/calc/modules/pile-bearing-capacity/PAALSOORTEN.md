# Paalsoorten in de draagvermogenmodule

De catalogus bevat elf varianten: het behouden stalen-buisprojectmodel, vierkante en ronde prefab betonpalen, een gesloten stalen buispaal volgens tabel 2017, twee typen betonpalen met teruggewonnen mantelbuis, een betonschroefpaal, een stalen schroefpaal met groutinjectie, een avegaarpaal, een boorpaal met steunvloeistof en een houten paal met constante of taps verlopende ronde doorsnede.

## Bronbasis

De normkeuze voegt historische profielen voor 1991, 2006 en 2011/2012 toe.
Zie [historische normen en vergelijkingen](HISTORISCHE-NORMEN.md) voor de
onderbouwde paaltypen, veiligheidsfactoren en rekenbeperkingen.

De nieuwe presets gebruiken NEN 9997-1:2016+C2:2017, tabel 7.c, inclusief het toepassingsgebied zand/zand-grind. Gecontroleerd tegen de lokale norm in `Z:/20_knowhow/Normen/Eurocodes/`; de opgeslagen afdruk bevat de tabel op PDF-pagina's 198–201. De bestaande stalen-buisfactoren uit het referentiemodel blijven onder hun bestaande ID bewaard. Nieuwe berekeningen starten met de expliciete tabelvariant uit 2017.

De kennisbestanden in `Z:/20_knowhow/Constructie/7_fundering_op_palen` ondersteunen het onderscheid tussen schacht en voet en tussen materiaalmodellen. De oudere productbladen leveren geen algemene actuele factorenset.

Projectfactoren worden met bron en editie in de berekeningsinvoer opgeslagen. Editie 2025 is mogelijk als projectfactorenset; er is geen ingebouwde, volledig geverifieerde catalogus of complete rekenmethode volgens 2025. De wijzigingen en de voorrang van toepasselijke zelfverklaringen zijn beschreven op de [NEN-toelichtingspagina](https://www.nen.nl/nieuws/bouw/herziene-versie-nen-9997-1/).

## Geometrie en stijfheid

`diameterMm` is de ronde schachtdiameter of vierkante schachtzijde. `baseDiameterMm` bepaalt het puntoppervlak en de equivalente diameter voor de puntberekening. Als die optionele waarde ontbreekt, wordt de schachtmaat gebruikt. De voetmaat verandert de positieve of negatieve schachtomtrek niet.

`axialStiffnessKn` is een expliciete EA in kN. Dit is verplicht voor nieuwe in de grond gevormde typen, groutschroefpalen en hout met constante diameter. Bij taps hout wordt geen zakking bepaald en is EA niet vereist. Zo wordt de bestaande stijfheid van prefab beton of een betongevulde stalen buis niet automatisch op andere materialen toegepast. De EA moet op de constructieve doorsnede gebaseerd zijn, niet op een grotere geotechnische grout- of voetdiameter.

Een typewissel verwijdert projectspecifieke factoren, puntmaat en EA. Deze mogen niet ongemerkt naar een ander paalsysteem worden overgenomen. Ontbrekende optionele invoer behoudt het gedrag van bestaande projectbestanden.

## Implementatiegrenzen

- De module blijft experimenteel. De presets maken de bestaande volledige grond- en rekenmethode niet normgevalideerd.
- De bestaande lastzakkingslijn 1 is beschikbaar. Voor avegaarpalen (lijn 2) en boorpalen (lijn 3) worden draagkrachtcomponenten bepaald, maar geen zakking of veerwaarden getoond of gerapporteerd.
- De avegaarvariant uit 2017 begrenst de start van qc;III op 2 MPa; er is geen vrijstelling voor nasonderingen ingevoerd. Bij expliciete projectfactoren 2025 vervalt deze oude begrenzing volgens de toelichting van NEN.
- De gesloten buispreset uit 2017 accepteert maximaal 10 mm uitsteken van de voetplaat per zijde. De groutschroefpreset vereist minimaal 300 mm schachtdiameter.
- Hout ondersteunt een constante of lineair taps verlopende ronde doorsnede, zonder betonoplanger. Zakking en veerwaarden voor taps hout zijn niet geverifieerd.
- Open stalen buizen, profielen, micropalen, trek, horizontale belasting en wapening zijn niet toegevoegd. De daarvoor vereiste aanvullende rekenmodellen zijn niet uitwisselbaar met de huidige drukpaalberekening.
- Bij afwijkende voetmaten blijven de projectspecifieke beta-factor en het toegestane schachtwrijvingstraject te controleren. De app leidt beta niet automatisch af uit voethoogte.

## Tapse houten palen

Bij hout kan `timberTaper` worden ingesteld met `toeDiameterMm` en `lengthM`.
`diameterMm` is dan de kopdiameter. De diameter neemt lineair af vanaf de kop
over de opgegeven tapse lengte en blijft daaronder constant tot de punt.
De lengte moet positief zijn en binnen de totale paallengte liggen; de
puntdiameter moet positief en niet groter dan de kopdiameter zijn.
Een onafhankelijke voetmaat is hierbij uitgesloten.

Negatieve kleef gebruikt de lengtegemiddelde omtrek over het negatieve
kleeftraject; de overgang naar het constante deel wordt exact meegenomen.
Voor hout blijft δ = 0,75φ. Positieve kleef gebruikt de gemiddelde omtrek
per beschouwde grondlaag. Puntoppervlak en Deq volgen de puntdiameter.
Bronbasis: NEN 9997-1:2011+C1:2012 §7.3.2.2(d) en §7.6.2.3;
de omtrekafhankelijkheid is ook beschreven in het openbare
[Handboek Funderingen](https://kennisbank.crow.nl/public/gastgebruiker/FUNT/Handboek_Funderingen_%E2%80%93_Deel_A_%28Eurocode_7%29/A_3400%C2%A0Funderingen_op_palen/64497).
Dit is een geometrische uitbreiding van het experimentele model. Er wordt
geen extra draagkracht door coniciteit toegevoegd en geen zelfstandige
reductiefactor op negatieve kleef aangenomen. Geen betonoplanger,
houtsterkte- of aantastingscontrole. De beperkte editie 1991 ondersteunt
nog steeds uitsluitend vierkante prefab betonpalen.

Analytische tests controleren de omtrek bij meerdere kleefgrenzen, een
overgang binnen de kleefzone, puntoppervlak, positieve kleef en ongeldige
geometrie. Dit vervangt geen onafhankelijke validatie van een volledige
tapse houtberekening.

## Verificatie

De tests controleren geometrie, factoroverrides, cataloguswaarden, toepassingsgrenzen, EA, avegaarbegrenzing, uitsluiting van niet-ondersteunde lastzakkingslijnen en typewissels. De 100 openbare referentiegevallen blijven componentcontroles met expliciete bronfactoren; zij vormen geen volledige validatie van alle nieuwe paalsoorten.
