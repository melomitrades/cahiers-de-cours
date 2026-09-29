'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { getCrops, getPageImage } from '@/lib/pdf-client';
import { PAGE_RATIO, type Notebook, type ViewPage } from '@/lib/types';
import { BookPage } from './BookPage';

type Anim = { dir: 1 | -1; from: number; to: number };

const DURATION = 750;
const EASING = 'cubic-bezier(.45,.05,.35,1)';
const ARROW_SPACE = 64;

/** Double page : 0 → [vide, 1], 1 → [2, 3], 2 → [4, 5]… */
const spreadIndex = (p: number) => Math.floor(p / 2);

export default function Flipbook({ notebook, pages }: { notebook: Notebook; pages: ViewPage[] }) {
  const n = pages.length;
  const stageRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [current, setCurrent] = useState(1);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [openFlaps, setOpenFlaps] = useState<Set<number>>(() => new Set());

  // ---- Taille disponible ----
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const availH = Math.max(0, size.h - 24);
  const doubleW = Math.min((size.w - 2 * ARROW_SPACE) / 2, availH / PAGE_RATIO);
  const single = size.w > 0 && doubleW < 260;
  const pageW = Math.floor(
    single ? Math.min(size.w - 24, availH / PAGE_RATIO) : Math.max(doubleW, 0)
  );
  const pageH = Math.floor(pageW * PAGE_RATIO);

  const clamp = useCallback((p: number) => Math.min(Math.max(1, Math.round(p)), Math.max(1, n)), [n]);

  const spread = useCallback(
    (p: number): [number | null, number | null] => {
      const s = spreadIndex(p);
      if (s === 0) return [null, 1];
      const l = 2 * s;
      return [l <= n ? l : null, l + 1 <= n ? l + 1 : null];
    },
    [n]
  );

  // ---- Page de départ (?page=12) ----
  useEffect(() => {
    const p = Number(new URLSearchParams(window.location.search).get('page'));
    if (p) setCurrent(clamp(p));
  }, [clamp]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('page', String(current));
    window.history.replaceState(null, '', url);
  }, [current]);

  // ---- Navigation ----
  const goTo = useCallback(
    (target: number) => {
      if (anim || !n) return;
      const to = clamp(target);
      if (to === current) return;
      if (!single && spreadIndex(to) === spreadIndex(current)) {
        setCurrent(to);
        return;
      }
      setAnim({ dir: to > current ? 1 : -1, from: current, to });
    },
    [anim, n, clamp, current, single]
  );

  const firstVisible = single ? current : spread(current)[0] ?? 1;
  const lastVisible = single ? current : spread(current)[1] ?? spread(current)[0] ?? 1;
  const next = () => goTo(single ? current + 1 : 2 * (spreadIndex(current) + 1));
  const prev = () => goTo(single ? current - 1 : Math.max(1, 2 * (spreadIndex(current) - 1)));
  const canPrev = firstVisible > 1;
  const canNext = lastVisible < n;

  // ---- Animation de la page qui tourne ----
  useLayoutEffect(() => {
    const el = leafRef.current;
    if (!anim || !el) return;
    let from = 0;
    let to = anim.dir === 1 ? -180 : 180;
    if (single) {
      from = anim.dir === 1 ? 0 : -180;
      to = anim.dir === 1 ? -180 : 0;
    }
    const a = el.animate(
      [{ transform: `rotateY(${from}deg)` }, { transform: `rotateY(${to}deg)` }],
      { duration: DURATION, easing: EASING, fill: 'forwards' }
    );
    let cancelled = false;
    a.finished
      .then(() => {
        if (cancelled) return;
        setCurrent(anim.to);
        setAnim(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      a.cancel();
    };
  }, [anim, single]);

  // ---- Clavier ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- Préchargement des pages voisines ----
  useEffect(() => {
    if (anim) return;
    const id = window.setTimeout(() => {
      for (let d = -3; d <= 4; d++) {
        const p = pages[current - 1 + d];
        if (!p) continue;
        if (p.course) getPageImage(p.course).catch(() => {});
        if (p.pieces && p.flaps.length) getCrops(p.pieces, p.flaps).catch(() => {});
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [current, anim, pages]);

  // ---- Balayage sur écran tactile ----
  const touchStart = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') touchStart.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (touchStart.current === null) return;
    const dx = e.clientX - touchStart.current;
    touchStart.current = null;
    if (dx < -50) next();
    else if (dx > 50) prev();
  };

  const toggleFlap = useCallback((id: number) => {
    setOpenFlaps((s) => {
      const copy = new Set(s);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }, []);

  const renderPage = (num: number | null, side: 'left' | 'right' | 'single', interactive: boolean) =>
    num ? (
      <BookPage
        key={`${num}-${side}`}
        page={pages[num - 1]}
        side={side}
        openFlaps={openFlaps}
        onToggleFlap={toggleFlap}
        onLink={goTo}
        interactive={interactive}
      />
    ) : (
      <div className="book-page is-empty" />
    );

  // ---- Composition de l'affichage ----
  let content: React.ReactNode;
  if (!n) {
    content = <p className="empty-book">Ce cahier ne contient pas encore de pages.</p>;
  } else if (single) {
    const under = anim ? (anim.dir === 1 ? anim.to : anim.from) : current;
    const leaf = anim ? (anim.dir === 1 ? anim.from : anim.to) : null;
    content = (
      <div className="book single" style={{ width: pageW, height: pageH }}>
        <div className="slot slot-full">{renderPage(under, 'single', !anim)}</div>
        {leaf && (
          <div ref={leafRef} className="leaf leaf-full">
            <div className="leaf-face">{renderPage(leaf, 'single', false)}</div>
            <div className="leaf-face leaf-back">
              <div className="book-page" />
            </div>
          </div>
        )}
      </div>
    );
  } else {
    let left: number | null, right: number | null;
    let leafFront: number | null = null,
      leafBack: number | null = null;
    if (anim) {
      const [fL, fR] = spread(anim.from);
      const [tL, tR] = spread(anim.to);
      if (anim.dir === 1) {
        [left, right, leafFront, leafBack] = [fL, tR, fR, tL];
      } else {
        [left, right, leafFront, leafBack] = [tL, fR, fL, tR];
      }
    } else {
      [left, right] = spread(current);
    }
    const leafSide = anim?.dir === 1 ? 'right' : 'left';
    content = (
      <div className="book double" style={{ width: pageW * 2, height: pageH }}>
        <div className="slot slot-left">{renderPage(left, 'left', !anim)}</div>
        <div className="slot slot-right">{renderPage(right, 'right', !anim)}</div>
        {anim && (
          <div ref={leafRef} className={`leaf leaf-${leafSide}`}>
            <div className="leaf-face">
              {renderPage(leafFront, leafSide === 'right' ? 'right' : 'left', false)}
            </div>
            <div className="leaf-face leaf-back">
              {renderPage(leafBack, leafSide === 'right' ? 'left' : 'right', false)}
            </div>
          </div>
        )}
      </div>
    );
  }

  const pageLabel =
    firstVisible === lastVisible ? `${firstVisible}` : `${firstVisible}–${lastVisible}`;

  return (
    <div className="viewer" style={{ '--accent': notebook.color } as CSSProperties}>
      <header className="viewer-bar">
        <Link href="/" className="bar-btn" aria-label="Retour aux classes">
          ← <span className="hide-sm">Classes</span>
        </Link>
        <div className="bar-title">
          <span className="class-badge">{notebook.label}</span>
          <span className="hide-sm">{notebook.title}</span>
        </div>
        <div className="bar-nav">
          <button className="bar-btn" onClick={prev} disabled={!canPrev || !!anim} aria-label="Page précédente">
            ‹
          </button>
          <PageJump label={pageLabel} total={n} onGo={goTo} />
          <button className="bar-btn" onClick={next} disabled={!canNext || !!anim} aria-label="Page suivante">
            ›
          </button>
        </div>
        <div className="bar-actions">
          {openFlaps.size > 0 && (
            <button className="bar-btn" onClick={() => setOpenFlaps(new Set())}>
              Refermer<span className="hide-sm"> les rabats</span>
            </button>
          )}
          {n >= 2 && (
            <button className="bar-btn primary" onClick={() => goTo(2)}>
              Sommaire
            </button>
          )}
        </div>
      </header>

      <div
        ref={stageRef}
        className="stage"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {size.w > 0 && content}
        {!single && n > 0 && (
          <>
            <button className="side-arrow left" onClick={prev} disabled={!canPrev || !!anim} aria-label="Page précédente">
              ‹
            </button>
            <button className="side-arrow right" onClick={next} disabled={!canNext || !!anim} aria-label="Page suivante">
              ›
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PageJump({ label, total, onGo }: { label: string; total: number; onGo: (p: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  if (!editing) {
    return (
      <button
        className="page-indicator"
        onClick={() => {
          setValue('');
          setEditing(true);
        }}
        title="Aller à une page"
      >
        Page {label} <span className="muted">/ {total}</span>
      </button>
    );
  }
  return (
    <form
      className="page-indicator"
      onSubmit={(e) => {
        e.preventDefault();
        const p = Number(value);
        if (p) onGo(p);
        setEditing(false);
      }}
    >
      Page{' '}
      <input
        autoFocus
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
        onBlur={() => setEditing(false)}
        aria-label="Numéro de page"
        placeholder={label}
      />{' '}
      <span className="muted">/ {total}</span>
    </form>
  );
}
