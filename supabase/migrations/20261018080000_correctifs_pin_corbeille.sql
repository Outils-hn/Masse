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
