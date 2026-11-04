-- Masse 2.8 : l'ecriture passe par le COMPTE Index (connecte + valide) au lieu du code PIN.
-- A coller UNE FOIS dans Supabase (projet Index) > SQL Editor > New query > Run.
-- Colle le CONTENU de ce fichier (pas son nom). Relancer ne casse rien.
-- Les anciennes fonctions a PIN restent en place (Format et Strate les utilisent encore).

create or replace function public._check_acces() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then return 'Connectez-vous avec votre compte Index pour modifier.'; end if;
  if not public.is_approved() then return 'Votre compte Index n''est pas encore valide : un administrateur doit l''approuver.'; end if;
  return null;
end $$;
revoke all on function public._check_acces() from public, anon, authenticated;

create or replace function public.save_material(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid;
begin e := public._check_acces();
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

create or replace function public.save_element(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid; c jsonb; i int := 0;
begin e := public._check_acces();
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

create or replace function public.save_list(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; v_id uuid; c jsonb; i int := 0;
begin e := public._check_acces();
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

create or replace function public.set_deleted(p_table text, p_id uuid, p_deleted boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text;
begin e := public._check_acces();
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

create or replace function public.import_all(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text; r jsonb; n int := 0;
begin e := public._check_acces();
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

grant execute on function public.save_material(jsonb), public.save_element(jsonb), public.save_list(jsonb),
  public.set_deleted(text, uuid, boolean), public.import_all(jsonb) to authenticated;
