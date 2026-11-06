# Horizontale paalbelasting

## Doel en architectuur

Een zelfstandige experimentele module naast paaldraagvermogen, met eigen invoer,
opslag en resultaten. De bestaande verticale berekening blijft afzonderlijk.
TypeScript sluit aan op het bestaande rekenframework en ondersteunt dezelfde
berekening in desktop en browser. Geen nieuwe solverafhankelijkheid.

## Modellen

- Euler–Bernoulli-ligger met twee vrijheidsgraden per knoop, consistente
  Winkler-bedding en equivalente belastingsvectoren; laaggrenzen zijn knopen.
- H en M op de kop; vrije of geblokkeerde koprotatie en vrije/ingeklemde punt.
- Per laag horizontale bedding kh [kN/m³], werkende breedte B [m], lijnbedding
  kh*B [kN/m²]. CUR166 deel 1 tabel 3.3 levert een expliciet gekozen secantwaarde
  en laag/hoog scenario. Een CUR-wandwaarde is geen gevalideerde 3D-paalcorrectie.
- De beschikbare lokale bron is een BRIS-afdruk van CUR C166, publicatiedatum
  2008, met vermelding van erratum zesde druk. Geen stilzwijgende claim dat dit
  de actuele normtekst is. Het originele document wordt niet gedistribueerd.
- Bovenbelasting kan als geotechnisch belastinggegeven worden vastgelegd.
  Omzetting naar netto paallijnbelasting vereist een expliciet gekozen model
  en invloedbreedte. Bij een vrijstaande paal mag q niet automatisch als
  eenzijdige wanddruk worden aangebracht. Een voorgeschreven netto
  gronddrukprofiel blijft een expliciete invoer met bron/toelichting.

## Doorsnede

Beton rond/vierkant, stalen buis en betongevulde stalen buis. EI wordt opgebouwd
uit afzonderlijke materiaalbijdragen met zichtbare E, I en reducties. Volledige
samengestelde werking vereist bevestigde krachtoverdracht. Ongescheurde EI,
effectieve project-EI en EC4-stijfheid voor stabiliteit zijn verschillende
begrippen. Materiaalwaarden, normeditie en projectfactoren zijn expliciet.

Een doorsnedetoets voor wapening moet N en M combineren en geometrie,
dekking, staafligging en materiaalsterkten gebruiken. Een positief resultaat
mag geen volledige normtoets suggereren zolang dwarskracht, scheurwijdte,
minimumwapening, verankering, lokale buisinstabiliteit of samengestelde werking
niet zijn gecontroleerd.

## Uitvoer en verificatie

Schema, invoerwaarden en bron van elke veer; y, rotatie, M, V en grondreactie
over de diepte. Krachten- en momentenevenwicht, netverfijning en duidelijke
fouten bij onstabiele of ongeldige modellen. Positieve rotatie is dy/dz;
tekenconventie van H/M en reacties wordt expliciet vastgelegd.

Analytische liggeroplossingen toetsen de solver onafhankelijk van
grondmodellen. Externe referenties worden afzonderlijk gecatalogiseerd met
URL, pagina, belastingsgeval, invoer, uitkomsten en ontbrekende gegevens.
Een gevonden publicatie, een belastingstap en een reproduceerbare onafhankelijke
berekening zijn verschillende eenheden; aantallen worden niet uitgewisseld.

## Alternatieven

Een volledige 3D-continuümberekening vraagt veel extra grondparameters en past
niet bij een compacte controleerbare module. Een handformule ondersteunt de
gelaagde grond en gecombineerde koplasten onvoldoende. Een ligger op veren
vormt de eerste rekenkern; niet-lineaire grondmobilisatie en gescheurde
moment-kromming zijn afzonderlijke uitbreidingen, geen impliciete eigenschappen
van de lineaire solver.
