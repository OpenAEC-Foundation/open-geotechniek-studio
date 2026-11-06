# Niet-lineaire grondveren en interactieve paalweergave

## Uitgangspunten

De afzonderlijke horizontale paalmodule krijgt een schakelbare lineaire en
niet-lineaire analyse, een echte 3D-geometrieweergave en een aanklikbaar
rekenmodel. Elk zichtbaar veerpunt verwijst naar een werkelijk integratiepunt
in de solver. 3D is een weergave van dezelfde liggerberekening, geen aanvullende
continuümgrondberekening.

## Grondmodel

Georgiadis bepaalt equivalente diepten bij laagovergangen door de geïntegreerde
uiterste grondweerstand boven de overgang gelijk te stellen aan die in een
homogene voortzetting van de volgende grondlaag. De laagcorrectie is afzonderlijk
te kiezen en is geen zelfstandige p-y-veerwet.

De eerste niet-lineaire veerwet is een expliciet hyperbolisch projectmodel:
p = pu tanh(k0 y / pu), met k0 uit de bestaande bedding maal werkende breedte.
pu(z) = min(pu,cap, pu,0 + g z) wordt projectspecifiek ingevoerd. Deze
parameterisatie wordt niet aangeduid als een volledige CUR166-, zand- of
kleiwet. De invoer en alle aannames zijn zichtbaar in het veervenster.
Georgiadis verplaatst de diepte voor pu, niet stilzwijgend de constante k0.
Statische monotone belasting, symmetrische weerstand; geen cyclische hysterese,
degradatie of materiaalsoftening in deze uitbreiding.

Lineair rekenen blijft beschikbaar met p = k0 y. Oude projecten zonder
analysekeuze behouden het lineaire gedrag. Nieuwe voorbeeldinvoer gebruikt
het niet-lineaire projectmodel en markeert de grensweerstandswaarden als
voorbeeldwaarden die een projectspecifieke onderbouwing vereisen.

## Solver en inspectie

Consistente vierpunts Gauss-integratie langs Euler–Bernoulli-elementen.
Newton-iteratie met belastingstappen, lijnzoeken en expliciete residucriteria.
Geen resultaat bij gebrek aan convergentie of een mechanisme; geen verborgen
terugval naar een lineaire oplossing. Het geval met lineaire veren moet dezelfde
oplossing opleveren als de bestaande lineaire solver.

De geselecteerde veer toont werkelijke en equivalente diepte, laag, gebruikte
parameters, p-y-curve, werkpunt, initiële stijfheid, tangentstijfheid,
secantstijfheid, grensweerstand en de integratielengte. p is grondreactie per
paallengte in kN/m; de stijfheden zijn in kN/m².

## Presentatie

Three.js met orbitbediening, transparante grondlagen en de paaldoorsnede.
Schakelaars 3D, rekenmodel en diagrammen. Het rekenmodel toont elementen,
steunen, koplasten en klikbare veerpunten. Selectie vanuit model en dieptelijst
is gesynchroniseerd. De p-y-curve toont ook de lineaire referentie en een
tangent door het werkpunt. Numerieke tabellen blijven bruikbaar als WebGL
niet beschikbaar is. Bestaande Blueprint-kleuren en componentvormgeving.

## Verificatie

Exacte lineaire reductie, analytische één-vrijheidsgraadproeven,
symmetrie, grensweerstand, lasten boven weerstand, mislukte convergentie,
evenwicht en netverfijning. Georgiadis: integraalevenwicht, identieke lagen,
sterk-op-zwak en zwak-op-sterk. De selectie-ID moet exact dezelfde veerwaarden
tonen als de solveruitvoer. Alle resultaten blijven concept.
