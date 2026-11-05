# Verificatie rekenkern horizontale paal

`verification.test.ts` vergelijkt de rekenkern (via `computeLateral`, dus
inclusief invoerverwerking en doorsnedestijfheid) met onafhankelijke
referenties. Tabel met werkelijke afwijkingen:

    VERIFY_REPORT=1 npx vitest run verification --silent=false

## Gevallen

| Geval | Situatie | Referentie | Grootste afwijking |
|---|---|---|---|
| V1 | lange paal, vrije kop, kopkracht | Hetényi, half-oneindige ligger | 0,001 % |
| V2 | lange paal, vrije kop, kopmoment | Hetényi, half-oneindige ligger | < 0,0001 % |
| V3 | lange paal, ingeklemde kop | Hetényi, half-oneindige ligger | < 0,0001 % |
| V4 | korte starre paal | evenwicht kracht en moment | 0,001 % |
| V5 | korte buigzame paal, H + M | exacte eindige ligger (homogene oplossing) | < 0,0001 % |
| V6 | ingeklemde paalvoet | exacte eindige ligger | < 0,0001 % |
| V7 | bedding k = nh·z | Matlock & Reese (Zmax ≥ 5) en differentieoplossing | 0,001 % (rekenkern), zie opmerking |
| V8 | twee lagen, slap op stijf | differentieoplossing, 960 intervallen | 0,001 % |
| V9 | niet-lineair, hoge mobilisatie (> 90 %) | differentieoplossing met Newton | 0,002 % |
| V10 | niet-lineair, pu toenemend met bovengrens | differentieoplossing met Newton | 0,004 % |
| V11 | niet-lineair, twee lagen, Georgiadis | differentieoplossing; equivalente diepte zelfstandig afgeleid | < 0,0001 % |

De differentieoplossing is een eigen, onafhankelijke methode (knopen met
spookpunten, Newton-iteratie, Richardson-extrapolatie bij gladde bedding).
Zij is zelf eerst gecontroleerd tegen de exacte eindige ligger.

## Bevindingen

- **Rekenkern:** in alle gevallen gelijk aan de referentie binnen 0,005 %.
  Evenwicht van grondreactie en kopbelasting sluit tot 1e-6 kN.
- **Bedding die met de diepte toeneemt:** de invoer kent per laag een
  constante bedding (maximaal 40 lagen). Een lineair toenemende bedding moet
  dus in lagen worden opgeknipt. De afwijking door dat opknippen is bij
  10 / 20 / 40 lagen circa 10 / 2,9 / 0,7 % in de kopverplaatsing. Dit is een
  beperking van de invoer, niet van de oplossing.
- **Niet geverifieerd:** de N–M-doorsnedetoets, de automatische
  beddingswaarden en het bovenbelastingsmodel. De gepubliceerde gevallen in
  `reference-cases.json` zijn nog niet nagerekend; die vragen grondmodellen
  (p-y-krommen voor klei en zand) die de rekenkern niet heeft.
