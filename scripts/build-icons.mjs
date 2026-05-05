import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcSvg = readFileSync(join(root, 'build', 'icon.svg'), 'utf8');
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });

const sizes = [16, 32, 48, 64, 128, 256, 512];
const pngBuffers = {};

console.log('Generating PNG icons from build/icon.svg...');
for (const size of sizes) {
  const resvg = new Resvg(srcSvg, { fitTo: { mode: 'width', value: size } });
  const buf = resvg.render().asPng();
  const outPath = join(buildDir, `icon-${size}.png`);
  writeFileSync(outPath, buf);
  pngBuffers[size] = buf;
  console.log(`  ✓ icon-${size}.png`);
}

writeFileSync(join(buildDir, 'icon.png'), pngBuffers[512]);
console.log('  ✓ icon.png (512×512, main Linux/electron-builder icon)');

const icoBuffer = await pngToIco([16, 32, 48, 256].map((s) => pngBuffers[s]));
writeFileSync(join(buildDir, 'icon.ico'), icoBuffer);
console.log('  ✓ icon.ico (16/32/48/256px, Windows)');

console.log('\nDone. Files written to build/');
