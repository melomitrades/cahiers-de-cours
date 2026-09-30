'use client';

import type { PDFDocumentProxy } from 'pdfjs-dist';

// On utilise la version « legacy » de pdf.js : elle fonctionne aussi sur les navigateurs
// qui ne sont pas les tout derniers (tablettes, Chromebooks, anciens Safari…).
import type { DocRef, Rect } from './types';

/** Largeur (en pixels) utilisée pour dessiner une page : nette même sur écran Retina. */
export const RENDER_WIDTH = 1400;
export const THUMB_WIDTH = 320;

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJs>).then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
      return m;
    });
  }
  return pdfjsPromise;
}

const documents = new Map<string, Promise<PDFDocumentProxy>>();

function loadPdf(url: string): Promise<PDFDocumentProxy> {
  let p = documents.get(url);
  if (!p) {
    p = pdfjs().then((m) => m.getDocument({ url }).promise);
    documents.set(url, p);
    p.catch(() => documents.delete(url));
  }
  return p;
}

/** Nombre de pages d'un fichier PDF choisi par l'utilisateur. */
export async function countPdfPages(file: File): Promise<number> {
  const m = await pdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const task = m.getDocument({ data });
  const doc = await task.promise;
  const n = doc.numPages;
  // Libère la mémoire (sans bloquer si la méthode n'existe pas selon la version de pdf.js).
  try {
    (task as unknown as { destroy?: () => Promise<void> }).destroy?.()?.catch(() => {});
  } catch {}
  return n;
}

// Les rendus sont faits deux par deux pour ne pas saturer la mémoire.
const MAX_CONCURRENT = 2;
let running = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function renderToCanvas(ref: DocRef, width: number): Promise<HTMLCanvasElement> {
  const doc = await loadPdf(ref.url);
  const pageNumber = Math.min(Math.max(1, ref.page), doc.numPages);
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // `canvas` est le paramètre des versions récentes, `canvasContext` celui des anciennes.
  await page.render({ canvas, canvasContext: ctx, viewport } as Parameters<typeof page.render>[0])
    .promise;
  (page as unknown as { cleanup?: () => void }).cleanup?.();
  return canvas;
}

function canvasToUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error('Rendu impossible'));
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

const pending = new Map<string, Promise<string>>();
const ready = new Map<string, string>();

function remember(key: string, make: () => Promise<string>): Promise<string> {
  const known = ready.get(key);
  if (known) return Promise.resolve(known);
  let p = pending.get(key);
  if (!p) {
    p = make().then((u) => {
      ready.set(key, u);
      return u;
    });
    pending.set(key, p);
    p.catch(() => pending.delete(key));
  }
  return p;
}

const pageKey = (ref: DocRef, width: number) => `${ref.url}#${ref.page}@${width}`;
const cropKey = (ref: DocRef, r: Rect) =>
  `${ref.url}#${ref.page}|${r.x.toFixed(4)},${r.y.toFixed(4)},${r.w.toFixed(4)},${r.h.toFixed(4)}`;

export function peekPageImage(ref: DocRef, width = RENDER_WIDTH): string | null {
  return ready.get(pageKey(ref, width)) ?? null;
}

/** Image (URL locale) d'une page de PDF. Mise en cache. */
export function getPageImage(ref: DocRef, width = RENDER_WIDTH): Promise<string> {
  return remember(pageKey(ref, width), () =>
    limited(async () => {
      const canvas = await renderToCanvas(ref, width);
      const url = await canvasToUrl(canvas);
      canvas.width = canvas.height = 0; // libère la mémoire
      return url;
    })
  );
}

export function peekCrop(ref: DocRef, rect: Rect): string | null {
  return ready.get(cropKey(ref, rect)) ?? null;
}

/**
 * Découpe plusieurs zones (les rabats) dans une page de PDF.
 * La page n'est dessinée qu'une fois pour toutes les zones.
 */
export async function getCrops<T extends Rect & { id: number }>(
  ref: DocRef,
  rects: T[]
): Promise<Record<number, string>> {
  const out: Record<number, string> = {};
  const missing = rects.filter((r) => {
    const u = ready.get(cropKey(ref, r));
    if (u) out[r.id] = u;
    return !u;
  });
  if (!missing.length) return out;

  let canvasPromise: Promise<HTMLCanvasElement> | null = null;
  const source = () => (canvasPromise ??= limited(() => renderToCanvas(ref, RENDER_WIDTH)));

  const urls = await Promise.all(
    missing.map((r) =>
      remember(cropKey(ref, r), async () => {
        const src = await source();
        const sx = Math.round(r.x * src.width);
        const sy = Math.round(r.y * src.height);
        const sw = Math.max(1, Math.round(r.w * src.width));
        const sh = Math.max(1, Math.round(r.h * src.height));
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        c.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
        const u = await canvasToUrl(c);
        c.width = c.height = 0;
        return u;
      })
    )
  );
  missing.forEach((r, i) => (out[r.id] = urls[i]));
  return out;
}
