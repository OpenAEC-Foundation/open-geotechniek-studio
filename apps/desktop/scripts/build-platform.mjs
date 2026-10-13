import { spawnSync } from 'node:child_process';
import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { ...process.env, VITE_PLATFORM: '1', VITE_PUBLIC_WEB: '0' };
const extraArgs = process.argv.slice(2);
for (const [script, args] of [
  ['typescript/bin/tsc', []],
  ['vite/bin/vite.js', ['build', '--outDir', 'dist-platform', '--base', './', ...extraArgs]],
]) {
  const result = spawnSync(process.execPath, [resolve(root, 'node_modules', script), ...args], { cwd: root, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
copyFileSync(resolve(root, '../../LICENSE'), resolve(root, 'dist-platform/LICENSE'));
copyFileSync(resolve(root, '../../docs/PLATFORM.md'), resolve(root, 'dist-platform/PLATFORM.md'));
