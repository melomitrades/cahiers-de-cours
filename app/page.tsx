import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getNotebooks, getSiteName } from '@/lib/data';
import { hasDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  if (!hasDatabase()) return <SetupNeeded />;

  const [siteName, notebooks] = await Promise.all([getSiteName(), getNotebooks()]);

  return (
    <main className="home">
      <header className="home-header">
        <h1>{siteName}</h1>
        <p>Choisis ta classe pour ouvrir ton cahier.</p>
      </header>

      <nav className="class-grid" aria-label="Classes">
        {notebooks.map((nb) => (
          <Link
            key={nb.id}
            href={`/cahier/${nb.slug}`}
            className="class-card"
            style={{ '--accent': nb.color } as CSSProperties}
          >
            <span className="class-card-label">{nb.label}</span>
            <span className="class-card-title">{nb.title}</span>
            <span className="class-card-cta">Ouvrir le cahier →</span>
          </Link>
        ))}
      </nav>

      <footer className="home-footer">
        <Link href="/admin">Espace enseignant</Link>
      </footer>
    </main>
  );
}

function SetupNeeded() {
  return (
    <main className="home">
      <header className="home-header">
        <h1>Presque prêt !</h1>
        <p>
          La base de données n’est pas encore reliée. Ajoute la variable <code>DATABASE_URL</code>{' '}
          (Neon) puis redéploie le site. Le fichier README explique chaque étape.
        </p>
      </header>
    </main>
  );
}
