# Release
De productversie volgt Blueprint: `JJJJ.W.N` (ISO-jaar, week, volgnummer). Bijvoorbeeld `2026.44.0`. Het Windows-pakket gebruikt NSIS; er wordt geen MSI met een ongeldige hoofdversie `2026` gebouwd.

```bash
python3 scripts/version.py --next        # volgende versie voor deze ISO-week
python3 scripts/version.py --check       # npm, lockfiles, Cargo, Tauri en Snap
node scripts/check-blueprint.mjs         # oorspronkelijke design-assets
python3 scripts/test-release.py          # versies en OpenPGP met tijdelijke testsleutel
```

Na controle en commit hoort bij de versie een tag `vJJJJ.W.N`. De workflow **Signed desktop release** bouwt Windows (NSIS), macOS (universele DMG) en Linux (deb/AppImage). De publicatiestap draait uitsluitend als alle builds en handtekeningcontroles slagen. Windows gebruikt Authenticode met timestamp, macOS Developer ID met Apple-notarisatie, Linux OpenPGP-signaturen plus build-attestaties. Updater-signing is een afzonderlijk contract en is hiermee niet toegevoegd.

Signing vereist de Azure-, Apple- en OpenPGP-credentials uit [de release-aantekeningen](../RELEASE_NOTES_2026.44.1.md). Deze bestaan in de organisatie; repositorytoegang en echte releaseverificatie staan beschreven in de release-aantekeningen. De lokale build is daarom een ontwikkelbuild zonder releasehandtekening. Het gereedzetten van de workflow is geen bewijs van een ondertekende release.

Ondertekende installers worden via de organisatie-workflow gebouwd. Voor een testbuild vÃ³Ã³r publicatie kan **Signed desktop release** handmatig draaien op een branch, met `candidate=true` en het versienummer uit `apps/desktop/package.json`:

```bash
gh workflow run release.yml --ref BRANCH -f tag=vJJJJ.W.N -f candidate=true
gh run download RUN_ID -n signed-windows-x64 --dir signed-installers
```

Vervang `BRANCH`, `vJJJJ.W.N` en `RUN_ID` door de gewenste branch, versie en workflowrun. De build gebruikt de vaste commit van die run en de signinggegevens van de organisatie. De artifacts doorlopen dezelfde handtekeningcontroles als een release. Een testbuild maakt geen releasetag en publiceert geen GitHub-release. Installeer voor distributie uitsluitend de gecontroleerde, ondertekende artifacts.

## Snap

De workflow **Build Snap Package** herverpakt de DEB uit een bestaande release.
Na een geslaagde desktoprelease op een versietag start dit automatisch.
Een desktop-kandidaatbuild of dispatch op een branch start geen Snap-publicatie;
gebruik daarvoor een expliciete Snap-dispatch met de gewenste releasetag.
Een Snap-dispatch met `publish=false` maakt alleen een workflow-artifact.

Bij publicatie worden het `.snap`-bestand en het aparte manifest
`SHA256SUMS-snap.txt` met dezelfde OpenAEC-OpenPGP-sleutel als de andere
Linux-pakketten ondertekend en geverifieerd vóór upload. Ontbrekende of
ongeldige signinggegevens stoppen de publicatie. Het desktopmanifest
`SHA256SUMS.txt` en het ondertekende `SHA256SUMS-linux.txt` blijven behouden.
Het Snap-manifest en beide `.asc`-handtekeningen staan naast de Snap in de
GitHub-release. Dit vervangt de winkelassertions van de Snap Store niet.

Controleer na downloaden de sleutel tegen de onafhankelijk bekende OpenAEC-
fingerprint (niet alleen tegen een meegeleverd fingerprintbestand) en voer uit:

```bash
gpg --verify SHA256SUMS-snap.txt.asc SHA256SUMS-snap.txt
sha256sum --check SHA256SUMS-snap.txt
gpg --verify open-geotechniek-studio_JJJJ.W.N_amd64.snap.asc open-geotechniek-studio_JJJJ.W.N_amd64.snap
```

De openbare sleutel en fingerprint staan bij de desktoprelease als
`linux-signing-public-key.asc` en `linux-signing-fingerprint.txt`.
