import { db } from '@/lib/db';
import { LOCAL_URL_PREFIX, readPdf, type BlobAccess } from '@/lib/storage';

// Sert un PDF du cahier. Le contenu d'un document ne change jamais (un nouvel envoi
// crée un nouveau document), il peut donc être mis en cache très longtemps.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await db()`select url, access from documents where id = ${Number(id) || 0}`;
  if (!rows.length) return new Response('Introuvable', { status: 404 });
  const url = rows[0].url as string;
  const access = (rows[0].access as BlobAccess) || 'public';

  if (url.startsWith(LOCAL_URL_PREFIX)) {
    return Response.redirect(new URL(url, req.url), 302);
  }
  try {
    const stream = await readPdf(url, access);
    if (!stream) return new Response('Introuvable', { status: 404 });
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'CDN-Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    console.error('[doc]', e);
    return new Response('Lecture du PDF impossible', { status: 502 });
  }
}
