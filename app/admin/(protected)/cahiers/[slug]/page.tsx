import Link from 'next/link';
import { notFound } from 'next/navigation';
import PagesManager from '@/components/admin/PagesManager';
import { getNotebookBySlug, getPages } from '@/lib/data';
import { canUploadLargeFiles } from '@/lib/storage';

export default async function NotebookAdmin({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const notebook = await getNotebookBySlug(slug);
  if (!notebook) notFound();
  const pages = await getPages(notebook.id);
  return (
    <>
      <p className="crumbs">
        <Link href="/admin">Mes cahiers</Link> / {notebook.label}
      </p>
      <PagesManager notebook={notebook} pages={pages} useBlob={canUploadLargeFiles()} />
    </>
  );
}
