'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import type { ActionResult } from '@/app/admin/actions';

/** Lance une action serveur, affiche l'erreur éventuelle et rafraîchit la page. */
export function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (fn: () => Promise<ActionResult>, opts: { refresh?: boolean } = {}) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fn();
        if (!res.ok) {
          setError(res.error);
          return null;
        }
        if (opts.refresh !== false) startTransition(() => router.refresh());
        return res;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue.');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  return { run, busy: busy || pending, error, setError };
}
