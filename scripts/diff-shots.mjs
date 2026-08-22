// Compare deux dossiers de captures PNG pixel par pixel.
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const [dirA, dirB] = process.argv.slice(2);
const files = readdirSync(dirA).filter((f) => f.endsWith('.png'));
let worst = 0;
for (const f of files) {
  const a = await loadImage(path.join(dirA, f));
  const b = await loadImage(path.join(dirB, f));
  const ca = createCanvas(a.width, a.height);
  const cb = createCanvas(b.width, b.height);
  ca.getContext('2d').drawImage(a, 0, 0);
  cb.getContext('2d').drawImage(b, 0, 0);
  if (a.width !== b.width || a.height !== b.height) { console.log(`${f}: TAILLE DIFFÉRENTE`); continue; }
  const da = ca.getContext('2d').getImageData(0, 0, a.width, a.height).data;
  const db = cb.getContext('2d').getImageData(0, 0, b.width, b.height).data;
  let diff = 0;
  let maxDelta = 0;
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.max(
      Math.abs(da[i] - db[i]),
      Math.abs(da[i + 1] - db[i + 1]),
      Math.abs(da[i + 2] - db[i + 2]),
    );
    if (d > 8) diff++;
    if (d > maxDelta) maxDelta = d;
  }
  const pct = (diff / (da.length / 4) * 100);
  worst = Math.max(worst, pct);
  console.log(`${f.padEnd(16)} pixels différents: ${diff.toString().padStart(7)} (${pct.toFixed(3)}%)  delta max: ${maxDelta}`);
}
console.log(`pire cas: ${worst.toFixed(3)}%`);
