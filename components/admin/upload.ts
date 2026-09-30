'use client';

import { countPdfPages } from '@/lib/pdf-client';
import type { UploadedDoc } from '@/lib/types';

/** Au-delà, Vercel refuse la requête : il faut l'envoi direct vers Blob. */
const SERVER_LIMIT = 4 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

function safeName(name: string) {
  const base = name
    .replace(/\.pdf$/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${base || 'document'}.pdf`;
}

const mo = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace('.', ',');

/**
 * Envoie un PDF.
 * - Jusqu'à 4 Mo : via le serveur du site (fonctionne avec toutes les configurations Vercel Blob).
 * - Au-delà : envoi direct vers Vercel Blob, possible seulement si BLOB_READ_WRITE_TOKEN existe.
 */
export async function uploadPdf(
  file: File,
  directUploadAvailable: boolean,
  knownPageCount?: number
): Promise<UploadedDoc> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    throw new Error('Choisis un fichier PDF.');
  }
  const pageCount = knownPageCount ?? (await countPdfPages(file));

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (file.size <= SERVER_LIMIT) {
      const fd = new FormData();
      fd.append('file', new File([file], safeName(file.name), { type: 'application/pdf' }));
      const res = await fetch('/api/upload', { method: 'POST', body: fd, signal: controller.signal });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Échec de l’envoi (erreur ${res.status}).`);
      return { url: json.url, access: json.access, name: file.name, pageCount };
    }

    if (!directUploadAvailable) {
      throw new Error(
        `Ce PDF pèse ${mo(file.size)} Mo : la limite est de 4 Mo. Compresse-le (par exemple sur ilovepdf.com → Compresser) ou découpe-le en plusieurs fichiers.`
      );
    }
    const { upload } = await import('@vercel/blob/client');
    const blob = await upload(`cahiers/${safeName(file.name)}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob',
      contentType: 'application/pdf',
      abortSignal: controller.signal,
    });
    return { url: blob.url, access: 'public', name: file.name, pageCount };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new Error('L’envoi a pris trop de temps. Vérifie ta connexion puis réessaie.');
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}
