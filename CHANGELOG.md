# Journal des versions — Masse

Le numéro de version se met à jour dans `src/lib/version.ts` (pied de page et fenêtre « À propos » le lisent).

Chaque version qui change quelque chose de visible pour l'équipe a une puce « Nouveauté : … », en langage courant : c'est la seule phrase affichée sur la page « Nouveautés » de l'Accueil.

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
