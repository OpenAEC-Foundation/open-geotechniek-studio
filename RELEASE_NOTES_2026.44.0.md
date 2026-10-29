# Open Geotechniek Studio — 2026.44.0

Lokale ontwikkelversie, voorbereid op 29 oktober 2026. Nog geen getagde, ondertekende release.

## Wijzigingen

- Versies gelijkgetrokken volgens Blueprint: ISO-jaar.week.volgnummer. `scripts/version.py --next` zet het volgende nummer; `--check` bewaakt npm, lockfiles, Cargo, Tauri en Snap. De zichtbare versievelden volgen het manifest.
- Blueprint 0.4-kleuren en lokale fonts vastgelegd op commit `6c9c8967b4025befa808aa4998bfbae03cc27025`, met controlesommen en licenties. Vijf thema’s; oude Forge/OpenAEC/Contrast-voorkeuren worden omgezet.
- Schil met witte themapanelen, actieve tab met onderstreping en compacte lintgroepen. Zettingswerkblad met één verkenner en invoer/resultaten naast elkaar; op kleine breedtes stapelen de kolommen.
- Alleen de nieuwe zettingsmodule is beschikbaar in desktop/dev. Andere experimentele berekeningen staan niet in de keuzelijst; hun broncode en opgeslagen projectgegevens worden niet verwijderd. De publieke webrelease bevat geen berekeningen.
- Conceptberekening voor één homogene laag: `s = H Δσ′ / M`. Eenheden en tussenstappen expliciet; invoervalidatie; controlevoorbeeld van 20 mm. Geen kruip, tijdsverloop of normtoets.
- Frontend-dependencies bijgewerkt binnen de bestaande versieranges; PDF.js naar 6.x met de bijbehorende `getDocument({url})`-aanroep.

## Signing: gereed voor credentials, nog niet uitgevoerd op releasebestanden

Repository- en beschikbare organisatie-secretnamen zijn gecontroleerd. Azure-, Apple- en OpenPGP-credentials zijn niet aan deze repository beschikbaar. Er zijn geen private sleutels aangemaakt voor productie en er zijn geen releases gepubliceerd.

| Platform | Vereiste GitHub secrets / variables | Controle |
| --- | --- | --- |
| Windows | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME` | Authenticode + timestamp op NSIS, geïnstalleerde app en uninstaller |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_CONTENT`, `APPLE_TEAM_ID` | Developer ID, `codesign`, `spctl`, `stapler`, beide architecturen in de app uit de DMG |
| Linux | Secrets `OPENAEC_GPG_PRIVATE_KEY`, optioneel `OPENAEC_GPG_PASSPHRASE`; variable `OPENAEC_GPG_FINGERPRINT` | Losse OpenPGP-signaturen op deb/AppImage en Linux-checksums, plus provenance-attestatie |

De workflow publiceert uitsluitend als alle platformjobs slagen. Windows en macOS vereisen hun eigen CI-runners; de Linux-machine hier kan hun native installers niet verifiëren. `scripts/test-release.py` test Linux-signing met een tijdelijke sleutel en testbestanden, inclusief afwijzing van gewijzigde inhoud en ontbrekende sleutels. Dat is geen productiehandtekening.

De releaseworkflow gebruikt `crates-warehouse` commit `6e8738c075719e2fc8fcf918d969406f98927b07` als sibling dependency.

## Controles

- Frontend: 161 tests geslaagd (19 bestanden).
- Productiewebbuild geslaagd.
- Dependency-audit na de updates: 0 bekende kwetsbaarheden.
- Blueprint-hashes en versievelden gecontroleerd.
- Drie release-/signingtests geslaagd; echte release-signing is nog niet uitgevoerd.
- Browser: controlevoorbeeld 20 mm, verdubbelde spanning 40 mm, nulmodulus afgewezen; licht en donker visueel gecontroleerd.

## Openstaande issues gecontroleerd

Dit is een triage van de openstaande meldingen, geen verklaring dat alle gemelde fouten in deze sessie zijn gereproduceerd of opgelost. Geen issues gesloten.

| Issue | Bevinding / vervolg |
| --- | --- |
| [#16](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/16) Versienummer | Lokaal verwerkt; tag en ondertekende release moeten nog volgen. |
| [#15](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/15) Ecosystem readiness | UI-versies en signingworkflow aangepakt. Signingbewijs ontbreekt; DLL/API/MCP/AWS niet als voltooid aangemerkt. |
| [#14](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/14) Gebruikersonderzoek | Parserdiagnostiek, validatierapport en onafhankelijke verificatie van de paalberekening blijven vervolgwerk. |
| [#5](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/5) Situatietekening | Adres-synchronisatie, schaal en PDF-export blijven functioneel na te lopen. |
| [#4](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/4) Rapportpaginering | Niet gewijzigd in deze sessie. |
| [#3](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/3) Eigen importers | API/plugin-documentatie en modgru-import zijn vervolgwerk. |
| [#2](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/2) Annotatiediepte | Per-CPT-annotaties moeten afzonderlijk worden gereproduceerd. |
| [#1](https://github.com/OpenAEC-Foundation/open-geotechniek-studio/issues/1) Wit scherm bij berekeningen | De nieuwe zettingsmodule werkt in de lokale browserpreview. Bestaande experimentele modules zijn uit het register gehaald; dit bewijst geen reparatie van hun eigen code. |

Aanvullend: de browserpreview toont op Home nog een ontbrekende Tauri-invoke bij grondopbouw; de desktopuitvoering heeft die runtime wel. De berekeningenweergave is hiervan onafhankelijk. De README noemt MIT, maar een root-LICENSE ontbreekt in de aangeleverde repository; licentietekst nog te bevestigen.
