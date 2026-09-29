import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { logout } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div className="admin">
      <header className="admin-bar">
        <Link href="/admin" className="admin-brand">
          Espace enseignant
        </Link>
        <nav>
          <Link href="/" target="_blank">
            Voir le site ↗
          </Link>
          <form action={logout}>
            <button className="link-btn">Se déconnecter</button>
          </form>
        </nav>
      </header>
      <div className="admin-content">{children}</div>
    </div>
  );
}
