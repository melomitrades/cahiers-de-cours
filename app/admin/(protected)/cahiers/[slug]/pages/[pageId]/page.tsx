import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageEditor from '@/components/admin/PageEditor';
import { getNotebookBySlug, getPages } from '@/lib/data';
import { canUploadLargeFiles } from '@/lib/storage';

export default async function PageAdmin({
  params,
}: {
  params: Promise<{ slug: string; pageId: string }>;
}) {
  const { slug, pageId } = await params;
  const notebook = await getNotebookBySlug(slug);
  if (!notebook) notFound();
  const pages = await getPages(notebook.id);
  const index = pages.findIndex((p) => p.id === Number(pageId));
  if (index < 0) notFound();
  const page = pages[index];

  return (
    <>
      <p className="crumbs">
        <Link href="/admin">Mes cahiers</Link> /{' '}
        <Link href={`/admin/cahiers/${notebook.slug}`}>{notebook.label}</Link> / Page {page.number}
      </p>
      <PageEditor
        key={page.id}
        notebook={notebook}
        page={page}
        total={pages.length}
        prevId={pages[index - 1]?.id ?? null}
        nextId={pages[index + 1]?.id ?? null}
        useBlob={canUploadLargeFiles()}
      />
    </>
  );
}
