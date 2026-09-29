'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { login } from '../actions';

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="login">
      <form action={action} className="card login-card">
        <h1>Espace enseignant</h1>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" name="password" autoFocus required autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={pending}>
          {pending ? 'Connexion…' : 'Se connecter'}
        </button>
        <Link href="/" className="muted small">
          ← Retour au site
        </Link>
      </form>
    </main>
  );
}
