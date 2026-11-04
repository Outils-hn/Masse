-- ETAPE 2 : COPIER LES DONNEES DE L'ANCIEN PROJET DANS CELUI D'INDEX (apres l'etape 1).
-- Supabase > projet d'INDEX > SQL Editor > New query.
-- 1) Remplace la ligne  COLLE_ICI_LE_JSON_DE_LA_SAUVEGARDE  par le contenu de ton fichier de sauvegarde (etape 0),
--    SANS toucher aux deux lignes  $json$  qui l'entourent.
-- 2) Run. Le script remplace les donnees d'exemple de Masse par tes vraies donnees et affiche le nombre de lignes copiees.
-- Il est sans risque pour Index, Access et Check (il ne touche que les tables de Masse, Format et Strate).

do $import$
declare j jsonb := $json$COLLE_ICI_LE_JSON_DE_LA_SAUVEGARDE$json$::jsonb;
begin
  if j->'materials' is null then raise exception 'JSON incomplet : colle bien tout le contenu de la sauvegarde.'; end if;

  truncate public.list_items, public.components, public.lists, public.elements, public.materials,
           public.format_materiaux, public.strate_catalogue;

  insert into public.materials   select * from jsonb_populate_recordset(null::public.materials,   j->'materials');
  insert into public.elements    select * from jsonb_populate_recordset(null::public.elements,    j->'elements');
  insert into public.components  select * from jsonb_populate_recordset(null::public.components,  j->'components');
  insert into public.lists       select * from jsonb_populate_recordset(null::public.lists,       j->'lists');
  insert into public.list_items  select * from jsonb_populate_recordset(null::public.list_items,  j->'list_items');
  insert into public.format_materiaux select * from jsonb_populate_recordset(null::public.format_materiaux, j->'format_materiaux');
  insert into public.strate_catalogue select * from jsonb_populate_recordset(null::public.strate_catalogue, j->'strate_catalogue');
end $import$;

-- Controle : compare ces nombres a ceux de la sauvegarde.
select 'materials' as table_, count(*) from public.materials
union all select 'elements', count(*) from public.elements
union all select 'components', count(*) from public.components
union all select 'lists', count(*) from public.lists
union all select 'list_items', count(*) from public.list_items
union all select 'format_materiaux', count(*) from public.format_materiaux
union all select 'strate_catalogue', count(*) from public.strate_catalogue;
