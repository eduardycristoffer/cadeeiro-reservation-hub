-- 017 · Webhooks de entrada (Wi-Fi do salão) --------------------------------------------------------------------------
-- Um sistema de Wi-Fi de terceiros chama uma URL secreta toda vez que um cliente conecta. O painel guarda quem conectou
-- (nome, telefone, e-mail, aparelho), conta as visitas por dia/horário e cruza com as reservas.
--  · A URL contém um token; só o hash fica no banco (o token aparece uma única vez, ao criar ou trocar).
--  · Quem escreve é só o servidor (`webhook_ingest`, service_role). O painel só lê por RPCs de gestor.
--  · Cliente do Wi-Fi só vira contato do CRM (customers) se o portal informar que aceitou receber mensagens.

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  kind text not null default 'wifi' check (kind in ('wifi','generico')),
  token_hash text not null unique,
  token_hint text not null check (char_length(token_hint) = 4),
  is_active boolean not null default true,
  last_event_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wifi_guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  endpoint_id uuid references public.webhook_endpoints(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  full_name text check (full_name is null or char_length(full_name) <= 120),
  phone_e164 text,
  email text check (email is null or char_length(email) <= 254),
  device_key text check (device_key is null or char_length(device_key) <= 64),
  marketing_consent boolean not null default false,
  visits integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists wifi_guests_phone_idx on public.wifi_guests (organization_id, phone_e164) where phone_e164 is not null;
create unique index if not exists wifi_guests_email_idx on public.wifi_guests (organization_id, lower(email)) where phone_e164 is null and email is not null;
create unique index if not exists wifi_guests_device_idx on public.wifi_guests (organization_id, device_key) where phone_e164 is null and email is null and device_key is not null;
create index if not exists wifi_guests_seen_idx on public.wifi_guests (organization_id, last_seen_at desc);

-- uma linha por conexão (sem dado pessoal além do vínculo com o visitante), para os gráficos
create table if not exists public.wifi_visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.units(id) on delete set null,
  guest_id uuid not null references public.wifi_guests(id) on delete cascade,
  connected_at timestamptz not null default now()
);
create index if not exists wifi_visits_time_idx on public.wifi_visits (organization_id, connected_at desc);
create index if not exists wifi_visits_guest_idx on public.wifi_visits (guest_id, connected_at desc);

-- o que chegou, para conferir a integração (apagado após 30 dias)
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references public.webhook_endpoints(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  received_at timestamptz not null default now(),
  status text not null check (status in ('processado','ignorado','erro')),
  error text check (error is null or char_length(error) <= 200),
  payload jsonb not null check (pg_column_size(payload) < 40000),
  guest_id uuid references public.wifi_guests(id) on delete set null
);
create index if not exists webhook_events_endpoint_idx on public.webhook_events (endpoint_id, received_at desc);

do $$ declare t text; begin
  foreach t in array array['webhook_endpoints','wifi_guests','wifi_visits','webhook_events'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop trigger if exists webhook_endpoints_updated_at on public.webhook_endpoints;
create trigger webhook_endpoints_updated_at before update on public.webhook_endpoints for each row execute function public.set_updated_at();
drop trigger if exists wifi_guests_updated_at on public.wifi_guests;
create trigger wifi_guests_updated_at before update on public.wifi_guests for each row execute function public.set_updated_at();

-- 1) Leitura tolerante do corpo (cada sistema de Wi-Fi usa nomes diferentes) ---------------------------------------
-- procura a chave no topo e, depois, dentro de objetos aninhados (até 3 níveis: data, client, guest...)
create or replace function public._wh_pick(_p jsonb, _keys text[]) returns text
language sql immutable set search_path = public as $$
  select nullif(btrim(kv.value #>> '{}'), '')
    from jsonb_path_query(case when jsonb_typeof(_p) = 'object' then _p else '{}'::jsonb end, 'lax $.**{0 to 3}') with ordinality as o(obj, n),
         lateral jsonb_each(case when jsonb_typeof(o.obj) = 'object' then o.obj else '{}'::jsonb end) kv
   where lower(kv.key) = any(_keys) and jsonb_typeof(kv.value) in ('string','number','boolean')
     and nullif(btrim(kv.value #>> '{}'), '') is not null
   order by o.n limit 1
$$;
revoke all on function public._wh_pick(jsonb,text[]) from public, anon, authenticated;

create or replace function public._wh_truthy(_v text) returns boolean language sql immutable as $$
  select lower(btrim(coalesce(_v, ''))) in ('1','true','t','yes','y','sim','s','on','aceito','accepted','agree','agreed')
$$;
revoke all on function public._wh_truthy(text) from public, anon, authenticated;

-- 2) Recebimento (só o servidor chama) ------------------------------------------------------------------------------
create or replace function public.webhook_ingest(_token_hash text, _payload jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  ep public.webhook_endpoints; p jsonb := _payload; ev text; v_unit uuid; hint text;
  v_name text; v_phone_raw text; v_phone text; v_email text; v_mac text; v_consent boolean;
  g public.wifi_guests; v_key text; v_status text := 'processado'; v_err text; v_new boolean := false; v_visit boolean := false; v_cust uuid;
begin
  select * into ep from public.webhook_endpoints e where e.token_hash = _token_hash and e.is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'NOT_FOUND'); end if;
  if not public.hit_rate_limit('hook:' || ep.id::text, 600) then return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED'); end if;

  if jsonb_typeof(p) = 'array' and jsonb_array_length(p) >= 1 then p := p -> 0; end if;
  if jsonb_typeof(p) <> 'object' then p := jsonb_build_object('_valor', p); v_status := 'erro'; v_err := 'CORPO_INVALIDO'; end if;

  if random() < 0.02 then delete from public.webhook_events where received_at < now() - interval '30 days'; end if;

  if v_status = 'processado' then
    ev := lower(coalesce(public._wh_pick(p, array['event','type','evento','event_type','action','status']), 'connect'));
    if ev in ('disconnect','disconnected','logout','logoff','desconectou','desconectado','saiu','leave','left') then
      v_status := 'ignorado'; v_err := 'DESCONEXAO';
    end if;
  end if;

  if v_status = 'processado' then
    v_name := left(public._wh_pick(p, array['name','nome','full_name','fullname','guest_name','username','user_name','display_name']), 120);
    v_phone_raw := public._wh_pick(p, array['phone','telefone','celular','mobile','whatsapp','phone_number','tel','cellphone']);
    v_phone := public.normalize_br_phone(v_phone_raw);
    v_email := lower(left(public._wh_pick(p, array['email','e-mail','mail']), 254));
    if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then v_email := null; end if;
    v_mac := public._wh_pick(p, array['mac','client_mac','device_mac','mac_address','clientmac','sta_mac','user_mac']);
    v_key := case when v_mac is null then null else encode(sha256(convert_to(lower(regexp_replace(v_mac, '[^0-9a-fA-F]', '', 'g')), 'UTF8')), 'hex') end;
    v_consent := public._wh_truthy(public._wh_pick(p, array['consent','marketing_consent','accepted_terms','accept_marketing','opt_in','optin','aceite','terms','accepted']));

    v_unit := ep.unit_id;
    if v_unit is null then
      hint := lower(btrim(coalesce(public._wh_pick(p, array['unit','unidade','location','site','venue','local']), '')));
      if hint <> '' then
        select u.id into v_unit from public.units u
         where u.organization_id = ep.organization_id and (lower(u.slug) = hint or lower(u.name) like '%' || hint || '%' or lower(u.city) = hint)
         order by u.sort_order limit 1;
      end if;
    end if;

    if v_phone is null and v_email is null and v_key is null then
      v_status := 'ignorado'; v_err := 'SEM_IDENTIFICACAO';
    end if;
  end if;

  if v_status = 'processado' then
    select * into g from public.wifi_guests x where x.organization_id = ep.organization_id and (
         (v_phone is not null and x.phone_e164 = v_phone)
      or (v_phone is null and v_email is not null and x.phone_e164 is null and lower(x.email) = v_email)
      or (v_phone is null and v_email is null and x.phone_e164 is null and x.email is null and x.device_key = v_key)) limit 1;
    if not found then
      begin
        insert into public.wifi_guests (organization_id, unit_id, endpoint_id, full_name, phone_e164, email, device_key, marketing_consent, visits)
        values (ep.organization_id, v_unit, ep.id, v_name, v_phone, v_email, v_key, coalesce(v_consent, false), 0) returning * into g;
        v_new := true;
      exception when unique_violation then
        select * into g from public.wifi_guests x where x.organization_id = ep.organization_id and (
             (v_phone is not null and x.phone_e164 = v_phone) or (v_phone is null and v_email is not null and lower(x.email) = v_email)
          or (v_phone is null and v_email is null and x.device_key = v_key)) limit 1;
      end;
    end if;

    -- reconexão em menos de 30 min não conta como nova visita
    if not exists (select 1 from public.wifi_visits w where w.guest_id = g.id and w.connected_at > now() - interval '30 minutes') then
      insert into public.wifi_visits (organization_id, unit_id, guest_id) values (ep.organization_id, coalesce(v_unit, g.unit_id), g.id);
      v_visit := true;
    end if;

    update public.wifi_guests x set
      unit_id = coalesce(v_unit, x.unit_id), endpoint_id = ep.id,
      full_name = coalesce(nullif(v_name, ''), x.full_name),
      email = coalesce(v_email, x.email),
      device_key = coalesce(x.device_key, v_key),
      marketing_consent = x.marketing_consent or coalesce(v_consent, false),
      visits = x.visits + case when v_visit then 1 else 0 end,
      last_seen_at = now()
     where x.id = g.id returning * into g;

    -- só entra no CRM quem tem telefone válido E aceitou receber mensagens
    if g.phone_e164 is not null and g.marketing_consent then
      insert into public.customers as c (organization_id, full_name, phone_e164, email, whatsapp_opt_in)
      values (ep.organization_id, coalesce(nullif(btrim(g.full_name), ''), 'Cliente Wi-Fi'), g.phone_e164, g.email, true)
      on conflict (organization_id, phone_e164) do update
        set whatsapp_opt_in = case when c.whatsapp_opt_out_at is not null then c.whatsapp_opt_in else true end,
            email = coalesce(c.email, excluded.email), updated_at = now()
      returning c.id into v_cust;
      if g.customer_id is distinct from v_cust then update public.wifi_guests set customer_id = v_cust where id = g.id; end if;
    end if;
  end if;

  insert into public.webhook_events (endpoint_id, organization_id, status, error, payload, guest_id)
  values (ep.id, ep.organization_id, v_status, v_err, case when pg_column_size(p) < 39000 then p else jsonb_build_object('_truncado', true) end, g.id);
  update public.webhook_endpoints set last_event_at = now() where id = ep.id;
  return jsonb_build_object('ok', true, 'status', v_status, 'new_guest', v_new, 'visit', v_visit);
end $$;
revoke all on function public.webhook_ingest(text,jsonb) from public, anon, authenticated;
grant execute on function public.webhook_ingest(text,jsonb) to service_role;

-- 3) Painel: gerenciar endereços (gestor da unidade; endereço da rede toda só super admin) -------------------------
create or replace function public._wh_can(_uid uuid, _unit uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin') or (_unit is not null and public._is_manager(_uid) and public.can_manage_unit(_uid, _unit))
$$;
revoke all on function public._wh_can(uuid,uuid) from public, anon, authenticated;

create or replace function public.webhook_endpoint_create(_name text, _unit uuid default null, _kind text default 'wifi') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_name text := btrim(coalesce(_name, '')); v_token text; v_id uuid;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'INVALID_NAME'; end if;
  if _kind not in ('wifi','generico') then raise exception 'INVALID_KIND'; end if;
  if _unit is not null and not exists (select 1 from public.units u where u.id = _unit and u.organization_id = v_org) then raise exception 'INVALID_UNIT'; end if;
  if not public._wh_can(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if (select count(*) from public.webhook_endpoints e where e.organization_id = v_org) >= 20 then raise exception 'LIMIT_REACHED'; end if;
  v_token := 'whk_' || public._rand_hex(40);
  insert into public.webhook_endpoints (organization_id, unit_id, name, kind, token_hash, token_hint, created_by)
  values (v_org, _unit, v_name, _kind, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), right(v_token, 4), auth.uid()) returning id into v_id;
  perform public.write_audit('painel', 'webhook.criado', 'webhook_endpoint', v_id, _unit, null, jsonb_build_object('nome', v_name, 'tipo', _kind), null);
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;
revoke all on function public.webhook_endpoint_create(text,uuid,text) from public, anon;
grant execute on function public.webhook_endpoint_create(text,uuid,text) to authenticated;

create or replace function public.webhook_endpoint_rotate(_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare ep public.webhook_endpoints; v_token text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into ep from public.webhook_endpoints e where e.id = _id and e.organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public._wh_can(auth.uid(), ep.unit_id) then raise exception 'FORBIDDEN'; end if;
  v_token := 'whk_' || public._rand_hex(40);
  update public.webhook_endpoints set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), token_hint = right(v_token, 4) where id = _id;
  perform public.write_audit('painel', 'webhook.token_trocado', 'webhook_endpoint', _id, ep.unit_id, null, null, null);
  return jsonb_build_object('id', _id, 'token', v_token);
end $$;
revoke all on function public.webhook_endpoint_rotate(uuid) from public, anon;
grant execute on function public.webhook_endpoint_rotate(uuid) to authenticated;

create or replace function public.webhook_endpoint_set_active(_id uuid, _active boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare ep public.webhook_endpoints;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into ep from public.webhook_endpoints e where e.id = _id and e.organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public._wh_can(auth.uid(), ep.unit_id) then raise exception 'FORBIDDEN'; end if;
  update public.webhook_endpoints set is_active = coalesce(_active, false) where id = _id;
  perform public.write_audit('painel', case when _active then 'webhook.ativado' else 'webhook.desativado' end, 'webhook_endpoint', _id, ep.unit_id, null, null, null);
end $$;
revoke all on function public.webhook_endpoint_set_active(uuid,boolean) from public, anon;
grant execute on function public.webhook_endpoint_set_active(uuid,boolean) to authenticated;

create or replace function public.webhook_endpoints_list() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org();
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'kind', e.kind, 'unit_id', e.unit_id, 'unit_name', u.name, 'token_hint', e.token_hint,
      'is_active', e.is_active, 'last_event_at', e.last_event_at, 'created_at', e.created_at,
      'events_24h', (select count(*) from public.webhook_events w where w.endpoint_id = e.id and w.received_at > now() - interval '24 hours'),
      'events_7d', (select count(*) from public.webhook_events w where w.endpoint_id = e.id and w.received_at > now() - interval '7 days'),
      'errors_7d', (select count(*) from public.webhook_events w where w.endpoint_id = e.id and w.status = 'erro' and w.received_at > now() - interval '7 days'),
      'ignored_7d', (select count(*) from public.webhook_events w where w.endpoint_id = e.id and w.status = 'ignorado' and w.error is distinct from 'DESCONEXAO' and w.received_at > now() - interval '7 days'))
      order by e.created_at desc)
      from public.webhook_endpoints e left join public.units u on u.id = e.unit_id
     where e.organization_id = v_org and public._wh_can(auth.uid(), e.unit_id)), '[]'::jsonb);
end $$;
revoke all on function public.webhook_endpoints_list() from public, anon;
grant execute on function public.webhook_endpoints_list() to authenticated;

create or replace function public.webhook_events_recent(_endpoint uuid, _limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ep public.webhook_endpoints;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into ep from public.webhook_endpoints e where e.id = _endpoint and e.organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if not public._wh_can(auth.uid(), ep.unit_id) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'received_at', w.received_at, 'status', w.status, 'error', w.error, 'payload', w.payload)
                                    order by w.received_at desc)
                     from (select * from public.webhook_events x where x.endpoint_id = _endpoint order by x.received_at desc limit least(greatest(coalesce(_limit, 20), 1), 50)) w), '[]'::jsonb);
end $$;
revoke all on function public.webhook_events_recent(uuid,integer) from public, anon;
grant execute on function public.webhook_events_recent(uuid,integer) to authenticated;

-- 4) Painel: relatório e lista de visitantes (gestor) -----------------------------------------------------------
-- visitante visível = unidade que o gestor administra; sem unidade só para o super admin
create or replace function public._wifi_visible(_uid uuid, _unit uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin') or (_unit is not null and public._is_manager(_uid) and public.can_manage_unit(_uid, _unit))
$$;
revoke all on function public._wifi_visible(uuid,uuid) from public, anon, authenticated;

create or replace function public.wifi_overview(_days integer default 30, _unit uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); d integer := least(greatest(coalesce(_days, 30), 1), 365); since timestamptz;
        tot jsonb; by_day jsonb; by_hour jsonb;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  since := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(days => d - 1);

  select jsonb_build_object(
    'visits', count(*),
    'guests', count(distinct v.guest_id),
    'new_guests', count(distinct v.guest_id) filter (where g.first_seen_at >= since),
    'returning_guests', count(distinct v.guest_id) filter (where g.first_seen_at < since),
    'with_phone', count(distinct v.guest_id) filter (where g.phone_e164 is not null),
    'with_consent', count(distinct v.guest_id) filter (where g.marketing_consent),
    'reserved', count(distinct v.guest_id) filter (where g.phone_e164 is not null and exists (
        select 1 from public.reservations r join public.customers c on c.id = r.customer_id
         where c.organization_id = v_org and c.phone_e164 = g.phone_e164 and r.status <> 'cancelada')),
    'reserved_after', count(distinct v.guest_id) filter (where g.phone_e164 is not null and exists (
        select 1 from public.reservations r join public.customers c on c.id = r.customer_id
         where c.organization_id = v_org and c.phone_e164 = g.phone_e164 and r.status <> 'cancelada' and r.created_at >= g.first_seen_at)))
    into tot
    from public.wifi_visits v join public.wifi_guests g on g.id = v.guest_id
   where v.organization_id = v_org and v.connected_at >= since and (_unit is null or v.unit_id = _unit)
     and public._wifi_visible(auth.uid(), v.unit_id);

  select coalesce(jsonb_agg(jsonb_build_object('day', s.day, 'visits', coalesce(x.n, 0), 'guests', coalesce(x.g, 0)) order by s.day), '[]'::jsonb) into by_day
    from generate_series((since at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') s(day)
    left join (select (v.connected_at at time zone 'America/Sao_Paulo')::date as day, count(*) as n, count(distinct v.guest_id) as g
                 from public.wifi_visits v
                where v.organization_id = v_org and v.connected_at >= since and (_unit is null or v.unit_id = _unit) and public._wifi_visible(auth.uid(), v.unit_id)
                group by 1) x on x.day = s.day::date;

  select coalesce(jsonb_agg(jsonb_build_object('hour', h.hour, 'visits', coalesce(x.n, 0)) order by h.hour), '[]'::jsonb) into by_hour
    from generate_series(0, 23) h(hour)
    left join (select extract(hour from v.connected_at at time zone 'America/Sao_Paulo')::integer as hour, count(*) as n
                 from public.wifi_visits v
                where v.organization_id = v_org and v.connected_at >= since and (_unit is null or v.unit_id = _unit) and public._wifi_visible(auth.uid(), v.unit_id)
                group by 1) x on x.hour = h.hour;

  return jsonb_build_object('days', d, 'totals', coalesce(tot, '{}'::jsonb), 'by_day', by_day, 'by_hour', by_hour);
end $$;
revoke all on function public.wifi_overview(integer,uuid) from public, anon;
grant execute on function public.wifi_overview(integer,uuid) to authenticated;

create or replace function public.wifi_guests_list(_unit uuid default null, _q text default null, _limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); q text := nullif(btrim(coalesce(_q, '')), ''); qd text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if q is not null and char_length(q) > 80 then raise exception 'INVALID_QUERY'; end if;
  qd := nullif(regexp_replace(coalesce(q, ''), '\D', '', 'g'), '');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'name', g.full_name, 'phone', g.phone_e164, 'email', g.email, 'unit_id', g.unit_id, 'unit_name', u.name,
      'visits', g.visits, 'first_seen_at', g.first_seen_at, 'last_seen_at', g.last_seen_at, 'consent', g.marketing_consent,
      'reserved', g.phone_e164 is not null and exists (select 1 from public.reservations r join public.customers c on c.id = r.customer_id
                    where c.organization_id = v_org and c.phone_e164 = g.phone_e164 and r.status <> 'cancelada')) order by g.last_seen_at desc)
    from (select * from public.wifi_guests x
           where x.organization_id = v_org and (_unit is null or x.unit_id = _unit) and public._wifi_visible(auth.uid(), x.unit_id)
             and (q is null or x.full_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%' or x.email ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
                  or (qd is not null and x.phone_e164 like '%' || qd || '%'))
           order by x.last_seen_at desc limit least(greatest(coalesce(_limit, 50), 1), 200)) g
    left join public.units u on u.id = g.unit_id), '[]'::jsonb);
end $$;
revoke all on function public.wifi_guests_list(uuid,text,integer) from public, anon;
grant execute on function public.wifi_guests_list(uuid,text,integer) to authenticated;
