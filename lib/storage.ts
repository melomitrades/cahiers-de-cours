import 'server-only';
import { unlink } from 'node:fs/promises';
import path from 'node:path';

export const LOCAL_UPLOAD_DIR = path.join(process.cwd(), '.local-uploads');
export const LOCAL_URL_PREFIX = '/api/local-file/';

export function usesBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function isAllowedDocUrl(url: string) {
  return url.startsWith('https://') || url.startsWith(LOCAL_URL_PREFIX);
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
