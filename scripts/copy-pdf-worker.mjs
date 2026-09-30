// Copie le "worker" de pdf.js dans /public pour qu'il soit servi tel quel par le site.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
try {
  const pkgDir = dirname(require.resolve('pdfjs-dist/package.json'));
  const candidates = ['legacy/build/pdf.worker.min.mjs', 'legacy/build/pdf.worker.mjs'];
  const src = candidates.map((c) => join(pkgDir, c)).find((p) => existsSync(p));
  if (!src) throw new Error('worker pdf.js introuvable');
  mkdirSync('public', { recursive: true });
  copyFileSync(src, 'public/pdf.worker.min.mjs');
  console.log('[pdf.js] worker copié dans public/pdf.worker.min.mjs');
} catch (e) {
  console.warn('[pdf.js] impossible de copier le worker :', e.message);
}
