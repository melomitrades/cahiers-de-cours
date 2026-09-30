import 'server-only';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '.local-uploads');
export const LOCAL_URL_PREFIX = '/api/local-file/';

export type BlobAccess = 'public' | 'private';

/**
 * Vercel Blob est-il disponible ?
 * - soit via la clé BLOB_READ_WRITE_TOKEN (ancienne méthode),
 * - soit via la connexion automatique de Vercel (BLOB_STORE_ID + OIDC).
 */
export function usesBlob() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.VERCEL
  );
}

/** Le téléversement direct navigateur → Blob (gros fichiers) nécessite la clé classique. */
export function canUploadLargeFiles() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isAllowedDocUrl(url: string) {
  return url.startsWith('https://') || url.startsWith(LOCAL_URL_PREFIX);
}

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

/** Enregistre un PDF (Vercel Blob en ligne, dossier local en développement). */
export async function storePdf(file: File): Promise<{ url: string; access: BlobAccess }> {
  if (!usesBlob()) {
    const name = `${randomBytes(8).toString('hex')}.pdf`;
    await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await writeFile(path.join(LOCAL_UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
    return { url: `${LOCAL_URL_PREFIX}${name}`, access: 'public' };
  }

  const { put } = await import('@vercel/blob');
  const pathname = `cahiers/${safeName(file.name)}`;
  const options = { addRandomSuffix: true, contentType: 'application/pdf' } as const;
  try {
    const r = await put(pathname, file, { ...options, access: 'public' });
    return { url: r.url, access: 'public' };
  } catch (e) {
    // Les stocks Blob « privés » refusent l'accès public : on réessaie en privé.
    const msg = e instanceof Error ? e.message : String(e);
    if (/private/i.test(msg)) {
      const r = await put(pathname, file, { ...options, access: 'private' });
      return { url: r.url, access: 'private' };
    }
    throw e;
  }
}

/** Lit un PDF stocké sur Vercel Blob (public ou privé). */
export async function readPdf(url: string, access: BlobAccess): Promise<ReadableStream<Uint8Array> | null> {
  if (access === 'public') {
    const res = await fetch(url);
    if (res.ok && res.body) return res.body;
  }
  const { get } = await import('@vercel/blob');
  const r = await get(url, { access });
  return r && r.statusCode === 200 ? r.stream : null;
}

/** Supprime des fichiers qui ne sont plus utilisés (Vercel Blob ou dossier local). */
export async function deleteStoredFiles(urls: string[]) {
  const remote = urls.filter((u) => u.startsWith('https://'));
  const local = urls.filter((u) => u.startsWith(LOCAL_URL_PREFIX));

  if (remote.length && usesBlob()) {
    try {
      const { del } = await import('@vercel/blob');
      await del(remote);
    } catch (e) {
      console.warn('Suppression Blob impossible :', e);
    }
  }
  for (const u of local) {
    const name = path.basename(u.slice(LOCAL_URL_PREFIX.length));
    await unlink(path.join(LOCAL_UPLOAD_DIR, name)).catch(() => {});
  }
}
