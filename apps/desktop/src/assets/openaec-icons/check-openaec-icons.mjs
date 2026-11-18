// Controleert dat de OpenAEC-iconen gelijk zijn aan de vastgelegde Blueprint-versie (OPENAEC-ICONS.json).
// Gemaakt door scripts/iconen_uitrollen.py in OpenAEC-Blueprint; draai in de CI: node <map>/check-openaec-icons.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('./', import.meta.url);
const source = JSON.parse(readFileSync(new URL('OPENAEC-ICONS.json', base), 'utf8'));
let errors = 0;
for (const [file, expected] of Object.entries(source.files)) {
  const actual = createHash('sha256').update(readFileSync(new URL(file, base))).digest('hex');
  if (actual !== expected) { console.error(`OpenAEC-iconen wijken af: ${file}. Kopieer opnieuw uit de Blueprint (scripts/iconen_uitrollen.py kopieer).`); errors++; }
}
if (!/^[0-9a-f]{40}$/.test(source.commit)) { console.error('OPENAEC-ICONS.json heeft geen volledige commit.'); errors++; }
if (errors) process.exit(1);
console.log(`OpenAEC-iconen: Blueprint ${source.commit.slice(0, 8)}, ${Object.keys(source.files).length} bestand(en) gelijk. Licentie: ${source.license}`);
