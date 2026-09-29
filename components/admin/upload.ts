'use client';

import { upload } from '@vercel/blob/client';
import { countPdfPages } from '@/lib/pdf-client';
import type { UploadedDoc } from '@/lib/types';

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

/** Envoie un PDF vers Vercel Blob (ou le dossier local en développement). */
export async function uploadPdf(
  file: File,
  useBlob: boolean,
  knownPageCount?: number
): Promise<UploadedDoc> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    throw new Error('Choisis un fichier PDF.');
  }
  const pageCount = knownPageCount ?? (await countPdfPages(file));
  let url: string;
  if (useBlob) {
    const blob = await upload(`cahiers/${safeName(file.name)}`, file, {
      access: 'public',
      handleUploadUrl: '/api/blob',
      contentType: 'application/pdf',
    });
    url = blob.url;
  } else {
    const fd = new FormData();
    fd.append('file', new File([file], safeName(file.name), { type: 'application/pdf' }));
    const res = await fetch('/api/local-upload', { method: 'POST', body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Échec de l’envoi du fichier.');
    url = json.url;
  }
  return { url, name: file.name, pageCount };
}
