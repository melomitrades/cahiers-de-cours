import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Flipbook from '@/components/Flipbook';
import { getNotebookBySlug, getPages, toViewPages } from '@/lib/data';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const nb = await getNotebookBySlug(slug);
  return { title: nb ? `${nb.label} – ${nb.title}` : 'Cahier introuvable' };
}

export default async function NotebookPage({ params }: Params) {
  const { slug } = await params;
  const notebook = await getNotebookBySlug(slug);
  if (!notebook) notFound();
  const pages = toViewPages(await getPages(notebook.id), notebook.manipulable);
  return <Flipbook notebook={notebook} pages={pages} />;
}
