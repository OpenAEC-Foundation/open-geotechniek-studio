# Symbolen op de sonderingstekening

Dit document legt vast welke symbolen de situatietekening gebruikt en waarom.
De tekenlogica staat in `symbols.ts`; de soort van een sondering in
`sonderingSoort.ts`.

## Wat is gangbaar

Er is geen norm gevonden die plansymbolen voor de verschillende soorten
sonderingen vastlegt. De normen voor het sonderen zelf (NEN-EN-ISO 22476-1 en
de oudere NEN 5140 en NEN 3680) en voor boren (NEN-EN-ISO 22475-1) zijn niet
vrij in te zien; dat zij geen plansymbolen voorschrijven is een inschatting,
gesteund door het feit dat elk bekeken rapport een eigen legenda meelevert.
De symbooltabel van de Nederlandse CAD-standaard voor de GWW kon niet worden
geraadpleegd.

In openbare sondeerrapporten en funderingsadviezen (legenda's bij
bestemmingsplannen en aanbestedingen, vijf rapporten van vijf bureaus,
2010-2023) komt steeds hetzelfde beeld terug:

- een sondering is een **driehoek met de punt omlaag**; de punt staat op de
  locatie;
- een **kort horizontaal streepje onder de punt** betekent: met plaatselijke
  kleefmeting;
- **gevuld** is uitgevoerd, **open** is nog niet uitgevoerd;
- waterspanningsmeting heeft in geen van de bekeken legenda's een eigen
  symbool; die blijkt alleen uit de code bij het punt (de letter P);
- een cirkel om de driehoek is bij één bureau al in gebruik voor een ander
  type proef en is daarom vermeden;
- een boring is een cirkel (gevuld is uitgevoerd, open is nog niet
  uitgevoerd).

Bekeken legenda's:

- "Legenda Terreinproeven en Grondsoorten" bij een bestemmingsplan (2010):
  <https://ruimtelijkeplannen.nl/documents/NL.IMRO.0282.BpBeDeGeest2011-VSG1/tb_NL.IMRO.0282.BpBeDeGeest2011-VSG1_35.pdf>
- "Legenda terreinproeven" bij een aanbesteding (2020):
  <https://www.tenderned.nl/papi/tenderned-rs-tns/v2/publicaties/245239/documenten/7404148/content>
- "Legenda tekeningen en verklaring afkortingen" bij een bestemmingsplan:
  <https://ruimtelijkeplannen.nl/documents/NL.IMRO.0867.PBSCJBoschstrNst2-VA01/b_NL.IMRO.0867.PBSCJBoschstrNst2-VA01_tb11.pdf>

## Keuze

| Soort                                       | Symbool                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| Sondering zonder kleefmeting                | driehoek, punt omlaag                                |
| Sondering met kleefmeting                   | driehoek met streepje onder de punt                  |
| Sondering met waterspanningsmeting          | driehoek met ringetje onder de punt                  |
| Sondering met kleef- en waterspanningsmeting | driehoek met streepje en daaronder een ringetje      |
| Boring                                      | cirkel met middenstip                                |

De eerste twee volgen de gangbare praktijk. Het **ringetje** voor
waterspanning is een eigen keuze, omdat de praktijk daar geen symbool voor
heeft: het is klein, zit op dezelfde plek als het streepje en laat zich
ermee combineren, zodat de vier soorten onderling goed te onderscheiden
blijven, ook klein en in zwart-wit. De legenda op de tekening verklaart elk
symbool dat voorkomt.

Gevuld is uitgevoerd (sonderingen uit een bestand), open is gepland (los
geplaatst of in een raster). Boringen houden hun bestaande symbool.

## Waar de soort vandaan komt

- Sondering uit een bestand: afgeleid uit de data. Zijn er waarden voor de
  plaatselijke wrijving (fs), dan is er kleefmeting; zijn er waarden voor de
  waterspanning (u2), dan is er waterspanningsmeting.
- Geplande sondering of raster: de gebruiker kiest de soort in het lint bij
  het plaatsen en kan die later wijzigen in het eigenschappenpaneel.
- Oudere tekeningen zonder soort: de bestaande kleefvlag bepaalt de soort
  (aan = met kleefmeting, uit = zonder), zodat de tekening er hetzelfde
  uitziet als voorheen. De kleefvlag wordt nog steeds mee opgeslagen.

## Opmaak

Alle symbolen hebben één lijndikte en één inktkleur; geselecteerde objecten
krijgen de accentkleur van de ingestelde huisstijl. Kleuren en lijndiktes
staan als attribuut in de SVG en niet in de stylesheet, omdat de PDF-export
de symbolen los van de stylesheet rastert.
