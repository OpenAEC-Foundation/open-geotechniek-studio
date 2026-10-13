# Open Geotechniek Studio 0.4.2

## Projecten en kaart

- Projecten met lokaal geïmporteerde GEF-sonderingen openen weer correct, ook wanneer de projectheader achter de meetgegevens staat.
- Projectbestanden worden gecontroleerd op ongeldige metadata, meetwaarden en dubbele object-ID's. Bestaande tekeninggegevens blijven behouden bij direct heropslaan.
- GEF-BORE-bestanden kunnen als boring worden geopend of aan een project worden toegevoegd.
- Kaartlagen, transparantie, historische kaartselectie en de lege kaartweergave blijven behouden bij tabwissels.
- Meerdere geselecteerde BRO-objecten kunnen in één actie worden toegevoegd. Toevoegen houdt de kaart geopend; alleen expliciet openen schakelt naar de viewer.
- Lopende import- en opslagacties kunnen geen gegevens aan een ander project of een vervangende opslagomgeving koppelen.

## Browser en platform

- `npm run build:platform` maakt een zelfstandige bundel voor een subpad, met rekenmodules en zonder automatisch voorbeeldbestand.
- Projecten zijn lokaal te openen en op te slaan. Een optionele hostadapter biedt projectlijst, openen, versies en opslag met versiecontrole; zie [platformcontract](docs/PLATFORM.md).
- Laagdetectie, PDF-preview en PDF-export werken zonder native runtime. Classificatie en grafiekcoördinaten worden getest tegen een reproduceerbare referentie uit de Rust-kern.
- CSV, GeoJSON, GEF, BRO-XML en experimentele IFC/IFCX-uitvoer zijn ook in de browser beschikbaar.
- MIT-licentie toegevoegd en pakketmetadata gelijkgetrokken.

## Reikwijdte

- De opslagadapter is lokaal getest; aansluiting en autorisatie op een concrete Frappe-site blijven verantwoordelijkheid van de hostintegratie.
- Browserrapporten bevatten dezelfde selecteerbare onderdelen en rekengegevens. De indeling van een rapport met meerdere sonderingen is niet pixelidentiek aan de native rapporttemplate.
- IFC/IFCX volgt het bestaande experimentele uitwisselingsmodel en is geen schema-gevalideerde IFC-export. BRO-XML-uitvoer is geen gevalideerd BRO-aanleverbestand.
- De Windows-installer bundelt de WebView2-bootstrapper en de loader-DLL. De bootstrapper heeft internet nodig wanneer de runtime nog ontbreekt.
