-- Fase 4: painel de reservas, correções LGPD da reserva pública e gestão de equipe.

-- Papéis só valem para perfis ativos (desativar usuário corta o acesso no banco).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r
                 join public.user_profiles p on p.id = r.user_id and p.is_active
                 where r.user_id = _user_id and r.role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles r
                 join public.user_profiles p on p.id = r.user_id and p.is_active
                 where r.user_id = _user_id)
$$;

-- Histórico grava a nota definida pela RPC na mesma transação.
create or replace function public.log_reservation_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_note text := nullif(current_setting('app.status_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), v_note);
  elsif new.status is distinct from old.status then
    insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by, note)
    values (new.id, old.status, new.status, auth.uid(), v_note);
    if new.status = 'confirmada' then new.confirmed_at := coalesce(new.confirmed_at, now()); end if;
    if new.status = 'cancelada' then new.cancelled_at := coalesce(new.cancelled_at, now()); end if;
  end if;
  return new;
end $$;

-- Reserva pública: não sobrescreve nome existente e respeita opt-out de WhatsApp.
create or replace function public.create_public_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer,
  _full_name text, _phone text, _notes text default null,
  _privacy_accepted boolean default false, _whatsapp_opt_in boolean default false,
  _website text default null -- honeypot
)
returns table (protocol text, status public.reservation_status, unit_name text,
               reservation_date date, reservation_time time, party_size integer, is_large_group boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
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
                                   party_size, notes, origin, status, is_large_group, confirmed_at)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          'landing_page', v_status, v_large, case when v_status = 'confirmada' then now() end)
  returning id into v_res;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
          jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id,
                             'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status,
                             'origin', 'landing_page', 'phone', v_phone));

  if v_wa then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key)
    values (u.organization_id, v_customer, v_res,
            case when v_status = 'confirmada' then 'reserva_confirmada' else 'reserva_solicitada' end,
            'reservation:' || v_res || ':' || v_status);
  end if;

  return query select v_protocol, v_status, u.name, _date, _time, _party_size, v_large;
end $$;

-- Horários para uso interno (ignora "aceita reservas online" e antecedência mínima).
create or replace function public.staff_unit_slots(_unit_id uuid, _date date, _party_size integer default 1)
returns table (slot_time time, remaining integer, available boolean)
language plpgsql stable security definer set search_path = public as $$
declare now_sp timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  if not public.can_access_unit(auth.uid(), _unit_id) then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.units where id = _unit_id and is_active) then return; end if;
  if _date < now_sp::date then return; end if;
  if exists (select 1 from public.reservation_blocks b where b.unit_id = _unit_id and b.block_date = _date and b.start_time is null) then return; end if;
  return query
  with rules as (
    select r.* from public.reservation_capacity_rules r
    where r.unit_id = _unit_id and r.is_active and r.weekday = extract(dow from _date)::int
  ), slots as (
    select distinct on (gs::time) gs::time as t, r.max_guests_per_slot as cap, r.max_party_size as maxp
    from rules r,
      generate_series(_date + r.start_time, _date + r.end_time - make_interval(mins => r.slot_interval_minutes),
                      make_interval(mins => r.slot_interval_minutes)) gs
    order by gs::time, r.max_guests_per_slot desc
  ), occ as (
    select res.reservation_time as t, sum(res.party_size)::int as used
    from public.reservations res
    where res.unit_id = _unit_id and res.reservation_date = _date and res.status in ('pendente','confirmada')
    group by res.reservation_time
  )
  select s.t, greatest(s.cap - coalesce(o.used,0), 0)::int,
         (s.cap - coalesce(o.used,0) >= greatest(_party_size,1))
  from slots s left join occ o on o.t = s.t
  where (_date + s.t) >= now_sp
    and not exists (select 1 from public.reservation_blocks b
                    where b.unit_id = _unit_id and b.block_date = _date and b.start_time is not null
                      and s.t >= b.start_time and s.t < b.end_time)
  order by s.t;
end $$;

-- Reserva manual (balcão/telefone) com o mesmo lock e revalidação de capacidade.
create or replace function public.create_staff_reservation(
  _unit_id uuid, _date date, _time time, _party_size integer,
  _full_name text, _phone text, _notes text default null,
  _origin public.reservation_origin default 'painel',
  _status public.reservation_status default 'confirmada'
)
returns table (id uuid, protocol text, status public.reservation_status)
language plpgsql volatile security definer set search_path = public as $$
declare
  u public.units;
  v_phone text := public.normalize_br_phone(_phone);
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_notes text := nullif(btrim(coalesce(_notes,'')), '');
  v_customer uuid; v_status public.reservation_status; v_large boolean; v_protocol text; v_ok boolean; v_res uuid;
begin
  if not public.can_access_unit(auth.uid(), _unit_id) then raise exception 'FORBIDDEN'; end if;
  if _origin not in ('painel','telefone') then raise exception 'INVALID_ORIGIN'; end if;
  if _status not in ('pendente','confirmada') then raise exception 'INVALID_STATUS'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if _party_size is null or _party_size < 1 or _party_size > 200 then raise exception 'INVALID_PARTY_SIZE'; end if;
  if v_notes is not null and length(v_notes) > 500 then raise exception 'NOTES_TOO_LONG'; end if;

  select * into u from public.units where units.id = _unit_id and is_active;
  if not found then raise exception 'UNIT_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(_unit_id::text || _date::text || _time::text, 0));
  select s.available into v_ok from public.staff_unit_slots(_unit_id, _date, _party_size) s where s.slot_time = _time;
  if v_ok is distinct from true then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := _party_size > u.large_group_threshold;
  v_status := case when _status = 'confirmada' and v_large and not public.can_manage_unit(auth.uid(), _unit_id)
                   then 'pendente' else _status end;

  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, false)
  on conflict (organization_id, phone_e164) do update
    set full_name = case when coalesce(btrim(c.full_name),'') = '' then excluded.full_name else c.full_name end
  returning c.id into v_customer;

  loop
    v_protocol := 'CAD-' || to_char(_date, 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    exit when not exists (select 1 from public.reservations r where r.protocol = v_protocol);
  end loop;

  insert into public.reservations (protocol, organization_id, unit_id, customer_id, reservation_date, reservation_time,
                                   party_size, notes, origin, status, is_large_group, confirmed_at, created_by)
  values (v_protocol, u.organization_id, _unit_id, v_customer, _date, _time, _party_size, v_notes,
          _origin, v_status, v_large, case when v_status = 'confirmada' then now() end, auth.uid())
  returning reservations.id into v_res;

  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
          jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id,
                             'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status,
                             'origin', _origin, 'phone', v_phone));

  return query select v_res, v_protocol, v_status;
end $$;

-- Mudança de status com validação de transição e permissão.
create or replace function public.set_reservation_status(_reservation_id uuid, _status public.reservation_status, _note text default null)
returns public.reservation_status
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations; v_note text := nullif(btrim(coalesce(_note,'')), '');
begin
  select * into r from public.reservations where id = _reservation_id for update;
  if not found or not public.can_access_unit(auth.uid(), r.unit_id) then raise exception 'FORBIDDEN'; end if;
  if not ((r.status = 'pendente' and _status in ('confirmada','cancelada'))
       or (r.status = 'confirmada' and _status in ('concluida','nao_compareceu','cancelada'))) then
    raise exception 'INVALID_TRANSITION';
  end if;
  if _status = 'cancelada' and v_note is null then raise exception 'REASON_REQUIRED'; end if;
  if _status = 'confirmada' and r.is_large_group and not public.can_manage_unit(auth.uid(), r.unit_id) then
    raise exception 'LARGE_GROUP_NEEDS_MANAGER';
  end if;
  if v_note is not null and length(v_note) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  perform set_config('app.status_note', coalesce(v_note,''), true);
  update public.reservations set status = _status where id = _reservation_id;
  perform set_config('app.status_note', '', true);
  return _status;
end $$;

create or replace function public.mark_reservation_arrived(_reservation_id uuid)
returns timestamptz
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations; v_at timestamptz := now();
begin
  select * into r from public.reservations where id = _reservation_id for update;
  if not found or not public.can_access_unit(auth.uid(), r.unit_id) then raise exception 'FORBIDDEN'; end if;
  if r.status <> 'confirmada' then raise exception 'INVALID_TRANSITION'; end if;
  if r.arrived_at is not null then return r.arrived_at; end if;
  update public.reservations set arrived_at = v_at where id = _reservation_id;
  insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by, note)
  values (_reservation_id, r.status, r.status, auth.uid(), 'Chegada confirmada');
  return v_at;
end $$;

create or replace function public.add_reservation_note(_reservation_id uuid, _note text)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare r public.reservations; v_note text := nullif(btrim(coalesce(_note,'')), '');
begin
  select * into r from public.reservations where id = _reservation_id;
  if not found or not public.can_access_unit(auth.uid(), r.unit_id) then raise exception 'FORBIDDEN'; end if;
  if v_note is null then raise exception 'NOTE_REQUIRED'; end if;
  if length(v_note) > 500 then raise exception 'NOTES_TOO_LONG'; end if;
  insert into public.reservation_status_history (reservation_id, from_status, to_status, changed_by, note)
  values (_reservation_id, r.status, r.status, auth.uid(), v_note);
end $$;

create or replace function public.get_reservation_history(_reservation_id uuid)
returns table (id uuid, from_status public.reservation_status, to_status public.reservation_status,
               note text, created_at timestamptz, changed_by_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from public.reservations r where r.id = _reservation_id and public.can_access_unit(auth.uid(), r.unit_id)) then
    raise exception 'FORBIDDEN';
  end if;
  return query
  select h.id, h.from_status, h.to_status, h.note, h.created_at,
         case when h.changed_by is null then null else coalesce(p.full_name, 'Equipe') end
  from public.reservation_status_history h
  left join public.user_profiles p on p.id = h.changed_by
  where h.reservation_id = _reservation_id
  order by h.created_at desc;
end $$;

-- Equipe (somente super admin): lista usuários com e-mail, papéis e unidades.
create or replace function public.admin_list_users()
returns table (id uuid, email text, full_name text, is_active boolean, created_at timestamptz,
               roles public.app_role[], unit_ids uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'super_admin') then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, u.email::text, p.full_name, p.is_active, p.created_at,
         coalesce((select array_agg(r.role order by r.role) from public.user_roles r where r.user_id = p.id), '{}'),
         coalesce((select array_agg(a.unit_id) from public.user_unit_access a where a.user_id = p.id), '{}')
  from public.user_profiles p
  join auth.users u on u.id = p.id
  order by p.created_at;
end $$;

-- Alterações de reservas só por RPC (regras + histórico garantidos).
revoke insert, update on public.reservations from authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.staff_unit_slots(uuid,date,integer)',
    'public.create_staff_reservation(uuid,date,time,integer,text,text,text,public.reservation_origin,public.reservation_status)',
    'public.set_reservation_status(uuid,public.reservation_status,text)',
    'public.mark_reservation_arrived(uuid)',
    'public.add_reservation_note(uuid,text)',
    'public.get_reservation_history(uuid)',
    'public.admin_list_users()']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Tempo real
alter table public.reservations replica identity full;
alter publication supabase_realtime add table public.reservations;
