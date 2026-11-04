-- ETAPE 1 : INSTALLER MASSE, FORMAT ET STRATE DANS LE PROJET D'INDEX (ngfz...).
-- Supabase > projet d'INDEX > SQL Editor > New query > Run. A lancer UNE SEULE FOIS.
-- Aucun nom ne rentre en conflit avec Index, Access ou Check (leurs tables : products, categories, suppliers,
-- profiles, projects, product_projects, check_*, access_*). Si Masse est deja installe, le script s'arrete tout de suite.

do $$ begin
  if to_regclass('public.materials') is not null or to_regclass('public.app_config') is not null then
    raise exception 'Masse est deja installe dans ce projet : rien n''a ete modifie.';
  end if;
end $$;

-- =====================================================================
-- Masse : tables, regles d'acces, fonctions PIN
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'autre',
  mode text not null default 'density',
  value numeric not null default 0,
  source text not null default '',
  note text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.elements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  length_mm numeric not null default 1000,
  height_mm numeric not null default 1000,
  markup_pct numeric not null default 5,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.components (
  id uuid primary key default gen_random_uuid(),
  element_id uuid not null references public.elements(id) on delete cascade,
  material_id uuid not null references public.materials(id),
  position int not null default 0,
  label text not null default '',
  thickness_mm numeric not null default 0,
  faces numeric not null default 1,
  length_m numeric not null default 0,
  count numeric not null default 1,
  custom_area_m2 numeric,
  glass_composition text not null default '',
  created_at timestamptz not null default now()
);
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  element_id uuid not null references public.elements(id),
  quantity numeric not null default 1,
  position int not null default 0
);
create table public.app_config (
  id int primary key default 1 check (id = 1),
  pin_hash text,
  failed_attempts int not null default 0,
  locked_until timestamptz
);
insert into public.app_config (id) values (1);

grant select on public.materials, public.elements, public.components, public.lists, public.list_items to anon, authenticated;
grant all on public.materials, public.elements, public.components, public.lists, public.list_items, public.app_config to service_role;

alter table public.materials enable row level security;
alter table public.elements enable row level security;
alter table public.components enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.app_config enable row level security;

create policy "read materials" on public.materials for select to anon, authenticated using (true);
create policy "read elements" on public.elements for select to anon, authenticated using (true);
create policy "read components" on public.components for select to anon, authenticated using (true);
create policy "read lists" on public.lists for select to anon, authenticated using (true);
create policy "read list_items" on public.list_items for select to anon, authenticated using (true);

-- PIN check: never raises, so the failure counter persists
create or replace function public._check_pin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c public.app_config;
begin
  select * into c from public.app_config where id = 1 for update;
  if c.pin_hash is null then return 'Aucun PIN n''est défini. Définissez-le dans l''éditeur SQL Supabase.'; end if;
  if c.locked_until is not null and c.locked_until > now() then
    return 'Trop d''essais incorrects. Réessayez après ' || to_char(c.locked_until at time zone 'Europe/Zurich', 'HH24:MI') || '.';
  end if;
  if crypt(coalesce(p_pin,''), c.pin_hash) = c.pin_hash then
    update public.app_config set failed_attempts = 0, locked_until = null where id = 1;
    return null;
  end if;
  update public.app_config set failed_attempts = c.failed_attempts + 1,
    locked_until = case when c.failed_attempts + 1 >= 5 then now() + interval '5 minutes' else null end,
    failed_attempts = case when c.failed_attempts + 1 >= 5 then 0 else c.failed_attempts + 1 end
  where id = 1;
  if c.failed_attempts + 1 >= 5 then return 'PIN incorrect. Modifications bloquées pendant 5 minutes.'; end if;
  return 'PIN incorrect (' || (5 - c.failed_attempts - 1) || ' essai(s) restant(s)).';
end $$;
revoke all on function public._check_pin(text) from public, anon, authenticated;

create or replace function public._purge_trash() returns void
language sql security definer set search_path = public as $$
  delete from public.lists where deleted_at < now() - interval '30 days';
  delete from public.list_items where element_id in (select id from public.elements where deleted_at < now() - interval '30 days');
  delete from public.elements where deleted_at < now() - interval '30 days';
  delete from public.materials m where deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.components c where c.material_id = m.id);
$$;
revoke all on function public._purge_trash() from public, anon, authenticated;

create or replace function public.verify_pin(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.save_material(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(trim(p->>'name'),'') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  if p->>'mode' not in ('density','surface','linear','unit') then return jsonb_build_object('ok', false, 'error', 'Mode de calcul invalide.'); end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.materials (name, category, mode, value, source, note)
    values (trim(p->>'name'), coalesce(p->>'category','autre'), p->>'mode', coalesce((p->>'value')::numeric,0), coalesce(p->>'source',''), coalesce(p->>'note',''))
    returning id into v_id;
  else
    update public.materials set name = trim(p->>'name'), category = coalesce(p->>'category','autre'), mode = p->>'mode',
      value = coalesce((p->>'value')::numeric,0), source = coalesce(p->>'source',''), note = coalesce(p->>'note',''), updated_at = now()
    where id = v_id;
  end if;
  perform public._purge_trash();
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.save_element(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid; c jsonb; i int := 0;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(trim(p->>'name'),'') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.elements (name, description, length_mm, height_mm, markup_pct)
    values (trim(p->>'name'), coalesce(p->>'description',''), coalesce((p->>'length_mm')::numeric,0), coalesce((p->>'height_mm')::numeric,0), coalesce((p->>'markup_pct')::numeric,5))
    returning id into v_id;
  else
    update public.elements set name = trim(p->>'name'), description = coalesce(p->>'description',''),
      length_mm = coalesce((p->>'length_mm')::numeric,0), height_mm = coalesce((p->>'height_mm')::numeric,0),
      markup_pct = coalesce((p->>'markup_pct')::numeric,5), updated_at = now()
    where id = v_id;
    delete from public.components where element_id = v_id;
  end if;
  for c in select * from jsonb_array_elements(coalesce(p->'components','[]'::jsonb)) loop
    insert into public.components (element_id, material_id, position, label, thickness_mm, faces, length_m, count, custom_area_m2, glass_composition)
    values (v_id, (c->>'material_id')::uuid, i, coalesce(c->>'label',''), coalesce((c->>'thickness_mm')::numeric,0), coalesce((c->>'faces')::numeric,1),
      coalesce((c->>'length_m')::numeric,0), coalesce((c->>'count')::numeric,1), nullif(c->>'custom_area_m2','')::numeric, coalesce(c->>'glass_composition',''));
    i := i + 1;
  end loop;
  perform public._purge_trash();
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.save_list(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid; c jsonb; i int := 0;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(trim(p->>'name'),'') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.lists (name) values (trim(p->>'name')) returning id into v_id;
  else
    update public.lists set name = trim(p->>'name'), updated_at = now() where id = v_id;
    delete from public.list_items where list_id = v_id;
  end if;
  for c in select * from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) loop
    insert into public.list_items (list_id, element_id, quantity, position)
    values (v_id, (c->>'element_id')::uuid, coalesce((c->>'quantity')::numeric,1), i);
    i := i + 1;
  end loop;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.set_deleted(p_pin text, p_table text, p_id uuid, p_deleted boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_table = 'materials' then
    if p_deleted and exists (select 1 from public.components c join public.elements el on el.id = c.element_id
                             where c.material_id = p_id and el.deleted_at is null) then
      return jsonb_build_object('ok', false, 'error', 'Ce matériau est utilisé dans un élément : suppression impossible.');
    end if;
    update public.materials set deleted_at = case when p_deleted then now() end, updated_at = now() where id = p_id;
  elsif p_table = 'elements' then
    if not p_deleted and exists (select 1 from public.components c join public.materials m on m.id = c.material_id
                                 where c.element_id = p_id and m.deleted_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'Restaurez d''abord les matériaux utilisés par cet élément.');
    end if;
    update public.elements set deleted_at = case when p_deleted then now() end, updated_at = now() where id = p_id;
  elsif p_table = 'lists' then
    update public.lists set deleted_at = case when p_deleted then now() end, updated_at = now() where id = p_id;
  else
    return jsonb_build_object('ok', false, 'error', 'Table inconnue.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.import_all(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; r jsonb; n int := 0;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  for r in select * from jsonb_array_elements(coalesce(p->'materials','[]')) loop
    insert into public.materials (id, name, category, mode, value, source, note, deleted_at, updated_at)
    values ((r->>'id')::uuid, r->>'name', coalesce(r->>'category','autre'), r->>'mode', (r->>'value')::numeric, coalesce(r->>'source',''), coalesce(r->>'note',''), (r->>'deleted_at')::timestamptz, coalesce((r->>'updated_at')::timestamptz, now()))
    on conflict (id) do update set name = excluded.name, category = excluded.category, mode = excluded.mode, value = excluded.value,
      source = excluded.source, note = excluded.note, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'elements','[]')) loop
    insert into public.elements (id, name, description, length_mm, height_mm, markup_pct, deleted_at, updated_at)
    values ((r->>'id')::uuid, r->>'name', coalesce(r->>'description',''), (r->>'length_mm')::numeric, (r->>'height_mm')::numeric, coalesce((r->>'markup_pct')::numeric,5), (r->>'deleted_at')::timestamptz, coalesce((r->>'updated_at')::timestamptz, now()))
    on conflict (id) do update set name = excluded.name, description = excluded.description, length_mm = excluded.length_mm,
      height_mm = excluded.height_mm, markup_pct = excluded.markup_pct, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
    delete from public.components where element_id = (r->>'id')::uuid;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'components','[]')) loop
    insert into public.components (element_id, material_id, position, label, thickness_mm, faces, length_m, count, custom_area_m2, glass_composition)
    values ((r->>'element_id')::uuid, (r->>'material_id')::uuid, coalesce((r->>'position')::int,0), coalesce(r->>'label',''), coalesce((r->>'thickness_mm')::numeric,0),
      coalesce((r->>'faces')::numeric,1), coalesce((r->>'length_m')::numeric,0), coalesce((r->>'count')::numeric,1), nullif(r->>'custom_area_m2','')::numeric, coalesce(r->>'glass_composition',''));
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'lists','[]')) loop
    insert into public.lists (id, name, deleted_at, updated_at)
    values ((r->>'id')::uuid, r->>'name', (r->>'deleted_at')::timestamptz, coalesce((r->>'updated_at')::timestamptz, now()))
    on conflict (id) do update set name = excluded.name, deleted_at = excluded.deleted_at, updated_at = excluded.updated_at;
    delete from public.list_items where list_id = (r->>'id')::uuid;
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p->'list_items','[]')) loop
    insert into public.list_items (list_id, element_id, quantity, position)
    values ((r->>'list_id')::uuid, (r->>'element_id')::uuid, coalesce((r->>'quantity')::numeric,1), coalesce((r->>'position')::int,0));
  end loop;
  return jsonb_build_object('ok', true, 'count', n);
end $$;

grant execute on function public.verify_pin(text), public.save_material(text, jsonb), public.save_element(text, jsonb),
  public.save_list(text, jsonb), public.set_deleted(text, text, uuid, boolean), public.import_all(text, jsonb) to anon, authenticated;

insert into public.materials (name, category, mode, value, source) values
('Aluminium','metal','density',2700,'valeur standard à vérifier'),
('Acier','metal','density',7850,'valeur standard à vérifier'),
('Inox','metal','density',7900,'valeur standard à vérifier'),
('Zinc','metal','density',7200,'valeur standard à vérifier'),
('Cuivre','metal','density',8900,'valeur standard à vérifier'),
('Verre','verre','density',2500,'valeur standard à vérifier'),
('Intercalaire PVB','verre','density',1070,'valeur standard à vérifier'),
('Laine de roche','isolant','density',100,'valeur standard à vérifier'),
('Laine de verre','isolant','density',20,'valeur standard à vérifier'),
('PIR','isolant','density',32,'valeur standard à vérifier'),
('EPS','isolant','density',20,'valeur standard à vérifier'),
('XPS','isolant','density',35,'valeur standard à vérifier'),
('Panneau composite alu 4 mm','panneau','surface',7.6,'valeur standard à vérifier'),
('Plaque de plâtre 12,5 mm','panneau','surface',9,'valeur standard à vérifier');

-- =====================================================================
-- Masse : correctif du blocage apres 5 PIN faux
-- =====================================================================
-- Correctif : le blocage apres 5 PIN faux ne fonctionnait pas.
-- L'ancienne version modifiait deux fois la colonne failed_attempts dans le meme
-- UPDATE : Postgres refusait la requete, la fonction plantait, et le compteur
-- d'essais ne bougeait jamais (essais illimites + message technique a l'ecran).
create or replace function public._check_pin(p_pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  c public.app_config;
  v_attempts int;
begin
  select * into c from public.app_config where id = 1 for update;
  if c.pin_hash is null then
    return 'Aucun PIN n''est défini. Définissez-le dans l''éditeur SQL Supabase.';
  end if;
  if c.locked_until is not null and c.locked_until > now() then
    return 'Trop d''essais incorrects. Réessayez après '
      || to_char(c.locked_until at time zone 'Europe/Zurich', 'HH24:MI') || '.';
  end if;
  if crypt(coalesce(p_pin, ''), c.pin_hash) = c.pin_hash then
    update public.app_config set failed_attempts = 0, locked_until = null where id = 1;
    return null;
  end if;

  v_attempts := c.failed_attempts + 1;
  if v_attempts >= 5 then
    -- 5e erreur : on bloque 5 minutes et on remet le compteur a zero pour la suite
    update public.app_config set failed_attempts = 0, locked_until = now() + interval '5 minutes' where id = 1;
    return 'PIN incorrect. Modifications bloquées pendant 5 minutes.';
  end if;
  update public.app_config set failed_attempts = v_attempts, locked_until = null where id = 1;
  return 'PIN incorrect (' || (5 - v_attempts) || ' essai(s) restant(s)).';
end $$;
revoke all on function public._check_pin(text) from public, anon, authenticated;

-- Correctif : la purge de la corbeille (30 jours) retirait en silence les lignes
-- des listes qui utilisaient l'element purge -> le poids d'une livraison baissait
-- sans prevenir. Desormais un element reste conserve tant qu'une liste
-- (meme a la corbeille) l'utilise ; la liste l'affiche "dans la corbeille".
create or replace function public._purge_trash() returns void
language sql security definer set search_path = public as $$
  delete from public.lists where deleted_at < now() - interval '30 days';
  delete from public.elements e where e.deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.list_items li where li.element_id = e.id);
  delete from public.materials m where m.deleted_at < now() - interval '30 days'
    and not exists (select 1 from public.components c where c.material_id = m.id);
$$;
revoke all on function public._purge_trash() from public, anon, authenticated;

-- =====================================================================
-- Masse : lien des materiaux vers Index
-- =====================================================================
-- Masse : lien de chaque materiau vers sa fiche technique dans Index.
-- A coller UNE FOIS dans Supabase (projet de Masse) > SQL Editor > New query > Run.
-- Relancer le script ne casse rien.

alter table public.materials add column if not exists index_id text;
alter table public.materials add column if not exists index_name text;

create or replace function public.save_material(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid;
begin e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(trim(p->>'name'),'') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  if p->>'mode' not in ('density','surface','linear','unit') then return jsonb_build_object('ok', false, 'error', 'Mode de calcul invalide.'); end if;
  v_id := nullif(p->>'id','')::uuid;
  if v_id is null then
    insert into public.materials (name, category, mode, value, source, note, index_id, index_name)
    values (trim(p->>'name'), coalesce(p->>'category','autre'), p->>'mode', coalesce((p->>'value')::numeric,0), coalesce(p->>'source',''), coalesce(p->>'note',''),
            nullif(p->>'index_id',''), nullif(p->>'index_name',''))
    returning id into v_id;
  else
    update public.materials set name = trim(p->>'name'), category = coalesce(p->>'category','autre'), mode = p->>'mode',
      value = coalesce((p->>'value')::numeric,0), source = coalesce(p->>'source',''), note = coalesce(p->>'note',''),
      index_id = nullif(p->>'index_id',''), index_name = nullif(p->>'index_name',''), updated_at = now()
    where id = v_id;
  end if;
  perform public._purge_trash();
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- =====================================================================
-- Format : bibliotheque commune
-- =====================================================================
-- Bibliotheque commune de Format : a coller UNE FOIS dans Supabase (projet de Masse)
-- > SQL Editor > New query > Run. Rien d'autre a faire ; relancer le script ne casse rien.
--
-- - Une table « format_materiaux » : un materiau par ligne (formats, epaisseur, trait de coupe...).
-- - LES PRIX NE SONT JAMAIS ENREGISTRES : la base les retire meme si l'appli en envoyait.
-- - Lecture libre ; creation, modification et suppression protegees par le PIN de Masse
--   (meme code, memes 5 essais avant blocage 5 minutes : fonction public._check_pin).
-- - Une suppression met le materiau a la corbeille (deleted_at) : les projets qui
--   l'utilisent encore le gardent sur leur poste.

create table if not exists public.format_materiaux (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.format_materiaux enable row level security;
grant select on public.format_materiaux to anon, authenticated;
grant all on public.format_materiaux to service_role;
drop policy if exists "lecture bibliotheque format" on public.format_materiaux;
create policy "lecture bibliotheque format" on public.format_materiaux for select to anon, authenticated using (true);

-- Retire le champ « price » de chaque format d'un tableau situe a ce chemin du JSON
create or replace function public._format_retirer_prix(p jsonb, chemin text[]) returns jsonb
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p #> chemin) = 'array'
    then jsonb_set(p, chemin, (select coalesce(jsonb_agg(f - 'price'), '[]'::jsonb) from jsonb_array_elements(p #> chemin) f))
    else p end
$$;
revoke all on function public._format_retirer_prix(jsonb, text[]) from public, anon, authenticated;

create or replace function public.format_save_material(p_pin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id text := p->>'id'; v_data jsonb;
begin
  e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if coalesce(v_id, '') = '' or length(v_id) > 100 then return jsonb_build_object('ok', false, 'error', 'Matériau invalide.'); end if;
  if coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  if octet_length(p::text) > 20000 then return jsonb_build_object('ok', false, 'error', 'Matériau trop volumineux.'); end if;
  v_data := public._format_retirer_prix(public._format_retirer_prix(p, '{supply,formats}'), '{supplyValues,catalog,formats}');
  insert into public.format_materiaux (id, data, updated_at, deleted_at) values (v_id, v_data, now(), null)
  on conflict (id) do update set data = excluded.data, updated_at = now(), deleted_at = null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.format_delete_material(p_pin text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  update public.format_materiaux set deleted_at = now(), updated_at = now() where id = p_id;
  -- Corbeille videe apres 90 jours
  delete from public.format_materiaux where deleted_at < now() - interval '90 days';
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.format_save_material(text, jsonb), public.format_delete_material(text, text) to anon, authenticated;

-- =====================================================================
-- Strate : catalogue commun
-- =====================================================================
-- Catalogue commun de Strate : a coller UNE FOIS dans Supabase (projet de Masse)
-- > SQL Editor > New query > Run. Relancer le script ne casse rien.
--
-- - Une table « strate_catalogue » : un produit d'isolant ou un systeme de fixation par ligne
--   (epaisseurs, m2 par colis, colis par palette, prix catalogue, articles HFT...).
-- - Lecture libre ; partage, mise a jour et retrait proteges par le PIN de Masse
--   (meme code, memes 5 essais avant blocage 5 minutes : fonction public._check_pin).
-- - Un retrait met l'element a la corbeille (deleted_at) : les postes qui l'utilisent
--   dans une commande le gardent.

create table if not exists public.strate_catalogue (
  id text primary key,
  kind text not null check (kind in ('produit', 'fixation')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.strate_catalogue enable row level security;
grant select on public.strate_catalogue to anon, authenticated;
grant all on public.strate_catalogue to service_role;
drop policy if exists "lecture catalogue strate" on public.strate_catalogue;
create policy "lecture catalogue strate" on public.strate_catalogue for select to anon, authenticated using (true);

create or replace function public.strate_save_item(p_pin text, p_kind text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id text := p->>'id';
begin
  e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  if p_kind not in ('produit', 'fixation') then return jsonb_build_object('ok', false, 'error', 'Type inconnu.'); end if;
  if coalesce(v_id, '') = '' or length(v_id) > 100 then return jsonb_build_object('ok', false, 'error', 'Élément invalide.'); end if;
  if coalesce(trim(p->>'name'), '') = '' then return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.'); end if;
  if octet_length(p::text) > 50000 then return jsonb_build_object('ok', false, 'error', 'Élément trop volumineux.'); end if;
  insert into public.strate_catalogue (id, kind, data, updated_at, deleted_at) values (v_id, p_kind, p, now(), null)
  on conflict (id) do update set kind = excluded.kind, data = excluded.data, updated_at = now(), deleted_at = null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.strate_delete_item(p_pin text, p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text;
begin
  e := public._check_pin(p_pin);
  if e is not null then return jsonb_build_object('ok', false, 'error', e); end if;
  update public.strate_catalogue set deleted_at = now(), updated_at = now() where id = p_id;
  -- Corbeille videe apres 90 jours
  delete from public.strate_catalogue where deleted_at < now() - interval '90 days';
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.strate_save_item(text, text, jsonb), public.strate_delete_item(text, text) from public;
grant execute on function public.strate_save_item(text, text, jsonb), public.strate_delete_item(text, text) to anon, authenticated;

-- =====================================================================
-- PIN : definis-le toi-meme (remplace 1234 par ton code), meme principe qu'avant.
-- Ne le laisse pas dans un fichier : c'est le seul endroit ou il apparait.
-- =====================================================================
-- update public.app_config set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf')) where id = 1;
