import { getNotebooks, getSiteName } from '@/lib/data';
import { NotebookList, SiteNameForm } from '@/components/admin/NotebookSettings';

export default async function AdminHome() {
  const [siteName, notebooks] = await Promise.all([getSiteName(), getNotebooks()]);
  return (
    <>
      <h1>Mes cahiers</h1>
      <SiteNameForm initial={siteName} />
      <NotebookList notebooks={notebooks} />
    </>
  );
}
