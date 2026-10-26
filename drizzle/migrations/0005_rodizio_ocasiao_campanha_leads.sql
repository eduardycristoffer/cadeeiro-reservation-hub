alter table public.reservations
  add column if not exists service text,
  add column if not exists occasion text,
  add column if not exists celebrant_name text,
  add column if not exists campaign text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_service_check') then
    alter table public.reservations add constraint reservations_service_check
      check (service is null or service in ('rodizio_carnes', 'rodizio_pizza'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_occasion_check') then
    alter table public.reservations add constraint reservations_occasion_check
      check (occasion is null or occasion in ('aniversario', 'romantico', 'comemoracao', 'negocios', 'familia', 'nenhuma'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_celebrant_len_check') then
    alter table public.reservations add constraint reservations_celebrant_len_check
      check (celebrant_name is null or char_length(celebrant_name) <= 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_campaign_format_check') then
    alter table public.reservations add constraint reservations_campaign_format_check
      check (campaign is null or campaign ~ '^[a-z0-9_-]{1,60}$');
  end if;
end $$;

create index if not exists reservations_service_idx on public.reservations(service);
create index if not exists reservations_campaign_idx on public.reservations(campaign) where campaign is not null;

create table if not exists public.reservation_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  phone_e164 text not null,
  service text check (service is null or service in ('rodizio_carnes', 'rodizio_pizza')),
  campaign text check (campaign is null or campaign ~ '^[a-z0-9_-]{1,60}$'),
  whatsapp_opt_in boolean not null default false,
  status text not null default 'iniciada' check (status in ('iniciada', 'convertida')),
  unit_id uuid references public.units(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, phone_e164)
);
create index if not exists reservation_leads_status_idx on public.reservation_leads(status, created_at desc);
create index if not exists reservation_leads_campaign_idx on public.reservation_leads(campaign) where campaign is not null;

drop trigger if exists reservation_leads_updated_at on public.reservation_leads;
create trigger reservation_leads_updated_at before update on public.reservation_leads
for each row execute function public.set_updated_at();

alter table public.reservation_leads enable row level security;
drop policy if exists "super admin lê leads" on public.reservation_leads;
create policy "super admin lê leads" on public.reservation_leads for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin'));

revoke all on public.reservation_leads from anon, authenticated;
grant select on public.reservation_leads to authenticated;
grant all on public.reservation_leads to service_role;

create or replace function public.capture_reservation_lead(
  _full_name text, _phone text, _service text default null, _campaign text default null,
  _privacy_accepted boolean default false, _whatsapp_opt_in boolean default false,
  _website text default null -- honeypot
)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_service text := nullif(btrim(coalesce(_service,'')), '');
  v_campaign text := nullif(lower(btrim(coalesce(_campaign,''))), '');
  v_ip text := coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1), ''), 'na');
  v_org uuid := public._default_org();
begin
  if coalesce(_website,'') <> '' then raise exception 'SPAM_DETECTED'; end if;
  if not coalesce(_privacy_accepted,false) then raise exception 'PRIVACY_REQUIRED'; end if;
  if length(v_name) < 3 or length(v_name) > 120 or v_name !~ '\s' then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_service is not null and v_service not in ('rodizio_carnes', 'rodizio_pizza') then raise exception 'INVALID_SERVICE'; end if;
  if v_campaign is not null and v_campaign !~ '^[a-z0-9_-]{1,60}$' then v_campaign := null; end if;
  if not public.hit_rate_limit('leadip:' || v_ip, 30) or not public.hit_rate_limit('leadphone:' || v_phone, 8) then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.reservation_leads as l (organization_id, full_name, phone_e164, service, campaign, whatsapp_opt_in)
  values (v_org, v_name, v_phone, v_service, v_campaign, coalesce(_whatsapp_opt_in,false))
  on conflict (organization_id, phone_e164) do update
    set full_name = excluded.full_name,
        service = coalesce(excluded.service, l.service),
        campaign = coalesce(l.campaign, excluded.campaign),
        whatsapp_opt_in = excluded.whatsapp_opt_in,
        status = case when l.status = 'convertida' then l.status else 'iniciada' end;
end $$;

drop function if exists public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text);

create or replace function public.create_public_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer,
  _full_name text, _phone text, _notes text default null,
  _privacy_accepted boolean default false, _whatsapp_opt_in boolean default false,
  _website text default null, -- honeypot
  _service text default null, _occasion text default null,
  _celebrant_name text default null, _campaign text default null
)
returns table (protocol text, status public.reservation_status, unit_name text,
               reservation_date date, reservation_time time, party_size integer, is_large_group boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
  v_service text := nullif(btrim(coalesce(_service,'')), '');
  v_occasion text := nullif(btrim(coalesce(_occasion,'')), '');
  v_celebrant text := nullif(btrim(regexp_replace(coalesce(_celebrant_name,''), '\s+', ' ', 'g')), '');
  v_campaign text := nullif(lower(btrim(coalesce(_campaign,''))), '');
  v_ip text := coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1), ''), 'na');
  v_customer uuid;
  v_opted_out timestamptz;
  v_wa boolean;
  v_status public.reservation_status;
  v_large boolean;
  v_protocol text;
  v_ok boolean;
  v_res uuid;
begin
  if coalesce(_website,'') <> '' then raise exception 'SPAM_DETECTED'; end if;
  if not coalesce(_privacy_accepted,false) then raise exception 'PRIVACY_REQUIRED'; end if;
  if length(v_name) < 3 or length(v_name) > 120 or v_name !~ '\s' then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if _party_size is null or _party_size < 1 or _party_size > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  if v_service is not null and v_service not in ('rodizio_carnes', 'rodizio_pizza') then raise exception 'INVALID_SERVICE'; end if;
  if v_occasion is not null and v_occasion not in ('aniversario', 'romantico', 'comemoracao', 'negocios', 'familia', 'nenhuma') then
    raise exception 'INVALID_OCCASION';
  end if;
  if v_celebrant is not null and length(v_celebrant) > 60 then raise exception 'INVALID_CELEBRANT'; end if;
  if v_campaign is not null and v_campaign !~ '^[a-z0-9_-]{1,60}$' then v_campaign := null; end if;
  if not public.hit_rate_limit('ip:' || v_ip, 20) or not public.hit_rate_limit('phone:' || v_phone, 5) then
    raise exception 'RATE_LIMITED';
  end if;

  select * into u from public.units where id = _unit_id and is_active and accepts_online_reservations;
  if not found then raise exception 'UNIT_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(_unit_id::text || _date::text || _time::text, 0));

  select s.available into v_ok from public.get_unit_slots(_unit_id, _date, _party_size) s where s.slot_time = _time;
  if v_ok is distinct from true then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := _party_size > u.large_group_threshold;
  v_status := case when u.auto_confirm and not v_large then 'confirmada' else 'pendente' end;

  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, coalesce(_whatsapp_opt_in,false))
  on conflict (organization_id, phone_e164) do update
    set full_name = case when coalesce(btrim(c.full_name),'') = '' then excluded.full_name else c.full_name end,
        whatsapp_opt_in = case when c.whatsapp_opt_out_at is not null then c.whatsapp_opt_in
                               else c.whatsapp_opt_in or excluded.whatsapp_opt_in end
  returning c.id, c.whatsapp_opt_out_at into v_customer, v_opted_out;

  v_wa := coalesce(_whatsapp_opt_in,false) and v_opted_out is null;

  insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
  values (v_customer, 'privacy_notice', true, 'landing_page', '2026-10');
  if v_wa then
    insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
    values (v_customer, 'whatsapp_transactional', true, 'landing_page', '2026-10');
  end if;

  loop
    v_protocol := 'CAD-' || to_char(_date, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.reservations r where r.protocol = v_protocol);
  end loop;

  insert into public.reservations (protocol, organization_id, unit_id, customer_id, reservation_date, reservation_time,
                                   party_size, notes, origin, status, is_large_group, confirmed_at,
                                   service, occasion, celebrant_name, campaign)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          'landing_page', v_status, v_large, case when v_status = 'confirmada' then now() end,
          v_service, v_occasion, v_celebrant, v_campaign)
  returning id into v_res;

  update public.reservation_leads
     set status = 'convertida', reservation_id = v_res, unit_id = _unit_id
   where organization_id = u.organization_id and phone_e164 = v_phone;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
          jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id,
                             'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status,
                             'origin', 'landing_page', 'phone', v_phone,
                             'service', v_service, 'occasion', v_occasion, 'campaign', v_campaign));

  if v_wa then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key)
    values (u.organization_id, v_customer, v_res,
            case when v_status = 'confirmada' then 'reserva_confirmada' else 'reserva_solicitada' end,
            'reservation:' || v_res || ':' || v_status);
  end if;

  return query select v_protocol, v_status, u.name, _date, _time, _party_size, v_large;
end $$;

revoke all on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text,text,text,text,text) from public;
grant execute on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text,text,text,text,text) to anon, authenticated;

revoke all on function public.capture_reservation_lead(text,text,text,text,boolean,boolean,text) from public;
grant execute on function public.capture_reservation_lead(text,text,text,text,boolean,boolean,text) to anon, authenticated;

create or replace function public.run_data_retention()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n_logs int; n_events int; n_outbox int; n_audit int; n_idem int; n_leads int;
begin
  delete from public.integration_event_logs where created_at < now() - interval '90 days';
  get diagnostics n_logs = row_count;

  delete from public.crm_events
   where status in ('enviado','entregue','lido','cancelado','falhou')
     and created_at < now() - interval '90 days';
  get diagnostics n_events = row_count;

  delete from public.message_outbox
   where status in ('enviado','entregue','lido','cancelado','falhou')
     and created_at < now() - interval '180 days';
  get diagnostics n_outbox = row_count;

  delete from public.audit_logs where created_at < now() - interval '365 days';
  get diagnostics n_audit = row_count;

  delete from public.api_idempotency where expires_at < now();
  get diagnostics n_idem = row_count;

  delete from public.reservation_leads
   where (status = 'iniciada' and created_at < now() - interval '90 days')
      or created_at < now() - interval '180 days';
  get diagnostics n_leads = row_count;

  return jsonb_build_object('integration_event_logs', n_logs, 'crm_events', n_events,
    'message_outbox', n_outbox, 'audit_logs', n_audit, 'api_idempotency', n_idem, 'reservation_leads', n_leads);
end $$;

revoke all on function public.run_data_retention() from public, anon, authenticated;
grant execute on function public.run_data_retention() to service_role;