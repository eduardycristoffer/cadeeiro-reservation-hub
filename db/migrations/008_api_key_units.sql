-- Additive SDR unit scopes; an empty mapping preserves organization-wide access.
create table public.api_key_units (
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  primary key (api_key_id, unit_id)
);
grant select, insert, update, delete on public.api_key_units to authenticated;
grant all on public.api_key_units to service_role;
alter table public.api_key_units enable row level security;
create policy "super admin gerencia unidades das chaves" on public.api_key_units
  for all to authenticated using (public.has_role(auth.uid(), 'super_admin'))
  with check (public.has_role(auth.uid(), 'super_admin'));

create or replace function public.validate_api_key_unit()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.api_keys k join public.units u on u.organization_id = k.organization_id
                 where k.id = new.api_key_id and u.id = new.unit_id) then
    raise exception 'UNIT_NOT_FOUND';
  end if;
  return new;
end $$;
create trigger api_key_unit_org_guard before insert or update on public.api_key_units
for each row execute function public.validate_api_key_unit();

create or replace function public.sdr_auth(_key_hash text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = _key_hash and is_active and revoked_at is null;
  if not found then return null; end if;
  update public.api_keys set last_used_at = now()
   where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return jsonb_build_object('id', k.id, 'organization_id', k.organization_id, 'prefix', k.prefix,
    'scopes', to_jsonb(k.scopes),
    'unit_ids', coalesce((select jsonb_agg(unit_id order by unit_id) from public.api_key_units where api_key_id = k.id), '[]'::jsonb),
    'rate_limited', not public.hit_rate_limit('apikey:' || k.id, 300));
end $$;

-- Keep the original two-argument signature for old callers. Scoped creation uses
-- a three-argument overload. Omitting _unit_ids resolves to the old function
-- (equivalent to default null), avoiding PostgREST ambiguity between overloads.
create or replace function public.admin_create_api_key(_name text, _scopes text[], _unit_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_key text; v_id uuid; v_name text := btrim(coalesce(_name,'')); v_org uuid := public._default_org();
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'INVALID_NAME'; end if;
  if _scopes is null or not (_scopes <@ array['read','write']) or cardinality(_scopes) = 0 then raise exception 'VALIDATION_ERROR'; end if;
  if exists (select 1 from unnest(_unit_ids) x where x is null or not exists
             (select 1 from public.units u where u.id = x and u.organization_id = v_org and u.is_active)) then
    raise exception 'UNIT_NOT_FOUND';
  end if;
  v_key := 'cdk_' || public._rand_hex(48);
  insert into public.api_keys (organization_id, name, prefix, key_hash, scopes, created_by)
  values (v_org, v_name, left(v_key, 12), encode(sha256(convert_to(v_key,'UTF8')),'hex'), _scopes, auth.uid()) returning id into v_id;
  insert into public.api_key_units (api_key_id, unit_id) select v_id, x from (select distinct unnest(_unit_ids) x) s;
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 12), 'unit_ids', coalesce(to_jsonb(_unit_ids), '[]'::jsonb));
end $$;
revoke all on function public.admin_create_api_key(text,text[],uuid[]) from public, anon;
grant execute on function public.admin_create_api_key(text,text[],uuid[]) to authenticated, service_role;

create or replace function public.admin_list_api_keys()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'name', k.name, 'prefix', k.prefix, 'scopes', to_jsonb(k.scopes),
    'is_active', k.is_active, 'last_used_at', k.last_used_at, 'created_at', k.created_at, 'revoked_at', k.revoked_at,
    'unit_ids', coalesce((select jsonb_agg(ku.unit_id order by ku.unit_id) from public.api_key_units ku where ku.api_key_id = k.id), '[]'::jsonb),
    'units', coalesce((select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.name) order by u.name)
                       from public.api_key_units ku join public.units u on u.id = ku.unit_id where ku.api_key_id = k.id), '[]'::jsonb))
    order by k.created_at desc) from public.api_keys k), '[]'::jsonb);
end $$;

-- Filter before LIMIT, so another unit cannot starve a scoped follow-up worker.
create or replace function public.sdr_scoped_followups_due(_unit_ids uuid[], _limit integer default 20, _now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare now_sp timestamp := (_now at time zone 'America/Sao_Paulo');
begin
  return coalesce((select jsonb_agg(q.item) from (
    select jsonb_build_object('kind', k.kind, 'protocol', r.protocol, 'unit_id', u.id, 'unit_slug', u.slug, 'unit_name', u.name,
      'date', r.reservation_date, 'time', to_char(r.reservation_time, 'HH24:MI'), 'party_size', r.party_size,
      'service', r.service, 'occasion', r.occasion, 'celebrant_name', r.celebrant_name,
      'first_name', split_part(c.full_name, ' ', 1), 'phone', c.phone_e164, 'attempts', coalesce(f.attempts, 0),
      'conversation_external_id', (select cc.external_id from public.crm_conversations cc where cc.reservation_id = r.id
        and (cc.unit_id is null or cc.unit_id = any(_unit_ids)) order by cc.updated_at desc limit 1)) as item
    from public.reservations r join public.customers c on c.id = r.customer_id and c.whatsapp_opt_in and c.whatsapp_opt_out_at is null
    join public.units u on u.id = r.unit_id cross join lateral (values ('lembrete_vespera'), ('lembrete_dia')) k(kind)
    left join public.reservation_followups f on f.reservation_id = r.id and f.kind = k.kind
    where r.unit_id = any(_unit_ids) and r.status = 'confirmada'
      and (f.id is null or (f.status = 'falhou' and f.attempts < 3 and f.updated_at < _now - interval '15 minutes'))
      and ((k.kind = 'lembrete_vespera' and r.reservation_date = now_sp::date + 1 and now_sp::time between time '10:00' and time '20:00')
        or (k.kind = 'lembrete_dia' and r.reservation_date = now_sp::date
          and (r.reservation_date + r.reservation_time) - now_sp between interval '1 hour' and interval '3 hours 30 minutes'))
    order by r.reservation_date, r.reservation_time limit greatest(1, least(coalesce(_limit, 20), 50))
  ) q), '[]'::jsonb);
end $$;
revoke all on function public.sdr_scoped_followups_due(uuid[],integer,timestamptz) from public, anon, authenticated;
grant execute on function public.sdr_scoped_followups_due(uuid[],integer,timestamptz) to service_role;