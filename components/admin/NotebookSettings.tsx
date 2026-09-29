'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import {
  createNotebook,
  deleteNotebook,
  moveNotebook,
  saveSiteName,
  updateNotebook,
} from '@/app/admin/actions';
import type { Notebook } from '@/lib/types';
import { useAction } from './useAction';

export function SiteNameForm({ initial }: { initial: string }) {
  const [name, setName] = useState(initial);
  const { run, busy, error } = useAction();
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="card row-form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => saveSiteName(name))) setSaved(true);
      }}
    >
      <label className="field grow">
        <span>Nom du site (affiché sur l’accueil)</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <button className="btn" disabled={busy || name === initial}>
        {saved ? 'Enregistré ✓' : 'Enregistrer'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function NotebookList({ notebooks }: { notebooks: Notebook[] }) {
  const [label, setLabel] = useState('');
  const { run, busy, error } = useAction();
  return (
    <section>
      <div className="notebook-list">
        {notebooks.map((nb, i) => (
          <NotebookCard key={nb.id} nb={nb} first={i === 0} last={i === notebooks.length - 1} />
        ))}
      </div>
      <form
        className="card row-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => createNotebook(label))) setLabel('');
        }}
      >
        <label className="field grow">
          <span>Ajouter une classe</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="ex. 3ème" />
        </label>
        <button className="btn" disabled={busy || !label.trim()}>
          Ajouter
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}

function NotebookCard({ nb, first, last }: { nb: Notebook; first: boolean; last: boolean }) {
  const [form, setForm] = useState({
    label: nb.label,
    title: nb.title,
    color: nb.color,
    manipulable: nb.manipulable,
  });
  const { run, busy, error } = useAction();
  const dirty =
    form.label !== nb.label ||
    form.title !== nb.title ||
    form.color !== nb.color ||
    form.manipulable !== nb.manipulable;

  return (
    <article className="card notebook-card" style={{ '--accent': form.color } as CSSProperties}>
      <div className="notebook-card-head">
        <span className="class-badge">{form.label || '?'}</span>
        <div className="spacer" />
        <button className="icon-btn" disabled={first || busy} onClick={() => run(() => moveNotebook(nb.id, -1))} title="Monter">
          ↑
        </button>
        <button className="icon-btn" disabled={last || busy} onClick={() => run(() => moveNotebook(nb.id, 1))} title="Descendre">
          ↓
        </button>
      </div>

      <div className="grid-2">
        <label className="field">
          <span>Classe</span>
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        </label>
        <label className="field">
          <span>Couleur</span>
          <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
        </label>
      </div>
      <label className="field">
        <span>Titre du cahier</span>
        <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={form.manipulable}
          onChange={(e) => setForm({ ...form, manipulable: e.target.checked })}
        />
        <span>
          <strong>Cours à manipuler</strong>
          <small>Chaque page peut recevoir un 2e PDF dont les pièces deviennent des rabats à ouvrir.</small>
        </span>
      </label>

      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button className="btn primary" disabled={!dirty || busy} onClick={() => run(() => updateNotebook(nb.id, form))}>
          Enregistrer
        </button>
        <Link className="btn" href={`/admin/cahiers/${nb.slug}`}>
          Gérer les pages →
        </Link>
        <Link className="btn ghost" href={`/cahier/${nb.slug}`} target="_blank">
          Voir ↗
        </Link>
        <div className="spacer" />
        <button
          className="btn danger ghost"
          disabled={busy}
          onClick={() => {
            if (confirm(`Supprimer définitivement le cahier « ${nb.label} » et toutes ses pages ?`)) {
              run(() => deleteNotebook(nb.id));
            }
          }}
        >
          Supprimer
        </button>
      </div>
    </article>
  );
}
