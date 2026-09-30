import 'server-only';
import { db } from './db';
import type { AdminPage, Hinge, Notebook, ViewPage } from './types';

export async function getSiteName(): Promise<string> {
  const rows = await db()`select value from settings where key = 'site_name'`;
  return (rows[0]?.value as string) || 'Mes cahiers de cours';
}

export async function getNotebooks(): Promise<Notebook[]> {
  const rows = await db()`
    select id, slug, label, title, color, position, manipulable
    from notebooks order by position, id`;
  return rows as unknown as Notebook[];
}

export async function getNotebookBySlug(slug: string): Promise<Notebook | null> {
  const rows = await db()`
    select id, slug, label, title, color, position, manipulable
    from notebooks where slug = ${slug}`;
  return (rows[0] as unknown as Notebook) ?? null;
}

type PageRow = {
  id: number;
  courseDocId: number | null;
  courseDocPage: number | null;
  courseUrl: string | null;
  courseName: string | null;
  coursePageCount: number | null;
  piecesDocId: number | null;
  piecesDocPage: number | null;
  piecesUrl: string | null;
  piecesName: string | null;
  piecesPageCount: number | null;
};

type ZoneRow = {
  id: number;
  pageId: number;
  kind: 'link' | 'flap';
  x: number;
  y: number;
  w: number;
  h: number;
  targetPageId: number | null;
  hinge: Hinge;
};

/** Les PDF stockés sur Vercel Blob passent par /api/doc/<id> (compatible stockage privé). */
function docUrl(id: number, url: string) {
  return url.startsWith('https://') ? `/api/doc/${id}` : url;
}

/** Toutes les pages d'un cahier, dans l'ordre, avec leurs zones. */
export async function getPages(notebookId: number): Promise<AdminPage[]> {
  const sql = db();
  const [pageRows, zoneRows] = await Promise.all([
    sql`
      select p.id,
             p.course_doc_id, p.course_doc_page,
             cd.url as course_url, cd.name as course_name, cd.page_count as course_page_count,
             p.pieces_doc_id, p.pieces_doc_page,
             pd.url as pieces_url, pd.name as pieces_name, pd.page_count as pieces_page_count
      from pages p
      left join documents cd on cd.id = p.course_doc_id
      left join documents pd on pd.id = p.pieces_doc_id
      where p.notebook_id = ${notebookId}
      order by p.position, p.id`,
    sql`
      select z.id, z.page_id, z.kind, z.x, z.y, z.w, z.h, z.target_page_id, z.hinge
      from zones z join pages p on p.id = z.page_id
      where p.notebook_id = ${notebookId}
      order by z.id`,
  ]);

  const rows = pageRows as unknown as PageRow[];
  const zones = zoneRows as unknown as ZoneRow[];
  const numberById = new Map(rows.map((r, i) => [r.id, i + 1]));

  return rows.map((r, i) => {
    const own = zones.filter((z) => z.pageId === r.id);
    return {
      id: r.id,
      number: i + 1,
      course: r.courseUrl ? { url: docUrl(r.courseDocId!, r.courseUrl), page: r.courseDocPage ?? 1 } : null,
      pieces: r.piecesUrl ? { url: docUrl(r.piecesDocId!, r.piecesUrl), page: r.piecesDocPage ?? 1 } : null,
      courseDoc: r.courseDocId
        ? { id: r.courseDocId, name: r.courseName ?? '', pageCount: r.coursePageCount ?? 1 }
        : null,
      piecesDoc: r.piecesDocId
        ? { id: r.piecesDocId, name: r.piecesName ?? '', pageCount: r.piecesPageCount ?? 1 }
        : null,
      links: own
        .filter((z) => z.kind === 'link')
        .map((z) => ({
          id: z.id,
          x: z.x,
          y: z.y,
          w: z.w,
          h: z.h,
          target: z.targetPageId ? numberById.get(z.targetPageId) ?? null : null,
        })),
      flaps: own
        .filter((z) => z.kind === 'flap')
        .map((z) => ({ id: z.id, x: z.x, y: z.y, w: z.w, h: z.h, hinge: z.hinge })),
    };
  });
}

/** Version allégée pour les élèves (sans noms de fichiers, sans zones incomplètes). */
export function toViewPages(pages: AdminPage[], manipulable: boolean): ViewPage[] {
  return pages.map((p) => ({
    id: p.id,
    number: p.number,
    course: p.course,
    pieces: manipulable ? p.pieces : null,
    links: p.links.filter((l) => l.target !== null),
    flaps: manipulable && p.pieces ? p.flaps : [],
  }));
}
