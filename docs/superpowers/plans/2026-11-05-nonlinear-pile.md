# Niet-lineaire paalmodule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for independent tasks.

**Goal:** Schakelbare niet-lineaire grondveren met Georgiadis-laagcorrectie en 3D-inspectie.
**Architecture:** Gemeenschappelijk veercontract, onafhankelijke grondwet en FEM-kern,
afzonderlijke Three.js-weergave. Invoer en MCP valideren dezelfde typen.
**Tech Stack:** TypeScript, React, Three.js, Vitest.
**Spec:** ../specs/2026-11-05-nonlinear-pile-design.md

## Global Constraints

- Bestaande projecten blijven lineair zonder nieuwe analysekeuze.
- Geen specifieke externe productnamen of gespreksgeschiedenis in repositorycontent.
- Hyperbolische projectwet en pu-profielen expliciet als zodanig benoemen.
- Alleen convergente oplossingen; beide paalmodules blijven concept.

## Review Focus

- Niet-convergentie mag geen oude of lineaire uitkomst opleveren.
- Werkpunt en curve moeten dezelfde integratiepuntgegevens gebruiken.
- Eenheden van bedding, lijnreactie en knoopkrachten onderscheiden.
- Selectie en GPU-resources correct opruimen bij project- en weergavewissels.
- Georgiadis is een laagcorrectie, geen onderbouwing van ingevoerde pu-waarden.

## Taken

- [x] Grondwet en equivalente-dieptecorrectie met onafhankelijke tests en bronverantwoording.
- [x] Niet-lineaire FEM-kern met laststappen, lijnzoeken, residu- en evenwichtcontrole.
- [x] Invoer, opslagcompatibiliteit en Studio MCP voor beide analysemodi.
- [x] 3D-weergave, rekenmodel en gesynchroniseerde veerinspectie.
- [x] Gerichte en volledige tests, productiebuild en onafhankelijke review.

## Verificatie en besluiten

- 602 tests in 76 bestanden geslaagd. Productiebuild en TypeScript-controle geslaagd.
- Profielgrenzen en initiële stijfheden worden gecontroleerd tegen het FEM-net;
  equivalente diepten worden opnieuw geverifieerd tegen de gekozen laagcorrectie.
- De getoonde grondreactie wordt direct uit de lokale veerwet bepaald.
  Evenwichtige M/V-reconstructie gebruikt de geïntegreerde elementbelasting.
- Geometrie gebruikt één doorsnedering per diepte; beide elementzijden blijven
  beschikbaar voor diagnostische snedekrachten.
- Camerabereik groeit mee met de uitvergrote vervorming, inclusief de maximale
  weergavevergroting van 1000.
- De oorspronkelijke externe referentiegevallen zijn hierdoor niet automatisch
  geverifieerd. Het gebruikte tanh-profiel is een expliciet projectmodel.
