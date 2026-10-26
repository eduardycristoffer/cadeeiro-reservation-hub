-- Fase 6: integração Tryade CRM (Chatwoot) + API do SDR (n8n).
-- Funções sdr_* e crm_* executam só com service role (rotas de servidor).
-- Funções admin_* são chamadas pelo painel e exigem super admin.

-- Tabelas -------------------------------------------------------------------
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{read,write}',
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.api_keys to service_role;
alter table public.api_keys enable row level security;

create table public.api_idempotency (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  idem_key text not null,
  request_hash text not null,
  status_code integer,
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (api_key_id, idem_key)
);
create index api_idempotency_expires_idx on public.api_idempotency(expires_at);
grant all on public.api_idempotency to service_role;
alter table public.api_idempotency enable row level security;

create table public.crm_inbox_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  inbox_external_id text not null,
  unit_id uuid not null references public.units(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, inbox_external_id)
);
grant select, insert, update, delete on public.crm_inbox_units to authenticated;
grant all on public.crm_inbox_units to service_role;
alter table public.crm_inbox_units enable row level security;
create policy "super admin mapeia inboxes" on public.crm_inbox_units for all to authenticated
  using (public.has_role(auth.uid(),'super_admin')) with check (public.has_role(auth.uid(),'super_admin'));

create trigger api_keys_updated_at before update on public.api_keys for each row execute function public.set_updated_at();
create trigger api_idempotency_updated_at before update on public.api_idempotency for each row execute function public.set_updated_at();
create trigger crm_inbox_units_updated_at before update on public.crm_inbox_units for each row execute function public.set_updated_at();

alter table public.crm_conversations
  add column summary text,
  add column status text,
  add column inbox_external_id text,
  add column last_message_at timestamptz,
  add column message_count integer not null default 0,
  add column handoff_at timestamptz;

create index crm_conversations_external_idx on public.crm_conversations(external_id);
create index crm_conversations_status_idx on public.crm_conversations(status);
create index crm_conversations_reservation_idx on public.crm_conversations(reservation_id);
create index crm_contacts_external_idx on public.crm_contacts(external_id);
create index crm_events_type_idx on public.crm_events(direction, event_type, created_at desc);
create index crm_events_created_idx on public.crm_events(created_at desc);

-- Utilitários ---------------------------------------------------------------
create or replace function public._default_org()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.organizations order by created_at limit 1
$$;

create or replace function public._rand_hex(_len integer)
returns text language sql volatile as $$
  select left(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex'), _len)
$$;

-- SLA interno do SAC (horas por categoria; padrão 48h). Nunca comunicado ao cliente.
create or replace function public.sac_sla_hours(_category public.sac_category)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(s.config->'hours'->>_category::text, '')::int
       from public.integration_settings s where s.provider = 'sac_sla' order by s.created_at limit 1),
    48)
$$;

-- Saída para o CRM quando reservas e SAC mudam (painel, SDR ou qualquer RPC) --
create or replace function public.enqueue_reservation_crm_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text; v_conv text; v_phone text; v_name text; v_unit text;
begin
  if new.status is distinct from old.status then v_type := 'reservation.status_changed';
  elsif (new.reservation_date, new.reservation_time, new.party_size) is distinct from (old.reservation_date, old.reservation_time, old.party_size) then
    v_type := 'reservation.updated';
  else return null;
  end if;
  select c.external_id into v_conv from public.crm_conversations c where c.reservation_id = new.id order by c.updated_at desc limit 1;
  select cu.phone_e164, cu.full_name into v_phone, v_name from public.customers cu where cu.id = new.customer_id;
  select u.name into v_unit from public.units u where u.id = new.unit_id;
  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (new.organization_id, 'outbound', v_type || ':' || new.id || ':' || gen_random_uuid(), v_type,
    jsonb_build_object('reservation_id', new.id, 'protocol', new.protocol, 'unit_id', new.unit_id, 'unit_name', v_unit,
      'date', new.reservation_date, 'time', new.reservation_time, 'party_size', new.party_size,
      'status', new.status, 'from_status', old.status, 'phone', v_phone, 'customer_name', v_name,
      'conversation_external_id', v_conv));
  return null;
end $$;
create trigger reservations_crm_event after update on public.reservations
for each row execute function public.enqueue_reservation_crm_event();

create or replace function public.enqueue_sac_crm_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv text; v_phone text; v_name text;
begin
  if new.status is not distinct from old.status then return null; end if;
  select c.external_id into v_conv from public.crm_conversations c where c.sac_ticket_id = new.id order by c.updated_at desc limit 1;
  select cu.phone_e164, cu.full_name into v_phone, v_name from public.customers cu where cu.id = new.customer_id;
  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (new.organization_id, 'outbound', 'sac.status_changed:' || new.id || ':' || gen_random_uuid(), 'sac.status_changed',
    jsonb_build_object('sac_id', new.id, 'protocol', new.protocol, 'status', new.status, 'from_status', old.status,
      'category', new.category, 'unit_id', new.unit_id, 'phone', v_phone, 'customer_name', v_name,
      'conversation_external_id', v_conv));
  return null;
end $$;
create trigger sac_tickets_crm_event after update on public.sac_tickets
for each row execute function public.enqueue_sac_crm_event();

-- SDR: autenticação por chave -------------------------------------------------
create or replace function public.sdr_auth(_key_hash text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare k public.api_keys;
begin
  select * into k from public.api_keys where key_hash = _key_hash and is_active and revoked_at is null;
  if not found then return null; end if;
  update public.api_keys set last_used_at = now()
   where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return jsonb_build_object('id', k.id, 'organization_id', k.organization_id, 'prefix', k.prefix,
    'scopes', to_jsonb(k.scopes), 'rate_limited', not public.hit_rate_limit('apikey:' || k.id, 300));
end $$;

create or replace function public.sdr_list_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'name', u.name, 'address', u.address, 'city', u.city,
    'large_group_threshold', u.large_group_threshold, 'max_advance_days', u.max_advance_days,
    'min_advance_minutes', u.min_advance_minutes, 'auto_confirm', u.auto_confirm,
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', r.weekday, 'start', to_char(r.start_time,'HH24:MI'),
                         'end', to_char(r.end_time,'HH24:MI'), 'shift', r.shift_label) order by r.weekday, r.start_time)
                       from public.reservation_capacity_rules r where r.unit_id = u.id and r.is_active), '[]'::jsonb)
  ) order by u.sort_order, u.name), '[]'::jsonb)
  from public.units u where u.is_active and u.accepts_online_reservations
$$;

-- SDR: reservas ----------------------------------------------------------------
create or replace function public.sdr_create_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer, _full_name text, _phone text,
  _notes text default null, _whatsapp_opt_in boolean default true,
  _conversation_external_id text default null, _contact_external_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
  v_customer uuid; v_opted_out timestamptz; v_consent boolean := false;
  v_status public.reservation_status; v_large boolean; v_protocol text; v_ok boolean; v_res uuid;
begin
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if _party_size is null or _party_size < 1 or _party_size > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'NOTES_TOO_LONG'; end if;

  select * into u from public.units where id = _unit_id and is_active and accepts_online_reservations;
  if not found then raise exception 'UNIT_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(_unit_id::text || _date::text || _time::text, 0));
  select s.available into v_ok from public.get_unit_slots(_unit_id, _date, _party_size) s where s.slot_time = _time;
  if v_ok is distinct from true then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := _party_size > u.large_group_threshold;
  v_status := case when u.auto_confirm and not v_large then 'confirmada' else 'pendente' end;

  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, coalesce(_whatsapp_opt_in, true))
  on conflict (organization_id, phone_e164) do update
    set full_name = case when coalesce(btrim(c.full_name),'') = '' then excluded.full_name else c.full_name end,
        whatsapp_opt_in = case when c.whatsapp_opt_out_at is not null then c.whatsapp_opt_in
                               else c.whatsapp_opt_in or excluded.whatsapp_opt_in end
  returning c.id, c.whatsapp_opt_out_at into v_customer, v_opted_out;

  if v_opted_out is null and coalesce(_whatsapp_opt_in, true) then
    insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
    values (v_customer, 'whatsapp_transactional', true, 'sdr_whatsapp', '2026-10');
    v_consent := true;
  end if;

  loop
    v_protocol := 'CAD-' || to_char(_date, 'YYMMDD') || '-' || upper(public._rand_hex(5));
    exit when not exists (select 1 from public.reservations r where r.protocol = v_protocol);
  end loop;

  insert into public.reservations (protocol, organization_id, unit_id, customer_id, reservation_date, reservation_time,
                                   party_size, notes, origin, status, is_large_group, confirmed_at)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          'sdr_whatsapp', v_status, v_large, case when v_status = 'confirmada' then now() end)
  returning id into v_res;

  if nullif(_conversation_external_id,'') is not null then
    insert into public.crm_conversations as cc (organization_id, external_id, reservation_id, unit_id, classification, origin)
    values (u.organization_id, _conversation_external_id, v_res, _unit_id, 'reserva_realizada', 'sdr')
    on conflict (organization_id, external_id) do update
      set reservation_id = excluded.reservation_id, unit_id = coalesce(cc.unit_id, excluded.unit_id),
          classification = coalesce(cc.classification, excluded.classification);
  end if;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
    jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id, 'unit_name', u.name,
      'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status, 'origin', 'sdr_whatsapp',
      'phone', v_phone, 'customer_name', v_name,
      'conversation_external_id', nullif(_conversation_external_id,''), 'contact_external_id', nullif(_contact_external_id,'')));

  return jsonb_build_object('protocol', v_protocol, 'status', v_status, 'unit_name', u.name,
    'date', _date, 'time', to_char(_time,'HH24:MI'), 'party_size', _party_size, 'is_large_group', v_large,
    'whatsapp_consent_registered', v_consent);
end $$;

create or replace function public.sdr_find_reservations(_phone text, _protocol text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_phone text := public.normalize_br_phone(_phone);
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('protocol', r.protocol, 'status', r.status, 'unit_id', r.unit_id, 'unit_name', u.name,
             'date', r.reservation_date, 'time', to_char(r.reservation_time,'HH24:MI'), 'party_size', r.party_size,
             'is_large_group', r.is_large_group) order by r.reservation_date, r.reservation_time)
    from public.reservations r
    join public.customers c on c.id = r.customer_id
    join public.units u on u.id = r.unit_id
    where c.phone_e164 = v_phone
      and (nullif(_protocol,'') is null or r.protocol = upper(btrim(_protocol)))
      and r.reservation_date >= ((now() at time zone 'America/Sao_Paulo')::date - 30)
  ), '[]'::jsonb);
end $$;

create or replace function public.sdr_update_reservation(_protocol text, _phone text,
  _date date default null, _time time default null, _party_size integer default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text := public.normalize_br_phone(_phone);
  r public.reservations; u public.units;
  nd date; nt time; np integer; v_rem integer; v_maxp integer; v_large boolean; v_status public.reservation_status;
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  select res.* into r from public.reservations res join public.customers c on c.id = res.customer_id
   where res.protocol = upper(btrim(_protocol)) and c.phone_e164 = v_phone for update of res;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if r.status not in ('pendente','confirmada') then raise exception 'INVALID_TRANSITION'; end if;

  nd := coalesce(_date, r.reservation_date); nt := coalesce(_time, r.reservation_time); np := coalesce(_party_size, r.party_size);
  if np < 1 or np > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if nd = r.reservation_date and nt = r.reservation_time and np = r.party_size then raise exception 'NOTHING_TO_CHANGE'; end if;

  select * into u from public.units where id = r.unit_id;
  perform pg_advisory_xact_lock(hashtextextended(r.unit_id::text || nd::text || nt::text, 0));

  select s.remaining into v_rem from public.get_unit_slots(r.unit_id, nd, 1) s where s.slot_time = nt;
  if v_rem is null then raise exception 'SLOT_UNAVAILABLE'; end if;
  if nd = r.reservation_date and nt = r.reservation_time then v_rem := v_rem + r.party_size; end if;
  select max(cr.max_party_size) into v_maxp from public.reservation_capacity_rules cr
   where cr.unit_id = r.unit_id and cr.is_active and cr.weekday = extract(dow from nd)::int
     and nt >= cr.start_time and nt < cr.end_time;
  if v_rem < np or np > coalesce(v_maxp, 0) then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := np > u.large_group_threshold;
  v_status := case when r.status = 'confirmada' and v_large then 'pendente' else r.status end;

  perform set_config('app.status_note', 'Alterada pelo cliente via WhatsApp (SDR)', true);
  update public.reservations
     set reservation_date = nd, reservation_time = nt, party_size = np, is_large_group = v_large, status = v_status
   where id = r.id;
  perform set_config('app.status_note', '', true);
  if v_status = r.status then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, note)
    values (r.id, r.status, r.status, 'Alterada pelo cliente via WhatsApp (SDR): ' ||
      to_char(nd,'DD/MM/YYYY') || ' ' || to_char(nt,'HH24:MI') || ', ' || np || ' pessoas');
  end if;

  return jsonb_build_object('protocol', r.protocol, 'status', v_status, 'previous_status', r.status, 'unit_name', u.name,
    'date', nd, 'time', to_char(nt,'HH24:MI'), 'party_size', np, 'is_large_group', v_large);
end $$;

create or replace function public.sdr_cancel_reservation(_protocol text, _phone text, _reason text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_phone text := public.normalize_br_phone(_phone); r public.reservations;
        v_reason text := nullif(btrim(coalesce(_reason,'')), '');
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_reason is null then raise exception 'REASON_REQUIRED'; end if;
  if length(v_reason) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  select res.* into r from public.reservations res join public.customers c on c.id = res.customer_id
   where res.protocol = upper(btrim(_protocol)) and c.phone_e164 = v_phone for update of res;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if r.status not in ('pendente','confirmada') then raise exception 'INVALID_TRANSITION'; end if;
  perform set_config('app.status_note', 'Cancelada pelo cliente via WhatsApp: ' || v_reason, true);
  update public.reservations set status = 'cancelada' where id = r.id;
  perform set_config('app.status_note', '', true);
  return jsonb_build_object('protocol', r.protocol, 'status', 'cancelada', 'previous_status', r.status);
end $$;

-- SDR: SAC ---------------------------------------------------------------------
create or replace function public.sdr_create_sac(
  _category public.sac_category, _subject text, _description text, _unit_id uuid, _phone text, _full_name text,
  _priority public.sac_priority default 'media', _human_requested boolean default false,
  _conversation_external_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text := public.normalize_br_phone(_phone);
  v_subject text := btrim(coalesce(_subject,''));
  v_desc text := nullif(btrim(coalesce(_description,'')), '');
  v_name text := nullif(btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g')), '');
  v_org uuid; v_customer uuid; v_protocol text; v_id uuid;
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if length(v_subject) < 3 or length(v_subject) > 160 then raise exception 'INVALID_SUBJECT'; end if;
  if v_desc is not null and length(v_desc) > 2000 then raise exception 'DESCRIPTION_TOO_LONG'; end if;
  if _unit_id is not null then
    select organization_id into v_org from public.units where id = _unit_id;
    if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  else v_org := public._default_org();
  end if;

  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (v_org, coalesce(v_name, 'Contato WhatsApp'), v_phone, false)
  on conflict (organization_id, phone_e164) do update
    set full_name = case when coalesce(btrim(c.full_name),'') in ('', 'Contato WhatsApp') and excluded.full_name <> 'Contato WhatsApp'
                         then excluded.full_name else c.full_name end
  returning c.id into v_customer;

  loop
    v_protocol := 'SAC-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || upper(public._rand_hex(5));
    exit when not exists (select 1 from public.sac_tickets t where t.protocol = v_protocol);
  end loop;

  insert into public.sac_tickets (protocol, organization_id, unit_id, customer_id, category, subject, description,
                                  priority, status, due_at, human_requested, origin)
  values (v_protocol, v_org, _unit_id, v_customer, _category, v_subject, v_desc, coalesce(_priority,'media'), 'aberto',
          now() + make_interval(hours => public.sac_sla_hours(_category)), coalesce(_human_requested,false), 'sdr_whatsapp')
  returning id into v_id;

  insert into public.sac_ticket_events (ticket_id, event_type, body, from_status, to_status)
  values (v_id, 'aberto', 'Aberto pelo SDR (WhatsApp)', null, 'aberto');

  if nullif(_conversation_external_id,'') is not null then
    insert into public.crm_conversations as cc (organization_id, external_id, sac_ticket_id, unit_id, classification, origin)
    values (v_org, _conversation_external_id, v_id, _unit_id,
            case when _category = 'reclamacao' then 'sac_reclamacao'::public.crm_classification
                 when _category = 'elogio' then 'elogio' when _category = 'sugestao' then 'sugestao'
                 when _category = 'duvida' then 'duvida_geral' else 'outros' end, 'sdr')
    on conflict (organization_id, external_id) do update
      set sac_ticket_id = excluded.sac_ticket_id, unit_id = coalesce(cc.unit_id, excluded.unit_id),
          classification = coalesce(cc.classification, excluded.classification);
  end if;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (v_org, 'outbound', 'sac.created:' || v_id, 'sac.created',
    jsonb_build_object('sac_id', v_id, 'protocol', v_protocol, 'status', 'aberto', 'category', _category,
      'unit_id', _unit_id, 'human_requested', coalesce(_human_requested,false), 'phone', v_phone,
      'customer_name', v_name, 'conversation_external_id', nullif(_conversation_external_id,'')));

  return jsonb_build_object('ticket_id', v_id, 'protocol', v_protocol, 'status', 'aberto');
end $$;

-- SDR: classificação de conversa -------------------------------------------------
create or replace function public.sdr_classify_conversation(
  _external_id text, _classification public.crm_classification, _intent text default null, _tags text[] default null,
  _unit_id uuid default null, _result text default null, _summary text default null,
  _started_at timestamptz default null, _completed_at timestamptz default null,
  _reservation_protocol text default null, _sac_protocol text default null,
  _contact_external_id text default null, _phone text default null, _contact_name text default null,
  _channel text default 'whatsapp')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._default_org(); v_contact uuid; v_res uuid; v_sac uuid; v_id uuid; v_created boolean;
        v_phone text := public.normalize_br_phone(_phone);
begin
  if nullif(btrim(coalesce(_external_id,'')),'') is null then raise exception 'VALIDATION_ERROR'; end if;
  if _summary is not null and length(_summary) > 500 then raise exception 'SUMMARY_TOO_LONG'; end if;
  if _unit_id is not null and not exists (select 1 from public.units where id = _unit_id) then raise exception 'UNIT_NOT_FOUND'; end if;
  if nullif(_reservation_protocol,'') is not null then
    select id into v_res from public.reservations where protocol = upper(btrim(_reservation_protocol));
    if v_res is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  end if;
  if nullif(_sac_protocol,'') is not null then
    select id into v_sac from public.sac_tickets where protocol = upper(btrim(_sac_protocol));
    if v_sac is null then raise exception 'SAC_NOT_FOUND'; end if;
  end if;

  if nullif(_contact_external_id,'') is not null then
    insert into public.crm_contacts as k (organization_id, external_id, phone_e164, display_name, customer_id)
    values (v_org, _contact_external_id, v_phone, nullif(btrim(coalesce(_contact_name,'')),''),
            (select id from public.customers where organization_id = v_org and phone_e164 = v_phone))
    on conflict (organization_id, external_id) do update
      set phone_e164 = coalesce(excluded.phone_e164, k.phone_e164),
          display_name = coalesce(excluded.display_name, k.display_name),
          customer_id = coalesce(k.customer_id, excluded.customer_id)
    returning k.id into v_contact;
  end if;

  insert into public.crm_conversations as c (organization_id, contact_id, external_id, channel, intent, classification, tags,
     unit_id, reservation_id, sac_ticket_id, result, summary, started_at, completed_at, origin)
  values (v_org, v_contact, _external_id, coalesce(_channel,'whatsapp'), _intent, _classification, coalesce(_tags,'{}'),
     _unit_id, v_res, v_sac, _result, _summary, _started_at, _completed_at, 'sdr')
  on conflict (organization_id, external_id) do update
    set contact_id = coalesce(excluded.contact_id, c.contact_id),
        intent = coalesce(excluded.intent, c.intent),
        classification = excluded.classification,
        tags = (select coalesce(array_agg(distinct t), '{}') from unnest(c.tags || excluded.tags) t),
        unit_id = coalesce(excluded.unit_id, c.unit_id),
        reservation_id = coalesce(excluded.reservation_id, c.reservation_id),
        sac_ticket_id = coalesce(excluded.sac_ticket_id, c.sac_ticket_id),
        result = coalesce(excluded.result, c.result),
        summary = coalesce(excluded.summary, c.summary),
        started_at = coalesce(c.started_at, excluded.started_at),
        completed_at = coalesce(excluded.completed_at, c.completed_at)
  returning c.id, (xmax = 0) into v_id, v_created;

  return jsonb_build_object('conversation_id', v_id, 'created', v_created);
end $$;

-- SDR: atendimento humano ----------------------------------------------------------
create or replace function public.sdr_handoff(_conversation_external_id text, _phone text, _full_name text default null,
  _unit_id uuid default null, _reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._default_org(); c public.crm_conversations; t public.sac_tickets;
        v_sac jsonb; v_protocol text; v_created boolean := false;
begin
  if nullif(btrim(coalesce(_conversation_external_id,'')),'') is null then raise exception 'VALIDATION_ERROR'; end if;
  if public.normalize_br_phone(_phone) is null then raise exception 'INVALID_PHONE'; end if;

  insert into public.crm_conversations as cc (organization_id, external_id, classification, tags, unit_id, handoff_at, origin)
  values (v_org, _conversation_external_id, 'atendimento_humano', '{atendimento-humano}', _unit_id, now(), 'sdr')
  on conflict (organization_id, external_id) do update
    set classification = 'atendimento_humano', handoff_at = now(), unit_id = coalesce(cc.unit_id, excluded.unit_id),
        tags = (select coalesce(array_agg(distinct x), '{}') from unnest(cc.tags || '{atendimento-humano}'::text[]) x)
  returning * into c;

  if c.sac_ticket_id is not null then
    select * into t from public.sac_tickets where id = c.sac_ticket_id and status in ('aberto','em_andamento','aguardando_cliente');
  end if;
  if t.id is null then
    v_sac := public.sdr_create_sac('atendimento', 'Atendimento humano solicitado', _reason, coalesce(_unit_id, c.unit_id),
                                   _phone, _full_name, 'alta', true, _conversation_external_id);
    v_protocol := v_sac->>'protocol'; v_created := true;
    update public.crm_conversations set classification = 'atendimento_humano' where id = c.id;
  else
    update public.sac_tickets set human_requested = true where id = t.id;
    insert into public.sac_ticket_events (ticket_id, event_type, body) values (t.id, 'atendimento_humano', coalesce(_reason, 'Cliente pediu atendimento humano'));
    v_protocol := t.protocol;
  end if;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (v_org, 'outbound', 'handoff.requested:' || _conversation_external_id || ':' || gen_random_uuid(), 'handoff.requested',
    jsonb_build_object('conversation_external_id', _conversation_external_id, 'sac_protocol', v_protocol,
      'reason', left(coalesce(_reason,''), 300), 'phone', public.normalize_br_phone(_phone), 'customer_name', _full_name));

  return jsonb_build_object('sac_protocol', v_protocol, 'sac_created', v_created);
end $$;

-- CRM: entrada (webhook) ---------------------------------------------------------
-- _payload já chega normalizado pela rota (sem texto de mensagens).
create or replace function public.crm_ingest_event(_event_id text, _event_type text, _payload jsonb)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._default_org(); v_id uuid; v_phone text; v_customer uuid; v_contact uuid; v_conv uuid;
        v_unit uuid; k jsonb := _payload->'contact'; cv jsonb := _payload->'conversation'; m jsonb := _payload->'message';
        v_opted uuid;
begin
  insert into public.crm_events (organization_id, direction, event_id, event_type, payload, status, attempts)
  values (v_org, 'inbound', _event_id, _event_type, _payload, 'processando', 1)
  on conflict (direction, event_id) do nothing
  returning id into v_id;
  if v_id is null then return 'duplicate'; end if;

  begin
    if k is not null and nullif(k->>'external_id','') is not null then
      v_phone := public.normalize_br_phone(k->>'phone');
      if v_phone is not null then
        select id into v_customer from public.customers where organization_id = v_org and phone_e164 = v_phone;
      end if;
      insert into public.crm_contacts as ct (organization_id, external_id, phone_e164, display_name, customer_id)
      values (v_org, k->>'external_id', v_phone, nullif(k->>'name',''), v_customer)
      on conflict (organization_id, external_id) do update
        set phone_e164 = coalesce(excluded.phone_e164, ct.phone_e164),
            display_name = coalesce(excluded.display_name, ct.display_name),
            customer_id = coalesce(ct.customer_id, excluded.customer_id)
      returning ct.id into v_contact;
    end if;

    if cv is not null and nullif(cv->>'external_id','') is not null then
      select unit_id into v_unit from public.crm_inbox_units where organization_id = v_org and inbox_external_id = cv->>'inbox_id';
      insert into public.crm_conversations as c (organization_id, contact_id, external_id, channel, status, inbox_external_id,
                                                 unit_id, started_at, completed_at, origin)
      values (v_org, v_contact, cv->>'external_id', 'whatsapp', nullif(cv->>'status',''), nullif(cv->>'inbox_id',''), v_unit,
              nullif(cv->>'started_at','')::timestamptz,
              case when cv->>'status' = 'resolved' then now() end, 'crm')
      on conflict (organization_id, external_id) do update
        set contact_id = coalesce(excluded.contact_id, c.contact_id),
            status = coalesce(excluded.status, c.status),
            inbox_external_id = coalesce(excluded.inbox_external_id, c.inbox_external_id),
            unit_id = coalesce(c.unit_id, excluded.unit_id),
            started_at = coalesce(c.started_at, excluded.started_at),
            completed_at = case when excluded.status = 'resolved' then coalesce(c.completed_at, now())
                                when excluded.status is not null then null else c.completed_at end
      returning c.id into v_conv;
    end if;

    if m is not null and v_conv is not null then
      update public.crm_conversations
         set message_count = message_count + 1,
             last_message_at = greatest(coalesce(last_message_at, '-infinity'), coalesce(nullif(m->>'created_at','')::timestamptz, now()))
       where id = v_conv;
    end if;

    if m is not null and coalesce((m->>'incoming')::boolean, false) and coalesce((m->>'opt_out')::boolean, false) and v_phone is not null then
      update public.customers set whatsapp_opt_out_at = now(), whatsapp_opt_in = false
       where organization_id = v_org and phone_e164 = v_phone and whatsapp_opt_out_at is null
      returning id into v_opted;
      if v_opted is not null then
        insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
        values (v_opted, 'whatsapp_transactional', false, 'crm_whatsapp_optout', '2026-10');
      end if;
    end if;

    update public.crm_events set status = 'enviado', processed_at = now(), last_error = null where id = v_id;
    return 'processed';
  exception when others then
    update public.crm_events set status = 'falhou', last_error = left(sqlerrm, 500) where id = v_id;
    return 'failed';
  end;
end $$;

-- CRM: fila de saída --------------------------------------------------------------
create or replace function public.crm_claim_outbound(_limit integer default 5)
returns setof public.crm_events language plpgsql volatile security definer set search_path = public as $$
begin
  return query
  update public.crm_events e set status = 'processando', attempts = e.attempts + 1, updated_at = now()
   where e.id in (
     select x.id from public.crm_events x
      where x.direction = 'outbound'
        and ((x.status = 'pendente' and x.next_attempt_at <= now())
             or (x.status = 'processando' and x.updated_at < now() - interval '10 minutes'))
      order by x.next_attempt_at
      limit greatest(1, least(_limit, 50))
      for update skip locked)
  returning e.*;
end $$;

create or replace function public.crm_finish_outbound(_id uuid, _ok boolean, _error text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if _ok then
    update public.crm_events set status = 'enviado', processed_at = now(), last_error = null where id = _id;
  else
    update public.crm_events
       set last_error = left(coalesce(_error,'erro desconhecido'), 1000),
           status = case when attempts >= 8 then 'falhou'::public.queue_status else 'pendente'::public.queue_status end,
           next_attempt_at = now() + make_interval(mins => least(power(2, attempts)::int, 240))
     where id = _id;
  end if;
end $$;

-- Painel (super admin) ---------------------------------------------------------------
create or replace function public.admin_create_api_key(_name text, _scopes text[] default '{read,write}')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_key text; v_id uuid; v_name text := btrim(coalesce(_name,''));
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'INVALID_NAME'; end if;
  if _scopes is null or not (_scopes <@ array['read','write']) or cardinality(_scopes) = 0 then raise exception 'VALIDATION_ERROR'; end if;
  v_key := 'cdk_' || public._rand_hex(48);
  insert into public.api_keys (organization_id, name, prefix, key_hash, scopes, created_by)
  values (public._default_org(), v_name, left(v_key, 12), encode(sha256(convert_to(v_key,'UTF8')),'hex'), _scopes, auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'key', v_key, 'prefix', left(v_key, 12));
end $$;

create or replace function public.admin_list_api_keys()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'prefix', prefix, 'scopes', to_jsonb(scopes),
    'is_active', is_active, 'last_used_at', last_used_at, 'created_at', created_at, 'revoked_at', revoked_at) order by created_at desc)
    from public.api_keys), '[]'::jsonb);
end $$;

create or replace function public.admin_revoke_api_key(_id uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  update public.api_keys set is_active = false, revoked_at = coalesce(revoked_at, now()) where id = _id;
end $$;

create or replace function public.admin_get_crm_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.integration_settings;
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  select * into s from public.integration_settings where provider = 'tryade_crm' order by created_at limit 1;
  return jsonb_build_object('base_url', s.base_url, 'account_id', s.config->>'account_id', 'enabled', coalesce(s.is_enabled,false),
    'has_webhook_token', (s.config->>'webhook_token_hash') is not null, 'webhook_token_rotated_at', s.config->>'webhook_token_rotated_at');
end $$;

create or replace function public.admin_save_crm_settings(_base_url text, _account_id text, _enabled boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_url text := nullif(rtrim(btrim(coalesce(_base_url,'')), '/'), ''); v_acc text := nullif(btrim(coalesce(_account_id,'')), '');
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  if v_url is not null and v_url !~ '^https://[^\s/]+' then raise exception 'INVALID_URL'; end if;
  if v_acc is not null and v_acc !~ '^[0-9]{1,10}$' then raise exception 'INVALID_ACCOUNT'; end if;
  if coalesce(_enabled,false) and (v_url is null or v_acc is null) then raise exception 'CRM_INCOMPLETE'; end if;
  insert into public.integration_settings as s (organization_id, provider, is_enabled, base_url, secret_name, config)
  values (public._default_org(), 'tryade_crm', coalesce(_enabled,false), v_url, 'TRYADE_CRM_API_TOKEN',
          jsonb_build_object('account_id', v_acc))
  on conflict (organization_id, provider) do update
    set is_enabled = excluded.is_enabled, base_url = excluded.base_url, secret_name = excluded.secret_name,
        config = s.config || jsonb_build_object('account_id', v_acc);
end $$;

create or replace function public.admin_rotate_crm_webhook_token()
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_token text := public._rand_hex(48);
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  insert into public.integration_settings as s (organization_id, provider, secret_name, config)
  values (public._default_org(), 'tryade_crm', 'TRYADE_CRM_API_TOKEN',
          jsonb_build_object('webhook_token_hash', encode(sha256(convert_to(v_token,'UTF8')),'hex'), 'webhook_token_rotated_at', now()))
  on conflict (organization_id, provider) do update
    set config = s.config || jsonb_build_object('webhook_token_hash', encode(sha256(convert_to(v_token,'UTF8')),'hex'),
                                                'webhook_token_rotated_at', now());
  return v_token;
end $$;

-- Permissões das funções -----------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'public._default_org()', 'public._rand_hex(integer)', 'public.sac_sla_hours(public.sac_category)',
    'public.enqueue_reservation_crm_event()', 'public.enqueue_sac_crm_event()',
    'public.sdr_auth(text)', 'public.sdr_list_units()',
    'public.sdr_create_reservation(uuid,date,time,integer,text,text,text,boolean,text,text)',
    'public.sdr_find_reservations(text,text)',
    'public.sdr_update_reservation(text,text,date,time,integer)',
    'public.sdr_cancel_reservation(text,text,text)',
    'public.sdr_create_sac(public.sac_category,text,text,uuid,text,text,public.sac_priority,boolean,text)',
    'public.sdr_classify_conversation(text,public.crm_classification,text,text[],uuid,text,text,timestamptz,timestamptz,text,text,text,text,text,text)',
    'public.sdr_handoff(text,text,text,uuid,text)',
    'public.crm_ingest_event(text,text,jsonb)', 'public.crm_claim_outbound(integer)', 'public.crm_finish_outbound(uuid,boolean,text)']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array[
    'public.admin_create_api_key(text,text[])', 'public.admin_list_api_keys()', 'public.admin_revoke_api_key(uuid)',
    'public.admin_get_crm_settings()', 'public.admin_save_crm_settings(text,text,boolean)', 'public.admin_rotate_crm_webhook_token()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

grant execute on function public.get_unit_slots(uuid,date,integer) to service_role;
grant execute on function public.get_unit_available_dates(uuid,date,date,integer) to service_role;
grant execute on function public.normalize_br_phone(text) to service_role;
