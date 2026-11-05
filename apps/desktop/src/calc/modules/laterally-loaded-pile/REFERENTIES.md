# Referenties en reikwijdte

`reference-cases.json` bevat 50 geselecteerde berekeningsgevallen: 7 uitgewerkte
laterale voorbeelden uit officiële rapporten, 3 universitaire rekenvoorbeelden
of heranalyses en 40 expliciet gepubliceerde combinaties uit een parameterstudie
van gewapende betonpalen. De 40 parametergevallen zijn geen 40 onafhankelijke
projecten of experimenten. Belastingsstappen zijn niet als extra berekening
geteld. De selectie is afkomstig uit vier bron-PDF's.

Tien gevallen bevatten numerieke broninvoer en -uitvoer. Dat maakt ze niet
automatisch vergelijkbaar met het huidige lineaire Winkler-model. De andere
gevallen vereisen grondmodelmapping, digitalisering of aanvullende gegevens.
Geen van deze 50 gevallen is al als geslaagde externe solververificatie
geregistreerd. De onafhankelijke analytische tests van de rekenkern zijn eigen
mechanische controles en tellen niet mee als externe voorbeelden.

De gedownloade bron-PDF's en uitgebreidere datasets worden buiten de repository
bewaard. Het bronregister geeft publieke URLs en exacte vindplaatsen.

## Primaire bronnen

- [Officiële laterale voorbeelden, FHWA-SA-91-048](https://rosap.ntl.bts.gov/view/dot/40955/dot_40955_DS1.pdf), voorbeelden 1–6.
- [GEC9](https://www.fhwa.dot.gov/engineering/geotech/pubs/hif18031.pdf), appendix B.
- [Officieel veldproefrapport cmr14-011](https://rosap.ntl.bts.gov/view/dot/27205/dot_27205_DS1.pdf), tabel 3.1 en appendices B–E.
- [Elastische paaloplossingen](https://dvgriffiths.mines.edu/pubs/All_J_Pubs/95.pdf), numerieke voorbeelden op PDF-pagina's 7–8.
- [Parameterstudie gewapende betonpaal](https://repository.up.ac.za/bitstreams/c9c73d1b-4e32-4cd4-8bcc-6fb12f9bb8af/download), figuur 7: grondstijfheid, grondsterkte en wel/geen spleetvorming; grafische respons moet nog worden gedigitaliseerd.
- Aanvullende veldgegevens, buiten de selectie van 50 berekeningen:
  [Cowden](https://ora.ox.ac.uk/objects/uuid:3dd5c696-ec51-401f-8399-0797d5940b4c/files/rqv33rw89j) en
  [Dunkirk](https://spiral.imperial.ac.uk/server/api/core/bitstreams/c8163102-3294-4de0-bb6c-7e7595647155/content), tabellen 1 en 3.

## Doorsnede en bedding

- CUR C166 deel 1, lokale BRIS-afdruk, publicatiedatum 2008, vermelding erratum
  zesde druk, PDF-pagina 25: tabel 3.3, uitsluitend het eerste secanttraject.
  De automatische waarden zijn wandbeddingswaarden. De werkende breedte is
  expliciet; een ruimtelijke paalcorrectie is niet stilzwijgend inbegrepen.
- [JRC EC2 uitgewerkte voorbeelden, 2014](https://eurocodes.jrc.ec.europa.eu/doc/1110_WS_EC2/report/1110_WS_EC2.pdf): eerste generatie EC2-toelichting.
- [JRC EC4 samengestelde kolommen, 2008](https://eurocodes.jrc.ec.europa.eu/doc/WS2008/EN1994_4_Hanswille.pdf): de factoren voor EC4-stabiliteitsstijfheid zijn geen algemene laterale SLS-stijfheid en worden daarom niet automatisch toegepast.

Het doorsnedemodel integreert vlakblijvende rekken met een parabool-rechthoek
voor beton (fck maximaal 50 MPa, rekgrenzen 2 en 3,5 promille). Wapening en
buisstaal hebben een elastisch-perfect plastisch diagram; betontrek draagt
niet bij. De neutrale as wordt bij de opgegeven normaalkracht opgelost.
Bij een volledig gedrukte doorsnede draait het rekprofiel om het punt met
2 promille op 3/7 van de doorsnedehoogte. Staafoppervlak vervangt beton.
Voor een holle stalen buis wordt de plastische N–M-verdeling analytisch
geïntegreerd; lokale plooi of doorsnedeklasse is daarbij geen uitgevoerde toets.

## Beperkingen

Dit is een concept voor lineaire eerste-orde respons en een beperkte
N–M-doorsnedetoets. Geen volledige geotechnische of constructieve normtoets.
Passieve grensdruk, niet-lineaire grondmobilisatie, scheurafhankelijke EI,
P–Δ, dwarskrachtweerstand, scheurwijdte, minimumwapening, verankering,
lokale buisinstabiliteit en bewijs van samengestelde werking worden niet
automatisch vastgesteld. Een projectfactor op de betonstijfheid is een
expliciete ingenieursaanname, geen automatisch gescheurd model.

Het maaiveldmodel omvat alleen de incrementele belasting door uniforme,
oneindige, eenzijdige bovenbelasting op een verticale gladde kerende lijn bij
horizontaal maaiveld: Ka = tan²(45° − φ/2), Δp = Ka q. De kerende invloedbreedte
is afzonderlijke invoer. Voor een vrijstaande paal in doorgaande grond wordt
geen netto belasting uit q afgeleid; daar is een onderbouwd grondverplaatsings-
of ander belastingsmodel nodig. Een eindige strookbelasting is niet inbegrepen.
