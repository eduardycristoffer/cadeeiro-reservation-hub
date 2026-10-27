-- Atendente (SDR/n8n): valores editáveis, delivery, follow-up de reservas e configuração por unidade.
alter table public.units
  add column if not exists services text[] not null default '{}',
  add column if not exists has_delivery boolean not null default false,
  add column if not exists agent_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_services_check') then
    alter table public.units add constraint units_services_check
      check (services <@ array['rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_agent_notes_check') then
    alter table public.units add constraint units_agent_notes_check
      check (agent_notes is null or char_length(agent_notes) <= 4000);
  end if;
  alter table public.reservations drop constraint if exists reservations_service_check;
  alter table public.reservations add constraint reservations_service_check
    check (service is null or service in ('rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo'));
  alter table public.reservation_leads drop constraint if exists reservation_leads_service_check;
  alter table public.reservation_leads add constraint reservation_leads_service_check
    check (service is null or service in ('rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo'));
end $$;

create table if not exists public.price_tables (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  valid_from date,
  valid_until date,
  priority integer not null default 0,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_from is null or valid_until is null or valid_until >= valid_from)
);
create index if not exists price_tables_unit_idx on public.price_tables(unit_id, is_active);

create table if not exists public.price_rules (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.price_tables(id) on delete cascade,
  service text not null check (service in ('rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo')),
  weekdays smallint[] not null default '{}' check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  on_holidays boolean not null default false,
  amount numeric(10,2) not null check (amount >= 0 and amount < 100000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(weekdays) > 0 or on_holidays)
);
create index if not exists price_rules_table_idx on public.price_rules(table_id, service);

create table if not exists public.price_child_policies (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.price_tables(id) on delete cascade,
  service text not null check (service in ('rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo')),
  free_until_age smallint check (free_until_age is null or free_until_age between 0 and 17),
  child_from_age smallint check (child_from_age is null or child_from_age between 0 and 17),
  child_to_age smallint check (child_to_age is null or child_to_age between 0 and 17),
  child_amount numeric(10,2) check (child_amount is null or (child_amount >= 0 and child_amount < 100000)),
  full_from_age smallint check (full_from_age is null or full_from_age between 1 and 18),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (table_id, service),
  check ((child_from_age is null) = (child_to_age is null) and (child_from_age is null) = (child_amount is null)),
  check (child_from_age is null or child_to_age >= child_from_age)
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  holiday_date date not null,
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, holiday_date)
);

do $$
declare t text;
begin
  foreach t in array array['price_tables', 'price_rules', 'price_child_policies'] loop
    execute format('drop trigger if exists %I_updated_at on public.%I', t, t);
    execute format('create trigger %I_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_row()', t, t);
  end loop;
end $$;

alter table public.price_tables enable row level security;
alter table public.price_rules enable row level security;
alter table public.price_child_policies enable row level security;
alter table public.holidays enable row level security;

drop policy if exists "staff lê tabelas de valores" on public.price_tables;
create policy "staff lê tabelas de valores" on public.price_tables for select to authenticated
  using (public.can_access_unit(auth.uid(), unit_id));
drop policy if exists "gestor gerencia tabelas de valores" on public.price_tables;
create policy "gestor gerencia tabelas de valores" on public.price_tables for all to authenticated
  using (public.can_manage_unit(auth.uid(), unit_id)) with check (public.can_manage_unit(auth.uid(), unit_id));

drop policy if exists "staff lê regras de valores" on public.price_rules;
create policy "staff lê regras de valores" on public.price_rules for select to authenticated
  using (exists (select 1 from public.price_tables t where t.id = table_id and public.can_access_unit(auth.uid(), t.unit_id)));
drop policy if exists "gestor gerencia regras de valores" on public.price_rules;
create policy "gestor gerencia regras de valores" on public.price_rules for all to authenticated
  using (exists (select 1 from public.price_tables t where t.id = table_id and public.can_manage_unit(auth.uid(), t.unit_id)))
  with check (exists (select 1 from public.price_tables t where t.id = table_id and public.can_manage_unit(auth.uid(), t.unit_id)));

drop policy if exists "staff lê política infantil" on public.price_child_policies;
create policy "staff lê política infantil" on public.price_child_policies for select to authenticated
  using (exists (select 1 from public.price_tables t where t.id = table_id and public.can_access_unit(auth.uid(), t.unit_id)));
drop policy if exists "gestor gerencia política infantil" on public.price_child_policies;
create policy "gestor gerencia política infantil" on public.price_child_policies for all to authenticated
  using (exists (select 1 from public.price_tables t where t.id = table_id and public.can_manage_unit(auth.uid(), t.unit_id)))
  with check (exists (select 1 from public.price_tables t where t.id = table_id and public.can_manage_unit(auth.uid(), t.unit_id)));

drop policy if exists "staff lê feriados" on public.holidays;
create policy "staff lê feriados" on public.holidays for select to authenticated using (public.is_staff(auth.uid()));
drop policy if exists "gestor gerencia feriados" on public.holidays;
create policy "gestor gerencia feriados" on public.holidays for all to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'))
  with check (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));

revoke all on public.price_tables, public.price_rules, public.price_child_policies, public.holidays from anon, authenticated;
grant select, insert, update, delete on public.price_tables, public.price_rules, public.price_child_policies, public.holidays to authenticated;
grant all on public.price_tables, public.price_rules, public.price_child_policies, public.holidays to service_role;

create or replace function public.resolve_unit_prices(_unit_id uuid, _date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  u public.units;
  v_dow integer := extract(dow from _date)::int;
  v_holiday text;
  v_services jsonb := '[]'::jsonb;
  s text;
  t public.price_tables;
begin
  select * into u from public.units where id = _unit_id;
  if not found then return null; end if;
  select h.name into v_holiday from public.holidays h where h.organization_id = u.organization_id and h.holiday_date = _date;

  foreach s in array u.services loop
    select pt.* into t from public.price_tables pt
     where pt.unit_id = _unit_id and pt.is_active
       and (pt.valid_from is null or pt.valid_from <= _date)
       and (pt.valid_until is null or pt.valid_until >= _date)
       and exists (select 1 from public.price_rules r where r.table_id = pt.id and r.service = s)
     order by pt.priority desc, coalesce(pt.valid_from, '-infinity'::date) desc, pt.created_at desc
     limit 1;
    if not found then continue; end if;

    v_services := v_services || jsonb_build_array(jsonb_build_object(
      'service', s,
      'table_id', t.id, 'table_name', t.name, 'valid_from', t.valid_from, 'valid_until', t.valid_until,
      'rules', (select coalesce(jsonb_agg(jsonb_build_object('weekdays', r.weekdays, 'on_holidays', r.on_holidays, 'amount', r.amount)
                                          order by r.sort_order, r.created_at), '[]'::jsonb)
                  from public.price_rules r where r.table_id = t.id and r.service = s),
      'price_on_date', (select r.amount from public.price_rules r
                         where r.table_id = t.id and r.service = s
                           and ((v_holiday is not null and r.on_holidays) or v_dow = any (r.weekdays))
                         order by (case when v_holiday is not null and r.on_holidays then 0 else 1 end), r.sort_order
                         limit 1),
      'child', (select jsonb_build_object('free_until_age', c.free_until_age, 'child_from_age', c.child_from_age,
                         'child_to_age', c.child_to_age, 'child_amount', c.child_amount, 'full_from_age', c.full_from_age)
                  from public.price_child_policies c where c.table_id = t.id and c.service = s)
    ));
  end loop;

  return jsonb_build_object(
    'unit', jsonb_build_object('id', u.id, 'slug', u.slug, 'name', u.name, 'city', u.city, 'services', to_jsonb(u.services),
                               'has_delivery', u.has_delivery),
    'date', _date, 'weekday', v_dow, 'is_holiday', v_holiday is not null, 'holiday_name', v_holiday,
    'services', v_services);
end $$;

create or replace function public.get_unit_prices(_unit_id uuid, _date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_access_unit(auth.uid(), _unit_id) then raise exception 'FORBIDDEN'; end if;
  return public.resolve_unit_prices(_unit_id, _date);
end $$;

revoke all on function public.resolve_unit_prices(uuid, date) from public, anon, authenticated;
grant execute on function public.resolve_unit_prices(uuid, date) to service_role;
revoke all on function public.get_unit_prices(uuid, date) from public, anon;
grant execute on function public.get_unit_prices(uuid, date) to authenticated;

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  protocol text not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  items_text text not null check (char_length(items_text) between 3 and 1500),
  address text not null check (char_length(address) between 5 and 300),
  neighborhood text check (neighborhood is null or char_length(neighborhood) <= 100),
  address_reference text check (address_reference is null or char_length(address_reference) <= 200),
  payment_method text check (payment_method is null or payment_method in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  change_for numeric(10,2) check (change_for is null or (change_for > 0 and change_for < 100000)),
  notes text check (notes is null or char_length(notes) <= 500),
  status text not null default 'novo' check (status in ('novo', 'em_preparo', 'saiu_para_entrega', 'entregue', 'cancelado')),
  origin text not null default 'sdr_whatsapp',
  conversation_external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_orders_unit_status_idx on public.delivery_orders(unit_id, status, created_at desc);

drop trigger if exists delivery_orders_updated_at on public.delivery_orders;
create trigger delivery_orders_updated_at before update on public.delivery_orders
for each row execute function public.set_updated_at();
drop trigger if exists delivery_orders_audit on public.delivery_orders;
create trigger delivery_orders_audit after insert or update or delete on public.delivery_orders
for each row execute function public.audit_row();

alter table public.delivery_orders enable row level security;
drop policy if exists "staff lê pedidos de delivery" on public.delivery_orders;
create policy "staff lê pedidos de delivery" on public.delivery_orders for select to authenticated
  using (public.can_access_unit(auth.uid(), unit_id));

revoke all on public.delivery_orders from anon, authenticated;
grant select on public.delivery_orders to authenticated;
grant all on public.delivery_orders to service_role;

create or replace function public.sdr_create_delivery_order(
  _unit_id uuid, _full_name text, _phone text, _items_text text, _address text,
  _neighborhood text default null, _address_reference text default null, _payment_method text default null,
  _change_for numeric default null, _notes text default null, _conversation_external_id text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_items text := nullif(btrim(coalesce(_items_text,'')), '');
  v_addr text := nullif(btrim(coalesce(_address,'')), '');
  v_customer uuid; v_protocol text; v_id uuid;
begin
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_items is null or length(v_items) < 3 or length(v_items) > 1500 then raise exception 'VALIDATION_ERROR'; end if;
  if v_addr is null or length(v_addr) < 5 or length(v_addr) > 300 then raise exception 'VALIDATION_ERROR'; end if;
  select * into u from public.units where id = _unit_id and is_active;
  if not found then raise exception 'UNIT_NOT_FOUND'; end if;
  if not u.has_delivery then raise exception 'DELIVERY_UNAVAILABLE'; end if;

  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, false)
  on conflict (organization_id, phone_e164) do update
    set full_name = case when coalesce(btrim(c.full_name),'') = '' then excluded.full_name else c.full_name end
  returning c.id into v_customer;

  loop
    v_protocol := 'DEL-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || upper(public._rand_hex(5));
    exit when not exists (select 1 from public.delivery_orders d where d.protocol = v_protocol);
  end loop;

  insert into public.delivery_orders (protocol, organization_id, unit_id, customer_id, items_text, address, neighborhood,
                                      address_reference, payment_method, change_for, notes, conversation_external_id)
  values (v_protocol, u.organization_id, _unit_id, v_customer, v_items, v_addr, nullif(btrim(coalesce(_neighborhood,'')),''),
          nullif(btrim(coalesce(_address_reference,'')),''), _payment_method, _change_for,
          nullif(btrim(coalesce(_notes,'')),''), nullif(btrim(coalesce(_conversation_external_id,'')),''))
  returning id into v_id;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'delivery.created:' || v_id, 'delivery.created',
          jsonb_build_object('delivery_id', v_id, 'protocol', v_protocol, 'unit_id', _unit_id, 'status', 'novo', 'phone', v_phone));

  return jsonb_build_object('protocol', v_protocol, 'status', 'novo', 'unit_name', u.name);
end $$;

create or replace function public.sdr_get_delivery_orders(_phone text, _protocol text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_phone text := public.normalize_br_phone(_phone);
begin
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('protocol', d.protocol, 'status', d.status, 'unit_name', u.name,
             'items', d.items_text, 'address', d.address, 'created_at', d.created_at) order by d.created_at desc)
    from public.delivery_orders d
    join public.customers c on c.id = d.customer_id
    join public.units u on u.id = d.unit_id
    where c.phone_e164 = v_phone
      and (nullif(_protocol,'') is null or d.protocol = upper(btrim(_protocol)))
      and d.created_at > now() - interval '3 days'
  ), '[]'::jsonb);
end $$;

create or replace function public.set_delivery_status(_order_id uuid, _status text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare d public.delivery_orders;
begin
  select * into d from public.delivery_orders where id = _order_id for update;
  if not found or not public.can_access_unit(auth.uid(), d.unit_id) then raise exception 'FORBIDDEN'; end if;
  if not ((d.status = 'novo' and _status in ('em_preparo', 'cancelado'))
       or (d.status = 'em_preparo' and _status in ('saiu_para_entrega', 'cancelado'))
       or (d.status = 'saiu_para_entrega' and _status in ('entregue', 'cancelado'))) then
    raise exception 'INVALID_TRANSITION';
  end if;
  update public.delivery_orders set status = _status where id = _order_id;
  return _status;
end $$;

create table if not exists public.reservation_followups (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  kind text not null check (kind in ('lembrete_vespera', 'lembrete_dia')),
  status text not null check (status in ('enviado', 'falhou')),
  attempts integer not null default 1,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reservation_id, kind)
);
alter table public.reservation_followups enable row level security;
revoke all on public.reservation_followups from anon, authenticated;
grant all on public.reservation_followups to service_role;
drop trigger if exists reservation_followups_updated_at on public.reservation_followups;
create trigger reservation_followups_updated_at before update on public.reservation_followups
for each row execute function public.set_updated_at();

create or replace function public.sdr_followups_due(_limit integer default 20, _now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare now_sp timestamp := (_now at time zone 'America/Sao_Paulo');
begin
  return coalesce((
    select jsonb_agg(q.item) from (
      select jsonb_build_object(
        'kind', k.kind, 'protocol', r.protocol,
        'unit_id', u.id, 'unit_slug', u.slug, 'unit_name', u.name,
        'date', r.reservation_date, 'time', to_char(r.reservation_time, 'HH24:MI'), 'party_size', r.party_size,
        'service', r.service, 'occasion', r.occasion, 'celebrant_name', r.celebrant_name,
        'first_name', split_part(c.full_name, ' ', 1), 'phone', c.phone_e164, 'attempts', coalesce(f.attempts, 0),
        'conversation_external_id', (select cc.external_id from public.crm_conversations cc
                                      where cc.reservation_id = r.id order by cc.updated_at desc limit 1)
      ) as item, r.reservation_date, r.reservation_time
      from public.reservations r
      join public.customers c on c.id = r.customer_id and c.whatsapp_opt_in and c.whatsapp_opt_out_at is null
      join public.units u on u.id = r.unit_id
      cross join lateral (values ('lembrete_vespera'), ('lembrete_dia')) k(kind)
      left join public.reservation_followups f on f.reservation_id = r.id and f.kind = k.kind
      where r.status = 'confirmada'
        and (f.id is null or (f.status = 'falhou' and f.attempts < 3 and f.updated_at < _now - interval '15 minutes'))
        and ((k.kind = 'lembrete_vespera' and r.reservation_date = now_sp::date + 1 and now_sp::time between time '10:00' and time '20:00')
          or (k.kind = 'lembrete_dia' and r.reservation_date = now_sp::date
              and (r.reservation_date + r.reservation_time) - now_sp between interval '1 hour' and interval '3 hours 30 minutes'))
      order by r.reservation_date, r.reservation_time
      limit greatest(1, least(coalesce(_limit, 20), 50))
    ) q
  ), '[]'::jsonb);
end $$;

create or replace function public.sdr_mark_followup(_protocol text, _kind text, _ok boolean, _error text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_res uuid;
begin
  if _kind not in ('lembrete_vespera', 'lembrete_dia') then raise exception 'VALIDATION_ERROR'; end if;
  select id into v_res from public.reservations where protocol = upper(btrim(_protocol));
  if v_res is null then raise exception 'RESERVATION_NOT_FOUND'; end if;
  insert into public.reservation_followups as f (reservation_id, kind, status, attempts, last_error, sent_at)
  values (v_res, _kind, case when _ok then 'enviado' else 'falhou' end, 1, left(_error, 500), case when _ok then now() end)
  on conflict (reservation_id, kind) do update
    set status = case when _ok then 'enviado' else 'falhou' end,
        attempts = f.attempts + 1,
        last_error = case when _ok then null else left(_error, 500) end,
        sent_at = case when _ok then now() else f.sent_at end;
end $$;

create or replace function public.sdr_list_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u.id, 'slug', u.slug, 'name', u.name, 'address', u.address, 'city', u.city, 'phone', u.phone,
    'description', u.description,
    'large_group_threshold', u.large_group_threshold, 'max_advance_days', u.max_advance_days,
    'min_advance_minutes', u.min_advance_minutes, 'auto_confirm', u.auto_confirm,
    'services', to_jsonb(u.services), 'has_delivery', u.has_delivery, 'agent_notes', u.agent_notes,
    'hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', r.weekday, 'start', to_char(r.start_time,'HH24:MI'),
                         'end', to_char(r.end_time,'HH24:MI'), 'shift', r.shift_label) order by r.weekday, r.start_time)
                       from public.reservation_capacity_rules r where r.unit_id = u.id and r.is_active), '[]'::jsonb)
  ) order by u.sort_order, u.name), '[]'::jsonb)
  from public.units u where u.is_active and u.accepts_online_reservations
$$;

create or replace function public.sdr_unit_by_inbox(_inbox text)
returns uuid language sql stable security definer set search_path = public as $$
  select m.unit_id from public.crm_inbox_units m
   where m.inbox_external_id = btrim(_inbox) or m.inbox_external_id = split_part(btrim(_inbox), ':', 2)
   order by (m.inbox_external_id = btrim(_inbox)) desc
   limit 1
$$;

drop function if exists public.sdr_create_reservation(uuid,date,time,integer,text,text,text,boolean,text,text);

create or replace function public.sdr_create_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer, _full_name text, _phone text,
  _notes text default null, _whatsapp_opt_in boolean default true,
  _conversation_external_id text default null, _contact_external_id text default null,
  _service text default null, _occasion text default null, _celebrant_name text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
  v_service text := nullif(btrim(coalesce(_service,'')), '');
  v_occasion text := nullif(btrim(coalesce(_occasion,'')), '');
  v_celebrant text := nullif(btrim(regexp_replace(coalesce(_celebrant_name,''), '\s+', ' ', 'g')), '');
  v_customer uuid; v_opted_out timestamptz; v_consent boolean := false;
  v_status public.reservation_status; v_large boolean; v_protocol text; v_ok boolean; v_res uuid;
begin
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if _party_size is null or _party_size < 1 or _party_size > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  if v_service is not null and v_service not in ('rodizio_carnes', 'rodizio_pizza', 'almoco_quilo', 'almoco_executivo') then raise exception 'INVALID_SERVICE'; end if;
  if v_occasion is not null and v_occasion not in ('aniversario', 'romantico', 'comemoracao', 'negocios', 'familia', 'nenhuma') then raise exception 'INVALID_OCCASION'; end if;
  if v_celebrant is not null and length(v_celebrant) > 60 then raise exception 'INVALID_CELEBRANT'; end if;

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
                                   party_size, notes, origin, status, is_large_group, confirmed_at,
                                   service, occasion, celebrant_name)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          'sdr_whatsapp', v_status, v_large, case when v_status = 'confirmada' then now() end,
          v_service, v_occasion, v_celebrant)
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
      'phone', v_phone, 'customer_name', v_name, 'service', v_service, 'occasion', v_occasion,
      'conversation_external_id', nullif(_conversation_external_id,''), 'contact_external_id', nullif(_contact_external_id,'')));

  return jsonb_build_object('protocol', v_protocol, 'status', v_status, 'unit_name', u.name,
    'date', _date, 'time', to_char(_time,'HH24:MI'), 'party_size', _party_size, 'is_large_group', v_large,
    'whatsapp_consent_registered', v_consent);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sdr_create_delivery_order(uuid,text,text,text,text,text,text,text,numeric,text,text)',
    'public.sdr_get_delivery_orders(text,text)',
    'public.sdr_followups_due(integer,timestamptz)',
    'public.sdr_mark_followup(text,text,boolean,text)',
    'public.sdr_unit_by_inbox(text)',
    'public.sdr_create_reservation(uuid,date,time,integer,text,text,text,boolean,text,text,text,text,text)',
    'public.sdr_list_units()']
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  revoke all on function public.set_delivery_status(uuid,text) from public, anon;
  grant execute on function public.set_delivery_status(uuid,text) to authenticated;
end $$;

create or replace function public.run_data_retention()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n_logs int; n_events int; n_outbox int; n_audit int; n_idem int; n_leads int; n_follow int;
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

  delete from public.reservation_followups where created_at < now() - interval '90 days';
  get diagnostics n_follow = row_count;

  return jsonb_build_object('integration_event_logs', n_logs, 'crm_events', n_events,
    'message_outbox', n_outbox, 'audit_logs', n_audit, 'api_idempotency', n_idem, 'reservation_leads', n_leads,
    'reservation_followups', n_follow);
end $$;

revoke all on function public.run_data_retention() from public, anon, authenticated;
grant execute on function public.run_data_retention() to service_role;