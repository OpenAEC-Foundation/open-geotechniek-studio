import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.argv[2];
const files=fs.readdirSync(root).filter(name=>fs.statSync(path.join(root,name)).isFile()&&!name.startsWith('SHA256SUMS')&&!name.endsWith('.asc')).sort();
if(!files.length)throw new Error('No artifacts to checksum');
fs.writeFileSync(path.join(root,'SHA256SUMS.txt'),files.map(name=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')}  ${name}\n`).join(''));
