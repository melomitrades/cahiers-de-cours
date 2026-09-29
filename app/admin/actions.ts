'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { checkPassword, isAdmin, SESSION_COOKIE, SESSION_MAX_AGE, sessionToken } from '@/lib/auth';
import { db, transaction, type Sql } from '@/lib/db';
import { deleteStoredFiles, isAllowedDocUrl } from '@/lib/storage';
import type { Hinge, UploadedDoc, ZoneKind } from '@/lib/types';

export type ActionResult = { ok: true; id?: number } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Outils
// ---------------------------------------------------------------------------

async function guard(fn: () => Promise<number | void>): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: 'Session expirée : reconnecte-toi.' };
  try {
    const id = await fn();
    revalidatePath('/', 'layout');
    return typeof id === 'number' ? { ok: true, id } : { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue.' };
  }
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const int = (v: unknown, fallback = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

function checkDoc(doc: UploadedDoc): UploadedDoc {
  if (!doc || !isAllowedDocUrl(doc.url)) throw new Error('Fichier invalide.');
  return {
    url: doc.url,
    name: String(doc.name || 'document.pdf').slice(0, 200),
    pageCount: clamp(int(doc.pageCount, 1), 1, 2000),
  };
}

/** Remet les numéros de page à 1, 2, 3… sans trou. */
async function renumber(sql: Sql, notebookId: number) {
  await sql`
    update pages p set position = r.rn
    from (
      select id, row_number() over (order by position, id) as rn
      from pages where notebook_id = ${notebookId}
    ) r
    where p.id = r.id`;
}

/** Supprime les PDF qui ne sont plus utilisés par aucune page. */
async function cleanupDocuments() {
  const rows = await db()`
    delete from documents d
    where not exists (
      select 1 from pages p where p.course_doc_id = d.id or p.pieces_doc_id = d.id
    )
    returning url`;
  await deleteStoredFiles(rows.map((r) => r.url as string));
}

async function notebookOfPage(sql: Sql, pageId: number): Promise<number> {
  const rows = await sql`select notebook_id from pages where id = ${pageId}`;
  if (!rows.length) throw new Error('Page introuvable.');
  return rows[0].notebookId as number;
}

async function pageIdByNumber(sql: Sql, notebookId: number, num: number): Promise<number | null> {
  if (!num || num < 1) return null;
  const rows = await sql`
    select id from pages where notebook_id = ${notebookId}
    order by position, id offset ${num - 1} limit 1`;
  return (rows[0]?.id as number) ?? null;
}

function slugify(label: string) {
  return (
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cahier'
  );
}

// ---------------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------------

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  if (!process.env.ADMIN_PASSWORD) {
    return 'Aucun mot de passe n’est configuré : ajoute la variable ADMIN_PASSWORD.';
  }
  if (!checkPassword(String(formData.get('password') ?? ''))) {
    await new Promise((r) => setTimeout(r, 600));
    return 'Mot de passe incorrect.';
  }
  (await cookies()).set(SESSION_COOKIE, sessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  redirect('/admin');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/admin/login');
}

// ---------------------------------------------------------------------------
// Réglages et cahiers
// ---------------------------------------------------------------------------

export async function saveSiteName(name: string) {
  return guard(async () => {
    const value = String(name).trim().slice(0, 120) || 'Mes cahiers de cours';
    await db()`
      insert into settings (key, value) values ('site_name', ${value})
      on conflict (key) do update set value = excluded.value`;
  });
}

export async function updateNotebook(
  id: number,
  data: { label: string; title: string; color: string; manipulable: boolean }
) {
  return guard(async () => {
    const label = String(data.label).trim().slice(0, 40);
    if (!label) throw new Error('Le nom de la classe est obligatoire.');
    const color = /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#3b6fd4';
    await db()`
      update notebooks set
        label = ${label},
        title = ${String(data.title).trim().slice(0, 120)},
        color = ${color},
        manipulable = ${Boolean(data.manipulable)}
      where id = ${int(id)}`;
  });
}

export async function createNotebook(label: string) {
  return guard(async () => {
    const clean = String(label).trim().slice(0, 40);
    if (!clean) throw new Error('Indique le nom de la classe.');
    return transaction(async (sql) => {
      const base = slugify(clean);
      const existing = await sql`select slug from notebooks where slug like ${base + '%'}`;
      const taken = new Set(existing.map((r) => r.slug as string));
      let slug = base;
      for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
      const [{ id }] = await sql`
        insert into notebooks (slug, label, title, color, position)
        values (${slug}, ${clean}, 'Cahier de cours', '#6b5bd2',
                (select coalesce(max(position), 0) + 1 from notebooks))
        returning id`;
      await sql`insert into pages (notebook_id, position) values (${id}, 1), (${id}, 2)`;
      return id as number;
    });
  });
}

export async function deleteNotebook(id: number) {
  return guard(async () => {
    await db()`delete from notebooks where id = ${int(id)}`;
    await cleanupDocuments();
  });
}

export async function moveNotebook(id: number, dir: -1 | 1) {
  return guard(async () => {
    await transaction(async (sql) => {
      const rows = await sql`select id from notebooks order by position, id`;
      const ids = rows.map((r) => r.id as number);
      const i = ids.indexOf(int(id));
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      for (const [pos, nid] of ids.entries()) {
        await sql`update notebooks set position = ${pos} where id = ${nid}`;
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** Insère une page blanche : elle prend le numéro `at` (les suivantes sont décalées). */
export async function addBlankPage(notebookId: number, at: number) {
  return guard(async () =>
    transaction(async (sql) => {
      const nb = int(notebookId);
      await renumber(sql, nb);
      const [{ total }] = await sql`select count(*)::int as total from pages where notebook_id = ${nb}`;
      const pos = clamp(int(at, total + 1), 1, (total as number) + 1);
      await sql`update pages set position = position + 1 where notebook_id = ${nb} and position >= ${pos}`;
      const [{ id }] = await sql`
        insert into pages (notebook_id, position) values (${nb}, ${pos}) returning id`;
      return id as number;
    })
  );
}

export async function deletePage(pageId: number) {
  return guard(async () => {
    await transaction(async (sql) => {
      const nb = await notebookOfPage(sql, int(pageId));
      await sql`delete from pages where id = ${int(pageId)}`;
      await renumber(sql, nb);
    });
    await cleanupDocuments();
  });
}

export async function movePage(pageId: number, dir: -1 | 1) {
  return guard(async () => {
    await transaction(async (sql) => {
      const nb = await notebookOfPage(sql, int(pageId));
      await renumber(sql, nb);
      const [me] = await sql`select position from pages where id = ${int(pageId)}`;
      const target = (me.position as number) + (dir === 1 ? 1 : -1);
      const other = await sql`
        select id from pages where notebook_id = ${nb} and position = ${target}`;
      if (!other.length) return;
      await sql`update pages set position = ${me.position as number} where id = ${other[0].id as number}`;
      await sql`update pages set position = ${target} where id = ${int(pageId)}`;
    });
  });
}

/**
 * Place un PDF (une ou plusieurs pages) dans un cahier.
 * - mode "insert"  : crée de nouvelles pages à partir du numéro `start`.
 * - mode "replace" : remplit les pages existantes à partir de `start` (crée les manquantes).
 * `kind` = "course" (le cours) ou "pieces" (le PDF à manipuler).
 */
export async function placeDocument(input: {
  notebookId: number;
  doc: UploadedDoc;
  kind: 'course' | 'pieces';
  mode: 'insert' | 'replace';
  start: number;
  from: number;
  to: number;
}) {
  return guard(async () => {
    const doc = checkDoc(input.doc);
    const nb = int(input.notebookId);
    const from = clamp(int(input.from, 1), 1, doc.pageCount);
    const to = clamp(int(input.to, doc.pageCount), from, doc.pageCount);
    const count = to - from + 1;
    const docCol = input.kind === 'pieces' ? 'pieces_doc_id' : 'course_doc_id';
    const pageCol = input.kind === 'pieces' ? 'pieces_doc_page' : 'course_doc_page';

    await transaction(async (sql) => {
      await renumber(sql, nb);
      const [{ total }] = await sql`select count(*)::int as total from pages where notebook_id = ${nb}`;
      const start = clamp(int(input.start, (total as number) + 1), 1, (total as number) + 1);
      const [{ id: docId }] = await sql`
        insert into documents (url, name, page_count)
        values (${doc.url}, ${doc.name}, ${doc.pageCount}) returning id`;

      if (input.mode === 'insert') {
        await sql`
          update pages set position = position + ${count}
          where notebook_id = ${nb} and position >= ${start}`;
      }
      for (let i = 0; i < count; i++) {
        const num = start + i;
        const updated =
          input.mode === 'replace'
            ? await sql`
                update pages set ${sql(docCol)} = ${docId as number}, ${sql(pageCol)} = ${from + i}
                where notebook_id = ${nb} and position = ${num}
                returning id`
            : [];
        if (!updated.length) {
          await sql`
            insert into pages (notebook_id, position, ${sql(docCol)}, ${sql(pageCol)})
            values (${nb}, ${num}, ${docId as number}, ${from + i})`;
        }
      }
      await renumber(sql, nb);
    });
    await cleanupDocuments();
  });
}

/** Change le PDF d'une seule page (doc = null pour le retirer). */
export async function setPageDocument(
  pageId: number,
  kind: 'course' | 'pieces',
  doc: UploadedDoc | null,
  docPage = 1
) {
  return guard(async () => {
    const docCol = kind === 'pieces' ? 'pieces_doc_id' : 'course_doc_id';
    const pageCol = kind === 'pieces' ? 'pieces_doc_page' : 'course_doc_page';
    await transaction(async (sql) => {
      let docId: number | null = null;
      let page: number | null = null;
      if (doc) {
        const d = checkDoc(doc);
        const [row] = await sql`
          insert into documents (url, name, page_count)
          values (${d.url}, ${d.name}, ${d.pageCount}) returning id`;
        docId = row.id as number;
        page = clamp(int(docPage, 1), 1, d.pageCount);
      }
      await sql`
        update pages set ${sql(docCol)} = ${docId}, ${sql(pageCol)} = ${page}
        where id = ${int(pageId)}`;
    });
    await cleanupDocuments();
  });
}

/** Choisit quelle page du PDF déjà associé est affichée. */
export async function setPageDocumentPage(pageId: number, kind: 'course' | 'pieces', docPage: number) {
  return guard(async () => {
    const pageCol = kind === 'pieces' ? 'pieces_doc_page' : 'course_doc_page';
    const sql = db();
    await sql`update pages set ${sql(pageCol)} = ${Math.max(1, int(docPage, 1))} where id = ${int(pageId)}`;
  });
}

// ---------------------------------------------------------------------------
// Zones (liens du sommaire et rabats)
// ---------------------------------------------------------------------------

type ZoneInput = {
  kind: ZoneKind;
  x: number;
  y: number;
  w: number;
  h: number;
  target?: number | null;
  hinge?: Hinge;
};

function cleanZone(z: ZoneInput) {
  const x = clamp(Number(z.x) || 0, 0, 1);
  const y = clamp(Number(z.y) || 0, 0, 1);
  return {
    kind: (z.kind === 'flap' ? 'flap' : 'link') as ZoneKind,
    x,
    y,
    w: clamp(Number(z.w) || 0, 0.005, 1 - x),
    h: clamp(Number(z.h) || 0, 0.005, 1 - y),
    hinge: (['top', 'bottom', 'left', 'right'] as const).includes(z.hinge as Hinge)
      ? (z.hinge as Hinge)
      : 'left',
  };
}

export async function createZone(pageId: number, zone: ZoneInput) {
  return guard(async () =>
    transaction(async (sql) => {
      const nb = await notebookOfPage(sql, int(pageId));
      const z = cleanZone(zone);
      const target = z.kind === 'link' ? await pageIdByNumber(sql, nb, int(zone.target)) : null;
      const [row] = await sql`
        insert into zones (page_id, kind, x, y, w, h, target_page_id, hinge)
        values (${int(pageId)}, ${z.kind}, ${z.x}, ${z.y}, ${z.w}, ${z.h}, ${target}, ${z.hinge})
        returning id`;
      return row.id as number;
    })
  );
}

export async function updateZone(zoneId: number, zone: ZoneInput) {
  return guard(async () => {
    await transaction(async (sql) => {
      const rows = await sql`select page_id from zones where id = ${int(zoneId)}`;
      if (!rows.length) throw new Error('Zone introuvable.');
      const nb = await notebookOfPage(sql, rows[0].pageId as number);
      const z = cleanZone(zone);
      const target = z.kind === 'link' ? await pageIdByNumber(sql, nb, int(zone.target)) : null;
      await sql`
        update zones set kind = ${z.kind}, x = ${z.x}, y = ${z.y}, w = ${z.w}, h = ${z.h},
          target_page_id = ${target}, hinge = ${z.hinge}
        where id = ${int(zoneId)}`;
    });
  });
}

export async function deleteZone(zoneId: number) {
  return guard(async () => {
    await db()`delete from zones where id = ${int(zoneId)}`;
  });
}
