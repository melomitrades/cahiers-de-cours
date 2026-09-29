import 'server-only';
import postgres from 'postgres';

type Sql = postgres.Sql;

const globalForDb = globalThis as unknown as { __sql?: Sql };

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

function createClient(): Sql {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "La base de données n'est pas configurée : ajoute la variable DATABASE_URL (Neon)."
    );
  }
  return postgres(url, {
    prepare: false, // compatible avec le pooler de Neon
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    transform: { column: { from: postgres.toCamel } },
  }) as unknown as Sql;
}

/** Client SQL partagé (créé à la première utilisation). */
export function db(): Sql {
  if (!globalForDb.__sql) globalForDb.__sql = createClient();
  return globalForDb.__sql;
}

/** Exécute `fn` dans une transaction. */
export async function transaction<T>(fn: (sql: Sql) => Promise<T>): Promise<T> {
  const result = await db().begin((tx) => fn(tx as unknown as Sql));
  return result as T;
}

export type { Sql };
