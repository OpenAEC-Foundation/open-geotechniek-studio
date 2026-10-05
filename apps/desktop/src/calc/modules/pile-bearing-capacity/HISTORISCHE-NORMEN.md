# Historische paaldraagkracht

De normversie wordt per berekening opgeslagen in `PileInput.standard` en
verschijnt in de invoer, resultaten en PDF. Ontbreekt het veld in een bestaand
project, dan blijft het bestaande rekenmodel behouden. Een expliciete wissel
verwijdert projectfactoren, losse voetmaat en EA en stelt de materiaalfactor in
op de beginwaarde van de gekozen editie. Belastingwaarden worden niet omgerekend.

| Profiel | Paalfactoren | Veiligheidsstap bij één sondering |
|---|---|---|
| NEN 6743:1991, referentieprofiel | Alleen vierkante prefab betonpaal: αp=1, αs=0,010 | Rrep=0,75·Rcal; γm beginwaarde 1,25 |
| NEN 6743-1:2006 | Tabel 2, elf catalogusvarianten | Rrep=0,72·Rcal; γm beginwaarde 1,20 |
| NEN 9997-1:2011+C1:2012 | Oorspronkelijke tabel 7.c, vóór verlaging | Rk=Rcal/1,39; γm beginwaarde 1,20 |
| NEN 9997-1:2016+C2:2017 | Bestaande catalogus en rekenprocedure | Bestaande veiligheidsstap |

De 1991-waarden zijn gecontroleerd met openbare referentie 05290. Dit is geen
volledige implementatie van alle paaltypen en wijzigingen uit 1991/1997.
De profielen 2006 en 2012 zijn gecontroleerd met de lokale normafdrukken in
`Z:/20_knowhow/Normen/`. Het bestand met de naam `NEN 6743 funderingen op palen.pdf`
bevat daadwerkelijk de editie november 2006; de titelpagina is leidend.

## Historische rekenprocedure en grenzen

De profielen 1991, 2006 en 2012 gebruiken een afzonderlijke trajectprocedure:
het minimum van de volledige puntweerstand, een zoekstap van 0,01 Deq plus de
meetknikken en trajectgrenzen, en een doorlopend minimum van beneden naar boven.
Traject II start bij de gemeten qc, zonder extra begrenzing op het gemiddelde
van traject I. Lineaire segmenten worden geïntegreerd met inbegrip van interne
snijpunten met de afkapwaarde. Dit is een discrete minimumbepaling.

De procedure verlangt complete, oplopende, eindige en niet-negatieve qc-data en
de hele invloedszone (8 Deq boven, begrensd door maaiveld, tot 4 Deq onder de punt).
Voor positieve schachtwrijving worden alleen zandlagen ondersteund. Pieken
worden conservatief op 12 MPa afgesneden; de gunstige uitzondering voor lagen
dikker dan 1 m met een grens tot 15 MPa wordt niet automatisch toegepast.
Voor in de grond gevormd beton wordt bij negatieve kleef δ=φ gebruikt; voor
prefab, hout en stalen omhulling δ=0,75φ.

Historische zakking, veerwaarden, paalgroepen en afwijkende voetmaten zijn
uitgesloten. De 1991-keuze beperkt de beschikbare paaltypen. Projectfactoren
moeten dezelfde editie hebben als het historische profiel; een rapport mag
geen verschillende normversies combineren. OCR-, korrelgrootte- en
ontgravingscorrecties zijn niet geïmplementeerd. Invoer moet dus een situatie
zonder deze effecten beschrijven, of reeds onderbouwde gecorrigeerde qc bevatten.
Dit blijven experimentele rekenprofielen, geen verklaring van volledige
normconformiteit. De keuze voor een historische norm bepaalt niet of die norm
voor een nieuw ontwerp mag worden toegepast.

## Openbare vergelijkingen

Gedownload op 6 oktober 2026. URL, documentblad en SHA-256 staan in
`__fixtures__/historical-public-cases.json`. De originele PDF's zijn buiten de
repository opgeslagen; de fixture bevat alleen numerieke referentiegegevens.

| Referentie | Component | Gepubliceerd | Berekend |
|---|---|---:|---:|
| 60700963, blad 8, editie 2006 | Puntkracht | 728 kN | 729,57 kN |
| 60700963, blad 8 | Schachtkracht | 124 kN | 124,41 kN |
| 60700963, blad 8 | Representatieve draagkracht | 614 kN | 614,86 kN |
| 05290, blad 31–32, editie 1991 | Puntkracht | 196,6 kN | 197,23 kN |
| 05290, blad 32 | Schachtkracht, 33 sectoren | 223,9 kN | 223,56 kN |
| 05290, blad 32 | Rekenwaarde draagkracht | 252,3 kN | 252,48 kN |
| Normbijlage A, editie 2006 | Puntweerstand uit 50 CPT-meetpunten | 7,3 MPa | 7,2864 MPa |

De kleine verschillen in de internetvoorbeelden volgen uit de afgeronde
qc-gemiddelden. Tests begrenzen de verschillen met de gepubliceerde
afrondingsprecisie. De 1991-veiligheidsstap afzonderlijk, met de gepubliceerde
krachten 196,6 en 223,9 kN, levert exact 252,3 kN.

De twee internetvoorbeelden leveren componentcontroles, geen volledige
reconstructie van hun sonderingen. De normbijlage toetst wel de puntprocedure
met een tabellarisch CPT-profiel. Daar wordt de afgeronde Deq=400 mm uit het
voorbeeld gebruikt; het eveneens afgeronde puntoppervlak wordt niet als exact
geometrisch resultaat overgenomen. De bestaande 100 openbare componentgevallen
blijven afzonderlijk getest.

Bij dezelfde trajectgemiddelden zou de prefab-factor uit 2017 respectievelijk
510,70 en 138,06 kN puntkracht opleveren. Dit verschil van 30% toont waarom een
historische berekening niet met de huidige paalfactor kan worden gereproduceerd;
het is geen volledige vergelijking van alle normregels.

Reproduceren vanuit de repository-hoofdmap:

```text
node apps/desktop/scripts/compare-historical-piles.mjs
npm --prefix apps/desktop test -- historical
```

Bronnen:

- [Rekenvoorbeeld 60700963, blad 8](https://www.heemskerk.nl/fileadmin/decos/bouwvergunning/c17d60bfc1c691529a130014ce6a350472ba6b2b/p0009.pdf)
- [Referentie 05290, blad 31](https://www.heemskerk.nl/fileadmin/decos/bouwvergunning/3497d5ad4f3f57ac9eb86c60e61a4085abaca98f/p0031.pdf)
- [Referentie 05290, blad 32](https://www.heemskerk.nl/fileadmin/decos/bouwvergunning/3497d5ad4f3f57ac9eb86c60e61a4085abaca98f/p0032.pdf)
- [NEN: editie 1991 en vervanging door 2006](https://www.nen.nl/nen-6743-1991-nl-100)
- [NEN: editie 2006, ingetrokken in 2012](https://www.nen.nl/nen-6743-1-2006-nl-66798)
