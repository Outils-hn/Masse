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
