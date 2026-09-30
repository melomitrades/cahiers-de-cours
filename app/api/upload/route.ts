import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { storePdf } from '@/lib/storage';

export const maxDuration = 60;

// Le navigateur envoie le PDF ici ; le serveur le range dans Vercel Blob.
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Session expirée : reconnecte-toi.' }, { status: 401 });
  }
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !/pdf/i.test(file.type || 'application/pdf')) {
      return NextResponse.json({ error: 'Seuls les fichiers PDF sont acceptés.' }, { status: 400 });
    }
    const stored = await storePdf(file);
    return NextResponse.json(stored);
  } catch (e) {
    console.error('[upload]', e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Le stockage des PDF a échoué : ${msg}` },
      { status: 500 }
    );
  }
}
