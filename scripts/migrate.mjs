// Crée les tables (si besoin) et les cahiers 6ème / 5ème / 4ème par défaut.
// Lancé automatiquement avant chaque "build" sur Vercel. Sans risque si relancé.
import postgres from 'postgres';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.warn('[migrate] Aucune DATABASE_URL : migration ignorée.');
  process.exit(0);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

try {
  await sql.unsafe(`
    create table if not exists settings (
      key text primary key,
      value text not null
    );

    create table if not exists notebooks (
      id serial primary key,
      slug text not null unique,
      label text not null,
      title text not null default '',
      color text not null default '#3b6fd4',
      position int not null default 0,
      manipulable boolean not null default false,
      created_at timestamptz not null default now()
    );

    create table if not exists documents (
      id serial primary key,
      url text not null,
      name text not null,
      page_count int not null,
      created_at timestamptz not null default now()
    );

    create table if not exists pages (
      id serial primary key,
      notebook_id int not null references notebooks(id) on delete cascade,
      position int not null,
      course_doc_id int references documents(id) on delete set null,
      course_doc_page int,
      pieces_doc_id int references documents(id) on delete set null,
      pieces_doc_page int
    );
    create index if not exists pages_notebook_idx on pages(notebook_id, position);

    create table if not exists zones (
      id serial primary key,
      page_id int not null references pages(id) on delete cascade,
      kind text not null check (kind in ('link', 'flap')),
      x real not null,
      y real not null,
      w real not null,
      h real not null,
      target_page_id int references pages(id) on delete set null,
      hinge text not null default 'left' check (hinge in ('top', 'bottom', 'left', 'right'))
    );
    create index if not exists zones_page_idx on zones(page_id);
  `);

  await sql`insert into settings (key, value) values ('site_name', 'Mes cahiers de cours') on conflict (key) do nothing`;

  const [{ count }] = await sql`select count(*)::int as count from notebooks`;
  if (count === 0) {
    const defaults = [
      { slug: '6eme', label: '6ème', color: '#3b6fd4' },
      { slug: '5eme', label: '5ème', color: '#2f9e6e' },
      { slug: '4eme', label: '4ème', color: '#d9822b' },
    ];
    for (const [i, nb] of defaults.entries()) {
      const [{ id }] = await sql`
        insert into notebooks (slug, label, title, color, position)
        values (${nb.slug}, ${nb.label}, 'Cahier de cours', ${nb.color}, ${i})
        returning id`;
      // Page 1 (couverture) et page 2 (sommaire), vierges au départ.
      await sql`insert into pages (notebook_id, position) values (${id}, 1), (${id}, 2)`;
    }
    console.log('[migrate] Cahiers 6ème, 5ème et 4ème créés.');
  }
  console.log('[migrate] Base de données prête.');
} catch (e) {
  console.error('[migrate] Échec :', e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
