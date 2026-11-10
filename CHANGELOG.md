# Journal des versions — Masse

Le numéro de version se met à jour dans `src/lib/version.ts` (pied de page et fenêtre « À propos » le lisent).

Chaque version qui change quelque chose de visible pour l'équipe a une puce « Nouveauté : … », en langage courant : c'est la seule phrase affichée sur la page « Nouveautés » de l'Accueil.

## 2.26 — 10 novembre 2026

- Nouveauté : le logo en haut à gauche de l'appli est maintenant le même que sur l'Accueil (pastille de couleur et pictogramme).
- Nouveauté : en haut à droite, le nom s'affiche (Prénom NOM) à la place de l'adresse mail.
- Nouveauté : un fondu doux quand on passe d'une appli à l'autre ou qu'on revient à l'Accueil (sur les navigateurs récents).

## 2.25 — 10 novembre 2026

- Nouveauté : chaque appli a maintenant son logo comme icône d'onglet et d'écran d'accueil, le même que sur l'Accueil.

## 2.24 — 10 novembre 2026

- Nouveauté : un bouton « Rechercher » (Ctrl K) en haut à droite, comme sur l'Accueil, dans toutes les applis. Il remplace la ligne « Rechercher » du menu des applis.

## 2.23 — 10 novembre 2026

- Nouveauté : le menu des applis suit l'ordre d'usage : Check, Index, Access, puis Trame, Linear, Format, puis les autres.

## 2.22 — 10 novembre 2026

- Retrait de la ligne « Noter » du menu des applis (menu plus léger). Les boutons « Noter dans Check » des fiches, fournisseurs et éléments restent.

## 2.21 — 10 novembre 2026

- Nouveauté : la touche ? (ou « Raccourcis » en bas du menu des applis) affiche les raccourcis clavier de l'appli. Les icônes Rechercher et Noter du menu de Joint, Membrane et Strate sont maintenant comme dans les autres applis.

## 2.20 — 10 novembre 2026

- Nouveauté : le menu des applis propose « Noter » : ouvre Check dans un nouvel onglet avec une note déjà commencée par le numéro du chantier choisi dans l'Accueil.

## 2.19 — 10 novembre 2026

- Nouveauté : dans le menu des applis, la ligne « Rechercher » est alignée avec les autres.

## 2.18 — 10 novembre 2026

- Nouveauté : Ctrl+K ouvre la recherche de l'Accueil (applis, chantiers, fiches Index, notes Check) dans un nouvel onglet ; le menu de l'appli propose aussi « Rechercher ».

## 2.17 — 10 novembre 2026

- Nouveauté : un bouton « Noter dans Check » ouvre Check avec une note déjà rédigée (élément, dimensions et poids).

## 2.16 — 9 novembre 2026

- Nouveauté : au téléphone, les pourcentages du tableau de résultats ne se coupent plus en deux lignes, et un léger fondu indique qu'il reste des onglets à droite.

## 2.15 — 9 novembre 2026

- Nouveauté : au téléphone, les liens du pied de page (« Conçu par », « Sauvegarde », « Suggestion / bug ») se touchent plus facilement.

## 2.14 — 9 novembre 2026

- Nouveauté : un résultat qui s'arrondit à zéro s'affiche « 0,00 » et plus jamais « -0,00 » ; la lecture des nombres suit la même règle que les autres applis.

## 2.13 — 8 novembre 2026

- Technique : les données sont passées sur le nouveau serveur Supabase en Suisse (adresse, clé et mémoire de connexion mises à jour). Il faut se reconnecter une fois.

## 2.12 — 7 novembre 2026

- Nouveauté : le menu des applis propose maintenant Joint (dilatation et joints) et Membrane (étanchéité).

## 2.11 — 6 novembre 2026

- Le menu des applis propose Joint (en préparation), pour le concepteur seulement : aucune Nouveauté à annoncer à l'équipe.

## 2.10 — 4 novembre 2026

- Nouveauté : sans compte, on ne peut plus exporter ni importer de fichier JSON (page Corbeille et sauvegarde) : un message invite à se connecter avec son compte Index.

## 2.9 — 4 novembre 2026

- Nouveauté : le bandeau affiche seulement l'adresse email quand on est connecté (sans « Connecté · »), comme dans toutes les autres applis.

## 2.8 — 4 novembre 2026

- Nouveauté : plus de code PIN dans Masse. Pour modifier, on se connecte avec son compte Index (mêmes email et mot de passe, compte validé par un collègue) ; la connexion est partagée avec Index. Sans compte, Masse reste consultable en lecture seule.
- Bandeau : « Se connecter » / « Connecté · email » / « Se déconnecter » ; un compte pas encore validé voit « Compte à valider · lecture seule ».
- Base : script `supabase/masse-comptes.sql` (fonctions d'écriture réservées aux comptes validés). Les anciennes fonctions à PIN restent pour Format et Strate.
- Avant la mise en ligne : coller ce script dans le SQL Editor de Supabase (projet Index).

## 2.7 — 4 novembre 2026

- Nouveauté : la base de données de Masse est maintenant dans le même projet Supabase que Index, Access et Check (un seul projet à gérer). Rien ne change à l'usage : mêmes données, même code PIN.
- Scripts de migration dans `supabase/migration-vers-index/` (sauvegarde de l'ancien projet, installation, import des données).
- Avant la mise en ligne : sauvegarde puis installation dans Supabase (voir ces scripts).

## 2.6 — 1er novembre 2026

- Nouveauté : sur téléphone, Masse s'affiche sans déborder, et un bouton « Déverrouiller » permet de passer en modification.
- Les largeurs et hauteurs gardent leurs décimales à l'affichage (1200,75 n'est plus montré comme 1201).
- Bouton « Déverrouiller » dans le bandeau et phrase d'aide dans la fenêtre du code PIN.
- Boutons plus grands sur téléphone (40 px), bandeau resserré.

## 2.5 — 1er novembre 2026

- Nouveauté : le mode clair ou sombre que tu choisis dans une appli est repris dans toutes les autres.
- Le réglage clair / sombre est aussi enregistré dans une clé commune à toutes les applis (`outils-theme`, même site) ; la clé propre à l'appli est conservée.

## 2.4 — 31 octobre 2026

- Toutes les applis sont maintenant sur GitHub Pages : le sélecteur d'applis pointe vers `https://outils-hn.github.io/<Appli>/` à la place des adresses Lovable. Les liens vers les fiches d'Index (`?fiche=`, `?q=`, création de compte) ouvrent `https://outils-hn.github.io/Index/`.

## 2.3 — 31 octobre 2026

- Onglet actif correct quand on ouvre directement une page (ex. `/Masse/listes`) : avant, « Éléments » restait surligné.

## 2.2 — 31 octobre 2026

- Publication sur GitHub Pages (`https://outils-hn.github.io/Masse/`) : l'appli est construite en mode SPA statique, sans serveur.
- Nouveau workflow « Pages » : construction avec le sous-dossier `/Masse/`, page de repli `404.html`, déploiement automatique à chaque fusion sur `main`.
- Pages « Page introuvable » et « Cette page ne s'est pas chargée » en français.

## 2.1 — 31 octobre 2026

- Adresses mises à jour après le renommage du compte GitHub en `outils-hn` : « Suggestion / bug » ouvre l'Accueil sur `https://outils-hn.github.io/`, et le sélecteur d'applis pointe vers Strate (`https://outils-hn.github.io/Strate/`) et Trame (`https://outils-hn.github.io/Trame/`), publiées sur GitHub Pages.
