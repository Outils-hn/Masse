-- ETAPE 0 : SAUVEGARDE DE L'ANCIEN PROJET (celui de Masse, kkxq...). Ne modifie rien : lecture seule.
-- Supabase > ancien projet > SQL Editor > New query > Run.
-- Le resultat est UNE seule cellule « sauvegarde » (du JSON) : copie sa valeur et enregistre-la dans un fichier
-- « sauvegarde-masse-2026-11.json » (ou « Download CSV » si le bouton est propose). Garde ce fichier.
-- Elle sert a la fois de filet de securite ET de source pour l'etape 2 (import dans le projet d'Index).
-- Les lignes de la corbeille sont incluses. Le PIN n'est pas exporte (il est hache) : tu le redefiniras.

select jsonb_build_object(
  'exporte_le', now(),
  'materials',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.materials t), '[]'::jsonb),
  'elements',         coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.elements t), '[]'::jsonb),
  'components',       coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.components t), '[]'::jsonb),
  'lists',            coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.lists t), '[]'::jsonb),
  'list_items',       coalesce((select jsonb_agg(to_jsonb(t)) from public.list_items t), '[]'::jsonb),
  'format_materiaux', coalesce((select jsonb_agg(to_jsonb(t)) from public.format_materiaux t), '[]'::jsonb),
  'strate_catalogue', coalesce((select jsonb_agg(to_jsonb(t)) from public.strate_catalogue t), '[]'::jsonb)
) as sauvegarde;
