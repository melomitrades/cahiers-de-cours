'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createZone,
  deleteZone,
  setPageDocument,
  setPageDocumentPage,
  updateZone,
} from '@/app/admin/actions';
import type { AdminPage, DocInfo, Hinge, Notebook, Rect, ZoneKind } from '@/lib/types';
import { BookPage, rectStyle } from '../BookPage';
import { useCrops, usePageImage } from '../usePdf';
import { uploadPdf } from './upload';
import { useAction } from './useAction';

type EditZone = Rect & { id: number; kind: ZoneKind; target: number | null; hinge: Hinge };
type Corner = 'nw' | 'ne' | 'sw' | 'se';
type Drag =
  | { mode: 'draw'; x0: number; y0: number }
  | { mode: 'move'; id: number; dx: number; dy: number; start: Rect; moved: boolean }
  | { mode: 'resize'; id: number; corner: Corner; start: Rect };

const HINGES: { value: Hinge; label: string }[] = [
  { value: 'left', label: 'Gauche' },
  { value: 'right', label: 'Droite' },
  { value: 'top', label: 'Haut' },
  { value: 'bottom', label: 'Bas' },
];
const hingeLabel = (h: Hinge) => HINGES.find((x) => x.value === h)?.label.toLowerCase() ?? h;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function zonesFromPage(page: AdminPage): EditZone[] {
  return [
    ...page.links.map((l) => ({ ...l, kind: 'link' as const, hinge: 'left' as Hinge })),
    ...page.flaps.map((f) => ({ ...f, kind: 'flap' as const, target: null })),
  ].sort((a, b) => a.id - b.id);
}

type Props = {
  notebook: Notebook;
  page: AdminPage;
  total: number;
  prevId: number | null;
  nextId: number | null;
  useBlob: boolean;
};

export default function PageEditor({ notebook, page, total, prevId, nextId, useBlob }: Props) {
  const [zones, setZones] = useState<EditZone[]>(() => zonesFromPage(page));
  const [selected, setSelected] = useState<number | null>(null);
  const [tool, setTool] = useState<ZoneKind>(page.number === 2 || !page.pieces ? 'link' : 'flap');
  const [overlay, setOverlay] = useState(0.55);
  const [preview, setPreview] = useState(false);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [openFlaps, setOpenFlaps] = useState<Set<number>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const { run, busy, error } = useAction();

  const manip = notebook.manipulable;

  // Resynchronise après chaque rafraîchissement serveur.
  useEffect(() => {
    setZones(zonesFromPage(page));
  }, [page]);

  const course = usePageImage(page.course);
  const pieces = usePageImage(manip ? page.pieces : null);
  const flapZones = useMemo(() => zones.filter((z) => z.kind === 'flap'), [zones]);
  const crops = useCrops(manip ? page.pieces : null, flapZones);
  const sel = zones.find((z) => z.id === selected) ?? null;

  // ---- Souris / doigt sur la page ----
  const pointFrom = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (preview || e.button !== 0) return;
    const p = pointFrom(e);
    const el = e.target as HTMLElement;
    const corner = el.dataset.corner as Corner | undefined;
    const zoneId = Number(el.closest<HTMLElement>('[data-zone]')?.dataset.zone);
    stageRef.current!.setPointerCapture(e.pointerId);
    if (corner && zoneId) {
      const z = zones.find((z) => z.id === zoneId)!;
      drag.current = { mode: 'resize', id: zoneId, corner, start: { x: z.x, y: z.y, w: z.w, h: z.h } };
    } else if (zoneId) {
      const z = zones.find((z) => z.id === zoneId)!;
      setSelected(zoneId);
      drag.current = { mode: 'move', id: zoneId, dx: p.x - z.x, dy: p.y - z.y, start: { ...z }, moved: false };
    } else {
      setSelected(null);
      drag.current = { mode: 'draw', x0: p.x, y0: p.y };
      setDraft({ x: p.x, y: p.y, w: 0, h: 0 });
    }
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pointFrom(e);
    if (d.mode === 'draw') {
      setDraft({
        x: Math.min(d.x0, p.x),
        y: Math.min(d.y0, p.y),
        w: Math.abs(p.x - d.x0),
        h: Math.abs(p.y - d.y0),
      });
    } else if (d.mode === 'move') {
      d.moved = true;
      setZones((zs) =>
        zs.map((z) =>
          z.id === d.id
            ? { ...z, x: clamp01(Math.min(p.x - d.dx, 1 - z.w)), y: clamp01(Math.min(p.y - d.dy, 1 - z.h)) }
            : z
        )
      );
    } else {
      const s = d.start;
      let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
      if (d.corner.includes('w')) x1 = p.x; else x2 = p.x;
      if (d.corner.includes('n')) y1 = p.y; else y2 = p.y;
      const r = {
        x: Math.min(x1, x2),
        y: Math.min(y1, y2),
        w: Math.max(0.01, Math.abs(x2 - x1)),
        h: Math.max(0.01, Math.abs(y2 - y1)),
      };
      setZones((zs) => zs.map((z) => (z.id === d.id ? { ...z, ...r } : z)));
    }
  };

  const onPointerUp = async () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.mode === 'draw') {
      const r = draft;
      setDraft(null);
      if (!r || r.w < 0.015 || r.h < 0.01) return;
      const kind: ZoneKind = tool === 'flap' && manip && page.pieces ? 'flap' : 'link';
      const res = await run(
        () => createZone(page.id, { kind, ...r, target: null, hinge: 'left' }),
        { refresh: true }
      );
      if (res && res.ok && res.id) {
        setZones((zs) =>
          zs.some((z) => z.id === res.id)
            ? zs
            : [...zs, { id: res.id!, kind, ...r, target: null, hinge: 'left' }]
        );
        setSelected(res.id);
      }
    } else if (d.mode === 'move' && !d.moved) {
      return;
    } else {
      const z = zones.find((z) => z.id === d.id);
      if (z) save(z);
    }
  };

  const save = (z: EditZone) =>
    run(() => updateZone(z.id, { kind: z.kind, x: z.x, y: z.y, w: z.w, h: z.h, target: z.target, hinge: z.hinge }));

  const patch = (changes: Partial<EditZone>, persist = true) => {
    if (!sel) return;
    const z = { ...sel, ...changes };
    setZones((zs) => zs.map((x) => (x.id === z.id ? z : x)));
    if (persist) save(z);
  };

  const remove = (id: number) => {
    setZones((zs) => zs.filter((z) => z.id !== id));
    setSelected(null);
    run(() => deleteZone(id));
  };

  // Touche Suppr pour effacer la zone sélectionnée.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected) remove(selected);
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const previewPage = useMemo(
    () => ({
      ...page,
      pieces: manip ? page.pieces : null,
      links: zones.filter((z) => z.kind === 'link').map(({ id, x, y, w, h, target }) => ({ id, x, y, w, h, target })),
      flaps: manip ? flapZones.map(({ id, x, y, w, h, hinge }) => ({ id, x, y, w, h, hinge })) : [],
    }),
    [page, zones, flapZones, manip]
  );

  const base = `/admin/cahiers/${notebook.slug}/pages`;

  return (
    <div className="editor">
      <div className="editor-main">
        <div className="editor-toolbar">
          {prevId ? <Link className="btn ghost" href={`${base}/${prevId}`}>← Page {page.number - 1}</Link> : <span />}
          <strong>
            Page {page.number} / {total}
            {page.number === 1 && ' · Couverture'}
            {page.number === 2 && ' · Sommaire'}
          </strong>
          {nextId ? <Link className="btn ghost" href={`${base}/${nextId}`}>Page {page.number + 1} →</Link> : <span />}
        </div>

        {preview ? (
          <div className="editor-stage preview">
            <BookPage
              page={previewPage}
              openFlaps={openFlaps}
              onToggleFlap={(id) =>
                setOpenFlaps((s) => {
                  const c = new Set(s);
                  if (c.has(id)) c.delete(id);
                  else c.add(id);
                  return c;
                })
              }
              onLink={(n) => setNotice(`Ce lien mène à la page ${n}.`)}
            />
          </div>
        ) : (
          <div
            ref={stageRef}
            className="editor-stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {course.src && <img className="page-img" src={course.src} alt="" draggable={false} />}
            {page.course && !course.src && (
              <div className="page-status">{course.error ? 'PDF illisible' : <span className="spinner" />}</div>
            )}
            {manip && pieces.src && overlay > 0 && (
              <img className="page-img pieces-overlay" src={pieces.src} alt="" style={{ opacity: overlay }} draggable={false} />
            )}

            {zones.map((z) => (
              <div
                key={z.id}
                data-zone={z.id}
                className={`ezone ezone-${z.kind}${z.id === selected ? ' selected' : ''}`}
                style={rectStyle(z)}
              >
                {z.kind === 'flap' && crops[z.id] && <img src={crops[z.id]} alt="" draggable={false} />}
                <span className="ezone-label">
                  {z.kind === 'link' ? (z.target ? `→ p. ${z.target}` : '→ ?') : `rabat · ${hingeLabel(z.hinge)}`}
                </span>
                {z.kind === 'flap' && <span className={`hinge-mark hinge-${z.hinge}`} />}
                {z.id === selected &&
                  (['nw', 'ne', 'sw', 'se'] as Corner[]).map((c) => (
                    <span key={c} data-corner={c} className={`handle handle-${c}`} />
                  ))}
              </div>
            ))}
            {draft && <div className={`ezone ezone-${tool} draft`} style={rectStyle(draft)} />}
          </div>
        )}
        {notice && preview && (
          <p className="hint" onClick={() => setNotice(null)}>
            {notice}
          </p>
        )}
      </div>

      <aside className="editor-side">
        <label className="toggle compact">
          <input type="checkbox" checked={preview} onChange={(e) => { setPreview(e.target.checked); setNotice(null); setOpenFlaps(new Set()); }} />
          <span><strong>Aperçu élève</strong></span>
        </label>

        <DocSection
          title="PDF du cours"
          kind="course"
          pageId={page.id}
          info={page.courseDoc}
          docPage={page.course?.page ?? 1}
          useBlob={useBlob}
        />

        {manip && (
          <DocSection
            title="PDF à manipuler"
            kind="pieces"
            pageId={page.id}
            info={page.piecesDoc}
            docPage={page.pieces?.page ?? 1}
            useBlob={useBlob}
          >
            {page.pieces && (
              <label className="field">
                <span>Transparence des pièces (repérage)</span>
                <input type="range" min={0} max={1} step={0.05} value={overlay} onChange={(e) => setOverlay(+e.target.value)} />
              </label>
            )}
          </DocSection>
        )}

        <section className="side-section">
          <h3>Zones</h3>
          <p className="muted small">
            Trace un rectangle sur la page avec la souris. Clique sur une zone pour la sélectionner,
            déplace-la ou redimensionne-la avec ses coins.
          </p>
          <div className="segmented">
            <button className={tool === 'link' ? 'on' : ''} onClick={() => setTool('link')}>
              Lien vers une page
            </button>
            <button
              className={tool === 'flap' ? 'on' : ''}
              disabled={!manip || !page.pieces}
              title={!manip ? 'Active « Cours à manipuler » sur ce cahier' : !page.pieces ? 'Ajoute d’abord le PDF à manipuler' : ''}
              onClick={() => setTool('flap')}
            >
              Rabat
            </button>
          </div>

          {sel ? (
            <div className="zone-form">
              <div className="grid-2">
                <label className="field">
                  <span>Type</span>
                  <select
                    value={sel.kind}
                    onChange={(e) => patch({ kind: e.target.value as ZoneKind })}
                  >
                    <option value="link">Lien</option>
                    <option value="flap" disabled={!manip || !page.pieces}>Rabat</option>
                  </select>
                </label>
                {sel.kind === 'link' && (
                  <label className="field">
                    <span>Vers la page n°</span>
                    <input
                      key={sel.id}
                      type="number"
                      min={1}
                      max={total}
                      defaultValue={sel.target ?? ''}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || null;
                        if (v !== sel.target) patch({ target: v });
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  </label>
                )}
              </div>
              {sel.kind === 'flap' && (
                <div className="field">
                  <span>Côté de la charnière (partie collée)</span>
                  <div className="segmented">
                    {HINGES.map((h) => (
                      <button key={h.value} className={sel.hinge === h.value ? 'on' : ''} onClick={() => patch({ hinge: h.value })}>
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button className="btn danger ghost" onClick={() => remove(sel.id)}>
                Supprimer cette zone
              </button>
            </div>
          ) : (
            <ul className="zone-list">
              {zones.length === 0 && <li className="muted small">Aucune zone sur cette page.</li>}
              {zones.map((z) => (
                <li key={z.id}>
                  <button className="link-btn" onClick={() => setSelected(z.id)}>
                    {z.kind === 'link'
                      ? `Lien → ${z.target ? `page ${z.target}` : 'page à choisir'}`
                      : `Rabat (charnière ${hingeLabel(z.hinge)})`}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {busy && <p className="muted small"><span className="spinner" /> Enregistrement…</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </aside>
    </div>
  );
}

function DocSection({
  title,
  kind,
  pageId,
  info,
  docPage,
  useBlob,
  children,
}: {
  title: string;
  kind: 'course' | 'pieces';
  pageId: number;
  info: DocInfo | null;
  docPage: number;
  useBlob: boolean;
  children?: React.ReactNode;
}) {
  const { run, busy, error, setError } = useAction();
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setUploading(true);
    try {
      const doc = await uploadPdf(f, useBlob);
      await run(() => setPageDocument(pageId, kind, doc, 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’envoi.');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <section className="side-section">
      <h3>{title}</h3>
      {info ? (
        <>
          <p className="small file-name" title={info.name}>{info.name}</p>
          {info.pageCount > 1 && (
            <label className="field">
              <span>Page du PDF affichée</span>
              <select value={docPage} onChange={(e) => run(() => setPageDocumentPage(pageId, kind, +e.target.value))}>
                {Array.from({ length: info.pageCount }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Page {i + 1} / {info.pageCount}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <p className="muted small">{kind === 'course' ? 'Page blanche pour l’instant.' : 'Aucun PDF à manipuler.'}</p>
      )}
      <div className="actions">
        <button className="btn small" disabled={busy || uploading} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Envoi…' : info ? 'Remplacer…' : 'Ajouter un PDF…'}
        </button>
        {info && (
          <button
            className="btn small ghost danger"
            disabled={busy || uploading}
            onClick={() => confirm('Retirer ce PDF de la page ?') && run(() => setPageDocument(pageId, kind, null))}
          >
            Retirer
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {children}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
