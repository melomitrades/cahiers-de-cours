import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { LOCAL_UPLOAD_DIR, LOCAL_URL_PREFIX, usesBlob } from '@/lib/storage';

// Solution de secours pour travailler en local sans Vercel Blob.
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  if (usesBlob() || process.env.VERCEL) {
    return NextResponse.json(
      { error: 'Le stockage Vercel Blob doit être configuré (BLOB_READ_WRITE_TOKEN).' },
      { status: 400 }
    );
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés.' }, { status: 400 });
  }
  const name = `${randomBytes(8).toString('hex')}.pdf`;
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_UPLOAD_DIR, name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `${LOCAL_URL_PREFIX}${name}` });
}
