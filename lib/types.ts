export type Hinge = 'top' | 'bottom' | 'left' | 'right';
export type ZoneKind = 'link' | 'flap';

export type Rect = { x: number; y: number; w: number; h: number };

/** Une page précise d'un fichier PDF. `page` commence à 1. */
export type DocRef = { url: string; page: number };

export type LinkZone = Rect & { id: number; target: number | null };
export type FlapZone = Rect & { id: number; hinge: Hinge };

/** Données envoyées au lecteur (côté élève). */
export type ViewPage = {
  id: number;
  number: number;
  course: DocRef | null;
  pieces: DocRef | null;
  links: LinkZone[];
  flaps: FlapZone[];
};

export type DocInfo = { id: number; name: string; pageCount: number };

/** Données enrichies pour l'administration. */
export type AdminPage = ViewPage & {
  courseDoc: DocInfo | null;
  piecesDoc: DocInfo | null;
};

export type Notebook = {
  id: number;
  slug: string;
  label: string;
  title: string;
  color: string;
  position: number;
  manipulable: boolean;
};

/** PDF qui vient d'être téléversé (avant enregistrement en base). */
export type UploadedDoc = { url: string; name: string; pageCount: number };

export const PAGE_RATIO = 297 / 210; // A4 portrait : hauteur / largeur
