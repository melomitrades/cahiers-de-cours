'use client';

import Link from 'next/link';
import { useState } from 'react';
import { addBlankPage, deletePage, movePage, placeDocument } from '@/app/admin/actions';
import { countPdfPages, THUMB_WIDTH } from '@/lib/pdf-client';
import type { AdminPage, Notebook } from '@/lib/types';
import { usePageImage } from '../usePdf';
import { uploadPdf } from './upload';
import { useAction } from './useAction';

type Props = { notebook: Notebook; pages: AdminPage[]; useBlob: boolean };

export default function PagesManager({ notebook, pages, useBlob }: Props) {
  const [panel, setPanel] = useState<null | 'course' | 'pieces'>(null);
  const { run, busy, error } = useAction();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            {notebook.label} <span className="muted">· {notebook.title}</span>
          </h1>
          <p className="muted">
            {pages.length} page{pages.length > 1 ? 's' : ''}
            {notebook.manipulable ? ' · Cours à manipuler activé' : ''}
          </p>
        </div>
        <div className="actions">
          <button className="btn primary" onClick={() => setPanel('course')}>
            + PDF de cours
          </button>
          {notebook.manipulable && (
            <button className="btn" onClick={() => setPanel('pieces')}>
              + PDF à manipuler
            </button>
          )}
          <button className="btn" disabled={busy} onClick={() => run(() => addBlankPage(notebook.id, pages.length + 1))}>
            + Page blanche
          </button>
          <Link className="btn ghost" href={`/cahier/${notebook.slug}`} target="_blank">
            Voir ↗
          </Link>
        </div>
      </div>

      <div className="hint">
        <strong>Rappel :</strong> la page 1 est la couverture et la page 2 le sommaire. Ouvre la page 2
        pour y dessiner les zones cliquables qui mènent aux chapitres.
      </div>

      {error && <p className="error">{error}</p>}

      {panel && (
        <PlacePdfPanel
          key={panel}
          kind={panel}
          notebook={notebook}
          total={pages.length}
          useBlob={useBlob}
          onClose={() => setPanel(null)}
        />
      )}

      <ol className="page-grid">
        {pages.map((p, i) => (
          <li key={p.id} className="page-card">
            <Link href={`/admin/cahiers/${notebook.slug}/pages/${p.id}`} className="page-card-thumb">
              <PageThumb page={p} />
              <span className="page-card-num">{p.number}</span>
              {p.number === 1 && <span className="tag">Couverture</span>}
              {p.number === 2 && <span className="tag">Sommaire</span>}
            </Link>
            <div className="page-card-info">
              {p.links.length > 0 && <span className="chip link">{p.links.length} lien{p.links.length > 1 ? 's' : ''}</span>}
              {notebook.manipulable && p.pieces && <span className="chip flap">{p.flaps.length} rabat{p.flaps.length > 1 ? 's' : ''}</span>}
              {!p.course && <span className="chip">Page blanche</span>}
            </div>
            <div className="page-card-actions">
              <button className="icon-btn" title="Déplacer avant" disabled={i === 0 || busy} onClick={() => run(() => movePage(p.id, -1))}>
                ←
              </button>
              <button className="icon-btn" title="Déplacer après" disabled={i === pages.length - 1 || busy} onClick={() => run(() => movePage(p.id, 1))}>
                →
              </button>
              <button className="icon-btn" title="Insérer une page blanche après" disabled={busy} onClick={() => run(() => addBlankPage(notebook.id, p.number + 1))}>
                +
              </button>
              <button
                className="icon-btn danger"
                title="Supprimer la page"
                disabled={busy}
                onClick={() => {
                  if (confirm(`Supprimer la page ${p.number} ?`)) run(() => deletePage(p.id));
                }}
              >
                ×
              </button>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

export function PageThumb({ page }: { page: AdminPage }) {
  const { src, error } = usePageImage(page.course, THUMB_WIDTH);
  return (
    <div className="thumb">
      {page.course ? (
        src ? (
          <img src={src} alt="" />
        ) : (
          <span className="thumb-status">{error ? 'PDF illisible' : <span className="spinner" />}</span>
        )
      ) : null}
    </div>
  );
}

function PlacePdfPanel({
  kind,
  notebook,
  total,
  useBlob,
  onClose,
}: {
  kind: 'course' | 'pieces';
  notebook: Notebook;
  total: number;
  useBlob: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<'insert' | 'replace'>(kind === 'pieces' ? 'replace' : 'insert');
  const [start, setStart] = useState(kind === 'pieces' ? Math.min(3, total || 1) : total + 1);
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const { run, busy, error, setError } = useAction();

  const pick = async (f: File | undefined) => {
    setError(null);
    setFile(null);
    if (!f) return;
    try {
      setStatus('Lecture du PDF…');
      const n = await countPdfPages(f);
      setFile(f);
      setCount(n);
      setFrom(1);
      setTo(n);
    } catch {
      setError('Ce fichier ne semble pas être un PDF valide.');
    } finally {
      setStatus(null);
    }
  };

  const n = file ? to - from + 1 : 0;
  const maxStart = mode === 'insert' ? total + 1 : Math.max(total, 1);

  const submit = async () => {
    if (!file) return;
    setStatus('Envoi du fichier…');
    try {
      const doc = await uploadPdf(file, useBlob, count);
      setStatus('Enregistrement…');
      const res = await run(() =>
        placeDocument({ notebookId: notebook.id, doc, kind, mode, start, from, to })
      );
      if (res) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de l’envoi.');
    } finally {
      setStatus(null);
    }
  };

  return (
    <div className="card panel">
      <div className="panel-head">
        <h2>{kind === 'course' ? 'Ajouter un PDF de cours' : 'Ajouter un PDF à manipuler'}</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Fermer">
          ×
        </button>
      </div>
      {kind === 'pieces' && (
        <p className="muted small">
          Ce PDF contient les pièces (rabats). Il doit être aligné sur la page de cours : ensuite, dans
          chaque page, tu dessines les rabats à l’endroit voulu.
        </p>
      )}

      <label className="field">
        <span>Fichier PDF</span>
        <input type="file" accept="application/pdf,.pdf" onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {file && (
        <>
          <p className="small">
            <strong>{file.name}</strong> — {count} page{count > 1 ? 's' : ''}
          </p>

          {count > 1 && (
            <div className="grid-2">
              <label className="field">
                <span>De la page du PDF</span>
                <input type="number" min={1} max={to} value={from} onChange={(e) => setFrom(Math.max(1, Math.min(to, +e.target.value || 1)))} />
              </label>
              <label className="field">
                <span>À la page du PDF</span>
                <input type="number" min={from} max={count} value={to} onChange={(e) => setTo(Math.max(from, Math.min(count, +e.target.value || count)))} />
              </label>
            </div>
          )}

          {kind === 'course' && (
            <div className="radio-group">
              <label>
                <input type="radio" checked={mode === 'insert'} onChange={() => { setMode('insert'); setStart(total + 1); }} />
                Créer {n > 1 ? `${n} nouvelles pages` : 'une nouvelle page'}
              </label>
              <label>
                <input type="radio" checked={mode === 'replace'} onChange={() => { setMode('replace'); setStart(Math.min(start, Math.max(total, 1))); }} />
                Remplacer le contenu de pages existantes
              </label>
            </div>
          )}

          <label className="field narrow">
            <span>
              {mode === 'insert' ? 'Insérer à partir de la page n°' : 'À partir de la page n° du cahier'}
            </span>
            <input type="number" min={1} max={maxStart} value={start} onChange={(e) => setStart(Math.max(1, Math.min(maxStart, +e.target.value || 1)))} />
          </label>
          <p className="muted small">
            {n > 1
              ? `Le PDF occupera les pages ${start} à ${start + n - 1} du cahier.`
              : `Le PDF occupera la page ${start} du cahier.`}
            {mode === 'insert' && start <= total ? ' Les pages suivantes seront décalées.' : ''}
          </p>
        </>
      )}

      {status && (
        <p className="small">
          <span className="spinner" /> {status}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="actions">
        <button className="btn primary" disabled={!file || busy || !!status} onClick={submit}>
          Envoyer
        </button>
        <button className="btn ghost" onClick={onClose}>
          Annuler
        </button>
      </div>
    </div>
  );
}
