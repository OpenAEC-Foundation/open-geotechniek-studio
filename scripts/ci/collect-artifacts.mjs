import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = process.argv[2];
if (!root) throw new Error('Pass the Tauri bundle directory');
const out = path.resolve('../../release-artifacts');
fs.mkdirSync(out, {recursive:true});
function visit(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir,e.name);
    if (e.isDirectory()) visit(p);
    else if (/\.(exe|dmg|deb|AppImage)$/.test(e.name)) fs.copyFileSync(p,path.join(out,e.name));
  }
}
visit(root);
const files=fs.readdirSync(out).filter(n=>/\.(exe|dmg|deb|AppImage)$/.test(n)).sort();
if (!files.length) throw new Error('No installers collected');
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),files.map(n=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(out,n))).digest('hex')}  ${n}\n`).join(''));
