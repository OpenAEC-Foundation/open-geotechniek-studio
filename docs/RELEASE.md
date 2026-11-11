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
