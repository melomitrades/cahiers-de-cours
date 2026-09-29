'use client';

import { useEffect, useState } from 'react';
import { getCrops, getPageImage, peekCrop, peekPageImage, RENDER_WIDTH } from '@/lib/pdf-client';
import type { DocRef, Rect } from '@/lib/types';

type State = { src: string | null; error: boolean };

/** Image d'une page de PDF (null pendant le chargement). */
export function usePageImage(ref: DocRef | null, width = RENDER_WIDTH): State {
  const url = ref?.url;
  const page = ref?.page;
  const [state, setState] = useState<State>(() => ({
    src: ref ? peekPageImage(ref, width) : null,
    error: false,
  }));

  useEffect(() => {
    if (!url || !page) {
      setState({ src: null, error: false });
      return;
    }
    const r = { url, page };
    const cached = peekPageImage(r, width);
    if (cached) {
      setState({ src: cached, error: false });
      return;
    }
    let alive = true;
    setState({ src: null, error: false });
    getPageImage(r, width)
      .then((src) => alive && setState({ src, error: false }))
      .catch((e) => {
        console.error(e);
        if (alive) setState({ src: null, error: true });
      });
    return () => {
      alive = false;
    };
  }, [url, page, width]);

  return state;
}

/** Images découpées des rabats, indexées par identifiant de zone. */
export function useCrops<T extends Rect & { id: number }>(
  ref: DocRef | null,
  rects: T[]
): Record<number, string> {
  const url = ref?.url;
  const page = ref?.page;
  const signature = rects.map((r) => `${r.id}:${r.x},${r.y},${r.w},${r.h}`).join('|');

  const initial = () => {
    const out: Record<number, string> = {};
    if (ref) for (const r of rects) {
      const u = peekCrop(ref, r);
      if (u) out[r.id] = u;
    }
    return out;
  };
  const [crops, setCrops] = useState<Record<number, string>>(initial);

  useEffect(() => {
    if (!url || !page || !rects.length) {
      setCrops({});
      return;
    }
    let alive = true;
    getCrops({ url, page }, rects)
      .then((c) => alive && setCrops(c))
      .catch((e) => console.error(e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, page, signature]);

  return crops;
}
