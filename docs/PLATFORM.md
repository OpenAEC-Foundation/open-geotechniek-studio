# Ingesloten webbundel

Gebruik Node.js 22 of nieuwer. Bouw vanuit een vastgepinde release-tag of
commit, installeer met `npm ci` in `apps/desktop` en voer `npm run build:platform`
uit. De uitvoer staat in `dist-platform`. De workflow `Build platform bundle`
bouwt de expliciet opgegeven tag of commit; publiceren gebeurt afzonderlijk.

De standaard basis is `./`, bedoeld voor het openen van de eigen `index.html`
onder een subpad, bijvoorbeeld in een iframe. Voor een vaste assetlocatie:

```sh
npm run build:platform -- --base=/assets/open_geotechniek/
```

Serveer de hele uitvoermap en gebruik de bijbehorende indexpagina als
iframe-bron. De vlag `VITE_PLATFORM=1` behoudt rekenmodules, start zonder
voorbeeldbestand en staat los van de beperkte publieke demo. Het platform
verzorgt authenticatie. De tool voegt geen login of eigen backend toe.

## Projectopslag

De tool ondersteunt lokale upload/download en optionele opslag in de site.
De host kan vóór de applicatie wordt geladen in het iframe de volgende
adapter registreren als `window.openGeotechniekStorage`:

```ts
interface PlatformProject {
  id: string;
  name: string;
  version: string;
  updatedAt?: string;
}
interface PlatformStorage {
  version: 1;
  label: string;
  list(): Promise<PlatformProject[]>;
  open(id: string, version?: string): Promise<PlatformProject & {content: string}>;
  save(request: {
    id?: string;
    expectedVersion?: string;
    name: string;
    content: string;
  }): Promise<PlatformProject>;
  versions(id: string): Promise<PlatformProject[]>;
}
```

De inhoud is het volledige UTF-8-projectbestand. Zonder `id` maakt `save` een
nieuw project. Met `id` moet de host de opgegeven `expectedVersion` atomair
controleren en bij verschil weigeren; foutmeldingen worden in de tool getoond.
Autorisatie en toegangscontrole blijven op de site. De adapter gebruikt de
bestaande sessie; tokens horen niet in localStorage of projectbestanden.

Bij registratie na het laden moet de host ook
`window.dispatchEvent(new Event('ogs:storage-adapter-changed'))` uitvoeren.
Registratie gebeurt uitsluitend in het venster van de tool. Er is geen
onbeveiligde cross-origin message-handler. De knop `Projecten op …` biedt
lijst, openen, versies, opslaan als nieuw en nieuwe versie opslaan. Een
historische versie wordt als kopie geopend en overschrijft niet de nieuwste
versie.

De concrete Frappe-endpoints worden door de hostadapter geleverd. Dit
contract en lokale controles vervangen geen integratietest op een actieve
Frappe-site.

## Gelijke rapportuitvoer

De desktopinterface en de ingesloten webbundel gebruiken dezelfde
TypeScript-laagdetectie en PDF-renderer via `platform.ts`. Daardoor zijn
sectiekeuze, pagina-indeling, grafieken en berekende lagen gelijk voor
dezelfde invoer en kaartachtergrond. Alleen openen en opslaan gebruiken
op desktop de native bestandsdialoog. De afzonderlijke Rust-rapport-API
voor REST/MCP behoudt zijn eigen renderer.

`platformParity.test.ts` vergelijkt de volledige PDF-uitvoer van beide
platformpaden, met uitzondering van aanmaakdatum en document-ID. De
controle bevat twee sonderingen en alle acht rapportpagina's, plus
een export met alleen de geselecteerde sonderingspagina's. De
laagdetectie wordt daarnaast met uitvoer uit de Rust-kern vergeleken.

De opslagcontracttests openen een project, voegen een gekoppelde berekening
toe, slaan op en openen opnieuw. Ze controleren ook historische versies,
versieconflicten, ongeldige bestanden en antwoorden van een eerder
vervangen adapter. De host moet versiecontrole atomair uitvoeren en de
bestaande Frappe-sessie en toegangsrechten toepassen; de tool kan die
serververantwoordelijkheden niet overnemen.

## Verificatie

Vanuit `apps/desktop`:

```sh
npm test -- --pool=threads --maxWorkers=2
npm run build:platform
```

De bundel bevat geen lokale projectgegevens of controlebestanden.
Publiceer alleen de nieuw gebouwde `dist-platform`-map. Voor een
inbedding op dezelfde oorsprong kan de host de adapter na het laden
registreren via `iframe.contentWindow.openGeotechniekStorage` en het
hierboven beschreven registratie-event. Geef de host geen toegang
tot projectinhoud die buiten de rechten van de ingelogde gebruiker valt.
