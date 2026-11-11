# Horizontale paalbelasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Zelfstandige controleerbare module voor horizontale paalbelasting.

**Architecture:** Zuivere TypeScript-rekenfuncties voor ligger, bedding en
doorsnede. De bestaande berekeningsinterface verzorgt opslag en panelen.

**Tech Stack:** TypeScript, React, Zustand, Vitest.

**Spec:** ../specs/2026-11-05-horizontal-pile-design.md

## Global Constraints

- Conceptstatus; geen automatische volledige normgoedkeuring.
- Alleen generieke bronlabels; geen externe productnamen in repositorycontent.
- Brondocumenten blijven buiten de repository.
- Expliciete eenheden, broneditie en modelbeperkingen.

## Review Focus

- Grondloze vrije paal: instabiel model afwijzen.
- Laaggrenzen en vrije paallengte: bedding alleen waar opgegeven.
- Netto gronddruk versus maaiveldbelasting: geen stilzwijgende omzetting.
- Materiaalwissel: geometrie, EI en doorsnedetoets blijven consistent.
- Incompleet geverifieerde bron: geen geslaagde verificatiestatus.

## Taken

- [x] Onafhankelijke solverproeven voor kopkracht, kopmoment en verdeelde last;
  fouten voor ongeldige geometrie, instabiliteit en niet-eindige invoer.
- [x] Consistente ligger-/beddingsmatrices, lastvectoren, reacties en evenwicht.
- [x] Broncontrole CUR166-bedding en laag/hoog scenario, met toepassingsgrenzen.
- [x] Materiaalafhankelijke doorsnedestijfheid en expliciete aannames.
- [x] Doorsnedetoets N–M op basis van vastgelegde materiaal- en normkeuze.
- [x] Zelfstandige experimentele module, panelen, schema en grafieken.
- [x] Referentie-inventarisatie van 50 onafhankelijke externe cases waar
  beschikbaar; ontbrekende data en niet-gehaalde aantallen expliciet rapporteren.
- [x] Gerichte tests, typecontrole, productiebuild en onafhankelijke review.

## Verificatie

- 571 frontendtests in 72 bestanden geslaagd; typecontrole en productiebuild geslaagd.
- Native `cargo check --locked --offline` geslaagd; bestaande waarschuwingen.
- Onafhankelijke mechanische controles omvatten een grondloze uitkraging,
  kopmoment, verdeelde last, grondondersteuning, laaggrenzen, evenwicht,
  analytische N–M-doorsnedepunten en een momentextremum tussen plotpunten.
- 50 bronberekeningen geselecteerd: 10 numeriek gedocumenteerde voorbeelden
  en 40 expliciet gepubliceerde parametergevallen uit één studie, niet
  40 afzonderlijke projecten. Vier bron-PDF's gecontroleerd.
- Externe solververgelijkingen: nog nul als geslaagd geclaimd.
