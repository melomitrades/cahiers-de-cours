# Cahiers de cours

Un site Next.js pour publier des cahiers de cours à feuilleter, classe par classe (6ème, 5ème, 4ème…).

- **Accueil** : un bouton par classe, chacun ouvre son cahier.
- **Cahier feuilletable** : double page sur ordinateur, une page à la fois sur téléphone, avec une animation de page qui tourne. Les pages sont numérotées. On peut tourner les pages avec les flèches du clavier ou en glissant le doigt. Le bouton « Sommaire » ramène à la page 2.
- **Pages** : une page sans PDF reste blanche. Tu peux déposer un PDF d'une ou de plusieurs pages (chaque page du PDF devient une page du cahier).
- **Sommaire cliquable** : sur la page 2 (ou sur n'importe quelle autre page), tu dessines des zones qui mènent à une page donnée.
- **Cours à manipuler** (à activer cahier par cahier) : chaque page peut recevoir un 2e PDF qui contient les pièces à coller. Tu dessines les rabats sur la page et tu choisis de quel côté se trouve la charnière. L'élève clique pour soulever le rabat et voir le cours en dessous.

Technique : Next.js (App Router), base de données Postgres **Neon**, fichiers PDF sur **Vercel Blob**, rendu des PDF dans le navigateur avec pdf.js.

---

## Mise en ligne sur Vercel (environ 10 minutes)

### 1. Mettre le code sur GitHub

1. Crée un compte sur <https://github.com> si tu n'en as pas.
2. Crée un nouveau dépôt, par exemple `cahiers-de-cours`. Il peut être privé.
3. Dépose-y le contenu de ce dossier : bouton **Add file → Upload files**, puis glisse tous les fichiers et dossiers.

### 2. Créer le projet sur Vercel

1. Va sur <https://vercel.com> et connecte-toi avec ton compte GitHub.
2. Clique sur **Add New… → Project**, choisis le dépôt `cahiers-de-cours`, puis **Deploy**.
   Ce premier déploiement fonctionne mais affiche « Presque prêt ! », car la base de données n'est pas encore branchée.

### 3. Ajouter la base de données Neon

1. Dans ton projet Vercel, ouvre l'onglet **Storage → Create Database** et choisis **Neon** (Serverless Postgres).
2. Accepte les options par défaut. Choisis une région proche de toi, par exemple Frankfurt.
3. Relie la base au projet. Vercel ajoute tout seul la variable `DATABASE_URL`.

### 4. Ajouter le stockage des PDF (Vercel Blob)

1. Toujours dans **Storage → Create Database**, choisis **Blob**.
2. Relie-le au projet. Vercel s'occupe tout seul de la connexion : selon la version, il ajoute `BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN`, et il n'y a rien à copier.

> Les PDF de plus de 4 Mo ne peuvent être envoyés que si la variable `BLOB_READ_WRITE_TOKEN` existe. Sinon, compresse-les (ilovepdf.com → Compresser) ou découpe-les en plusieurs fichiers.

### 5. Choisir ton mot de passe

Dans **Settings → Environment Variables**, ajoute :

| Nom              | Valeur                                                    |
| ---------------- | --------------------------------------------------------- |
| `ADMIN_PASSWORD` | le mot de passe de ton espace enseignant                  |
| `SESSION_SECRET` | une longue suite de caractères au hasard (facultatif)     |

### 6. Redéployer

Onglet **Deployments** → les trois points du dernier déploiement → **Redeploy**.

Les tables de la base et les cahiers 6ème, 5ème et 4ème sont créés automatiquement pendant ce déploiement.

C'est en ligne ! L'adresse ressemble à `https://cahiers-de-cours.vercel.app`. Tu peux brancher ton propre nom de domaine dans **Settings → Domains**.

---

## Utilisation au quotidien

1. Va sur `https://ton-site.vercel.app/admin` et connecte-toi avec ton mot de passe.
2. **Mes cahiers** : tu peux renommer une classe, changer sa couleur ou son titre, et cocher **Cours à manipuler**. Tu peux aussi ajouter une classe (3ème…).
3. **Gérer les pages** :
   - **+ PDF de cours** : choisis un PDF. S'il a plusieurs pages, tu peux n'en garder qu'une partie. Tu choisis ensuite soit de créer de nouvelles pages, soit de remplacer des pages existantes, à partir du numéro que tu indiques.
   - **+ PDF à manipuler** : le PDF des pièces, associé aux pages à partir du numéro que tu indiques.
   - **+ Page blanche**. Les flèches ← → déplacent une page, le **+** insère une page blanche après, le **×** supprime.
4. **Clique sur une page** pour ouvrir l'éditeur :
   - **Sommaire (page 2)** : choisis « Lien vers une page », trace un rectangle sur la ligne d'un chapitre, puis indique le numéro de la page visée.
   - **Rabats** : choisis « Rabat » et trace un rectangle sur la partie qui se soulève (pas sur la languette à coller). Le site découpe automatiquement la pièce au même endroit dans le PDF à manipuler. Choisis ensuite le côté de la charnière. Le curseur de transparence superpose les pièces sur le cours pour t'aider à les placer.
   - Pour une pièce qui s'ouvre en deux portes, comme « 4 × 5 = 14 + 6 », dessine deux rabats : l'un avec la charnière à gauche, l'autre avec la charnière à droite.
   - Coche **Aperçu élève** pour tester.

> Tes deux PDF (cours et pièces) doivent avoir exactement la même mise en page : même format A4 et pièces placées au même endroit que la zone qu'elles recouvrent. C'est déjà le cas de ton exemple « A1 – Opérations ».

Lien direct vers une page à donner aux élèves : `https://ton-site.vercel.app/cahier/6eme?page=12`

---

## Travailler en local (facultatif)

```bash
npm install
cp .env.example .env.local   # puis remplis DATABASE_URL et ADMIN_PASSWORD
npm run db:migrate
npm run dev                  # http://localhost:3000
```

Sans Vercel Blob configuré, les PDF sont enregistrés dans le dossier `.local-uploads/`. Cela ne fonctionne qu'en local.

## Organisation du code

```
app/
  page.tsx                       Accueil (choix de la classe)
  cahier/[slug]/page.tsx         Cahier feuilletable
  admin/login                    Connexion
  admin/(protected)/…            Espace enseignant
  admin/actions.ts               Toutes les modifications (actions serveur)
  api/blob                       Téléversement vers Vercel Blob
components/
  Flipbook.tsx                   Le livre et l'animation de page
  BookPage.tsx                   Une page : PDF, liens, rabats
  admin/PageEditor.tsx           Éditeur de zones (liens / rabats)
  admin/PagesManager.tsx         Liste des pages, ajout de PDF
lib/
  pdf-client.ts                  Rendu des PDF (pdf.js) + découpe des rabats
  data.ts / db.ts                Accès à la base Neon
scripts/migrate.mjs              Création des tables (lancé à chaque build)
```
