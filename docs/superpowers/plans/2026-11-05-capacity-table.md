# Draagvermogentabel Implementation Plan

> Uitvoering: superpowers:executing-plans, per taak met regressiecontrole.

**Goal:** Draagvermogen per sondering en puntniveau vergelijken en direct openen.
**Architecture:** Optionele tabelconfiguratie in PileInput; pure matrixfunctie
met computePile; React-tabel in het bestaande axiale werkblad.
**Tech Stack:** TypeScript, React, Zustand, Vitest, OpenAEC Blueprint.
**Spec:** docs/superpowers/specs/2026-11-05-capacity-table.md

## Randvoorwaarden en review

- Geen wijziging van de rekenformules of conceptstatus.
- Geen verborgen wijziging van bodemlagen bij variërende puntniveaus.
- Oude invoer zonder tabelconfiguratie blijft bruikbaar.
- Niet-bestaande sonderingen en ongeldige niveaus geven expliciete fouten.
- Klikken gebruikt exact dezelfde invoer als de betreffende tabelcel.

## Taken

- [x] Pure tabelberekening en invoerafleiding met tests voor twee CPT's,
  meerdere puntniveaus, ontbrekende CPT's, invaliditeit en onveranderde broninvoer.
- [x] Tabelweergave en puntniveau-/CPT-keuzen met tests voor doorklikken,
  terugkeren en bewaren; bestaande volledige invoer hergebruiken.
- [x] MCP-patchvalidatie en documentatie voor tabelconfiguratie.
- [x] Gerichte tests, volledige suite en build; onafhankelijke review.
- [ ] PR en bijgewerkte installer.

## Verificatie

- 609 tests in 77 bestanden geslaagd; TypeScript en productiebuild geslaagd.
- Onafhankelijke review zonder belangrijke bevindingen.
- Opslag/heropenen bewaart de optionele tabelconfiguratie.
- Bij profielonderkant boven de paalpunt blijft de rekenkern gelijk;
  een aanvullende zichtbare tabelmelding benoemt ontbrekende schachtlagen.
