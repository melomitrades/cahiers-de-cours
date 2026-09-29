'use client';

import { memo, type CSSProperties } from 'react';
import type { FlapZone, Rect, ViewPage } from '@/lib/types';
import { useCrops, usePageImage } from './usePdf';

export const rectStyle = (r: Rect): CSSProperties => ({
  left: `${r.x * 100}%`,
  top: `${r.y * 100}%`,
  width: `${r.w * 100}%`,
  height: `${r.h * 100}%`,
});

type Props = {
  page: ViewPage;
  side?: 'left' | 'right' | 'single';
  openFlaps?: Set<number>;
  onToggleFlap?: (id: number) => void;
  onLink?: (pageNumber: number) => void;
  interactive?: boolean;
  showNumber?: boolean;
};

function BookPageInner({
  page,
  side = 'single',
  openFlaps,
  onToggleFlap,
  onLink,
  interactive = true,
  showNumber = true,
}: Props) {
  const { src, error } = usePageImage(page.course);
  const crops = useCrops(page.pieces, page.flaps);

  return (
    <div className={`book-page side-${side}`} aria-label={`Page ${page.number}`}>
      {page.course &&
        (src ? (
          <img className="page-img" src={src} alt={`Page ${page.number}`} draggable={false} />
        ) : (
          <div className="page-status">{error ? 'Impossible d’afficher ce PDF' : <span className="spinner" />}</div>
        ))}

      {page.links.map((l) =>
        l.target ? (
          <button
            key={l.id}
            type="button"
            className="zone-link"
            style={rectStyle(l)}
            tabIndex={interactive ? 0 : -1}
            aria-label={`Aller à la page ${l.target}`}
            title={`Aller à la page ${l.target}`}
            onClick={(e) => {
              e.stopPropagation();
              if (interactive) onLink?.(l.target!);
            }}
          />
        ) : null
      )}

      {page.pieces &&
        page.flaps.map((f) => (
          <Flap
            key={f.id}
            flap={f}
            src={crops[f.id]}
            open={openFlaps?.has(f.id) ?? false}
            interactive={interactive}
            onToggle={() => onToggleFlap?.(f.id)}
          />
        ))}

      {showNumber && <span className="page-number">{page.number}</span>}
      <div className="page-shade" />
    </div>
  );
}

export const BookPage = memo(BookPageInner);

export function Flap({
  flap,
  src,
  open,
  interactive = true,
  onToggle,
}: {
  flap: FlapZone;
  src?: string;
  open: boolean;
  interactive?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={`flap${open ? ' is-open' : ''}`} style={rectStyle(flap)}>
      <button
        type="button"
        className={`flap-inner hinge-${flap.hinge}`}
        tabIndex={interactive ? 0 : -1}
        aria-pressed={open}
        aria-label={open ? 'Refermer le rabat' : 'Ouvrir le rabat'}
        onClick={(e) => {
          e.stopPropagation();
          if (interactive) onToggle?.();
        }}
      >
        <span className="flap-face flap-front">
          {src ? <img src={src} alt="" draggable={false} /> : null}
        </span>
        <span className="flap-face flap-back" />
      </button>
    </div>
  );
}
