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
