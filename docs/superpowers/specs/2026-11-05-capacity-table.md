# Draagvermogentabel

Een paaldraagvermogenberekening krijgt een tabelweergave met één gedeelde
paaldoorsnede en normkeuze. Rijen zijn geselecteerde projectsonderingen;
kolommen zijn expliciet opgegeven paalpuntniveaus in m NAP. Iedere cel
gebruikt de bestaande rekenkern en toont Rc;net;d in kN. Ongeldige cellen
tonen hun fout en nooit nul als schijnbaar geldig draagvermogen.

Een cel opent de detailberekening door alleen cptId en pileToeNap te
wijzigen; de opgeslagen tabelkeuzen blijven behouden. Er ontstaan geen
losse duplicaten. Terugschakelen naar de tabel behoudt de selectie.
De volledige paalinvoer blijft beschikbaar voor type, diameter, wanddikte,
norm, belasting, water en grondlagen. Alle niveaus zijn absoluut NAP;
dezelfde grondlagen en kleefgrenzen gelden voor de hele tabel en worden
expliciet benoemd. Geen automatische aanpassing van grond- of kleefgrenzen.

Tabelkeuzen worden als optionele invoer opgeslagen, zodat bestaande
projecten compatibel blijven. Ontbrekende of verwijderde sonderingen
blijven zichtbaar als fout. Ontbrekende tabelconfiguratie selecteert de
huidige projectsonderingen met het huidige paalpunt als eerste niveau.
De tabel rekent per sondering; geen onbedoelde groeps- of meer-CPT-reductie.
Conceptstatus blijft behouden. OpenAEC Blueprint blijft de vormgeving.
