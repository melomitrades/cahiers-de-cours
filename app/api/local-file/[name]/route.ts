import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_UPLOAD_DIR } from '@/lib/storage';

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const safe = path.basename(name);
  if (!/^[a-f0-9]+\.pdf$/.test(safe)) return new Response('Introuvable', { status: 404 });
  try {
    const data = await readFile(path.join(LOCAL_UPLOAD_DIR, safe));
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Introuvable', { status: 404 });
  }
}
