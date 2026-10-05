# Numerieke verificatie

Trajectgemiddelden gebruiken een cumulatieve trapeziumintegraal met binaire
zoekacties naar de trajectgrenzen. Opbouw kost O(n); elk gemiddelde O(log n).
De index wordt per berekening opgebouwd zodat gewijzigde meetgegevens direct
worden verwerkt. Meetpunten moeten op diepte zijn gesorteerd.

Voor de schachtweerstand worden beide geïnterpoleerde segmentgrenzen gebruikt.
Een lineair qc-profiel geeft daardoor hetzelfde gemiddelde bij grove en fijne
meetpuntafstand. De bestaande laagbegrenzingen en paalfactoren blijven gelden.

Prestatieproef: `node apps/desktop/scripts/benchmark-pile.mjs` vanuit de
repository-hoofdmap. De proef meet alleen de puntberekening met 30.001
synthetische meetpunten, drie opwarmrondes en de mediaan van vijftien metingen.
Op de ontwikkelmachine daalde de mediaan van 26,3 naar 1,9 ms. Dit is geen
garantie voor dezelfde versnelling van de volledige applicatie.

## Openstaand punt bij de puntweerstand

Deze beperking betreft het behouden projectmodel en het profiel 2017. De
afzonderlijke historische profielen hebben een nieuwe trajectprocedure, inclusief
de startregel van traject II, gecontroleerd met de tabellarische normbijlage.
Zie [historische verificatie](HISTORISCHE-NORMEN.md).

De bestaande puntmethode kiest het traject met het laagste qc;I. NEN
9997-1:2016+C2:2017, §7.6.2.3(e), vraagt een trajectkeuze op basis van het minimum
van de volledige puntweerstand. Dit is een bekende beperking; de implementatie
mag niet als volledige verificatie van deze normprocedure worden beschouwd.

Een proef met minimalisatie van de volledige uitdrukking, met behoud van de
bestaande afkapregels, gaf bij sondering S1 uit referentie-rapport 984 ongeveer
367 kN in plaats van de referentiewaarde 419 kN. De juiste combinatie van
trajectkeuze en afkapregels moet onafhankelijk worden geverifieerd voordat deze
methodewijziging wordt vrijgegeven. De prestatieoptimalisatie behoudt daarom
de bestaande puntmethode en ongewijzigde referentietoleranties.

De 100 externe componentgevallen toetsen aangeleverde trajectgemiddelden en
verifiëren deze trajectkeuze dus niet. Aanvullende analytische tests toetsen
segmentintegratie, gedeeltelijke segmenten en meetpuntafstand.
