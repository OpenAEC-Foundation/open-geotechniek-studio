# Grondveren en equivalente diepte

De projectwet gebruikt `p = pu tanh(k0 y / pu)`, met tangent
`dp/dy = k0 sech²(k0 y / pu)`. De secant is `p/y`; bij nulverplaatsing
zijn tangent en secant gelijk aan `k0`. Bij `pu = 0` zijn reactie en beide
stijfheden nul. Lineaire analyse gebruikt uitsluitend `p = k0 y`, zonder
begrenzing door `pu`.

De projectspecifieke grensweerstand is
`pu(z) = min(cap, a + g z)`. De integraal wordt exact berekend met een
stijgend kwadratisch deel en een constant deel na het bereiken van de cap.
Weerstand `p` en `pu` hebben eenheid kN/m, `k0` kN/m², diepte m en de
geïntegreerde weerstand kN. Invoer moet eindig en niet-negatief zijn;
de cap is positief en minstens de oppervlakteweerstand.

Bij Georgiadis wordt aan iedere laagbovenkant de integraal van het huidige
homogene profiel vanaf nul gelijkgesteld aan de totale grensweerstand van
alle bovenliggende lagen. Die bovenlagen zijn daarbij op hun eigen reeds
verschoven diepten geëvalueerd. De huidige laag voegt vervolgens alleen
haar eigen dikte op die equivalente diepte toe. De inverse integraal wordt
analytisch opgelost. Een identiek nulprofiel kan geen positieve bovenliggende
weerstand vertegenwoordigen en geeft een expliciete fout.

De eerste laag begint op equivalente diepte nul, ook onder een vrije
paalkop. Fysieke gaten leveren geen weerstand. Zonder laagcorrectie wordt
diepte gemeten vanaf de bovenkant van de eerste laag, inclusief eventuele
gaten; alleen de werkelijk aanwezige laagdelen tellen mee in de integraal.
Laagcorrectie verschuift `pu`, terwijl het ingevoerde constante `k0` gelijk blijft.

De bron voor het principe van equivalente diepte is het officiële
[Caltrans-rapport, sectie 2.4.3, vergelijkingen 2.12–2.13](https://dot.ca.gov/-/media/dot-media/programs/research-innovation-system-information/documents/f0016560-final-report-task-0932.pdf).
De oorspronkelijke publicatie is Georgiadis, M. (1983), *Development of p-y
Curves for Layered Soils*, Geotechnical Practice in Offshore Engineering,
ASCE, pp. 536–545. De oorspronkelijke volledige tekst is niet geraadpleegd.

De tanh-wet en de afgetopte lineaire grensweerstand zijn expliciete
projectaannames; zij volgen niet als complete zand- of kleiwet uit deze bron.
De berekening is statisch, monotoon en symmetrisch en bevat geen cyclische
hysterese, degradatie of materiaalsoftening. Parameters vereisen een
projectspecifieke onderbouwing; resultaten blijven concept.
