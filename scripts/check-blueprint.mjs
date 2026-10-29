import fs from 'node:fs';
import crypto from 'node:crypto';
const base = new URL('../apps/desktop/src/styles/blueprint/', import.meta.url);
const source = JSON.parse(fs.readFileSync(new URL('SOURCE.json',base)));
for (const [name, expected] of Object.entries(source.files)) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(new URL(name,base))).digest('hex');
  if (actual !== expected) throw new Error(`Blueprint asset changed: ${name}`);
}
console.log(`Blueprint assets verified: ${source.commit}`);
