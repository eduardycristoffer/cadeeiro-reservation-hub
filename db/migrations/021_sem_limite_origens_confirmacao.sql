-- 021: reservas sem limite de quantidade, mais origens, confirmação no WhatsApp para reserva feita no painel
-- A equipe (admin/gestor/operador) aprova ou recusa cada reserva: capacidade por horário e máximo por grupo deixam de barrar.
-- Continuam valendo: dias/horários de funcionamento, bloqueios, antecedência mínima/máxima e o limite técnico de 200 pessoas.

alter type public.reservation_origin add value if not exists 'whatsapp';
alter type public.reservation_origin add value if not exists 'presencial';
alter type public.reservation_origin add value if not exists 'instagram';
alter type public.reservation_origin add value if not exists 'google';
alter type public.reservation_origin add value if not exists 'indicacao';

create or replace function public.get_unit_slots(_unit_id uuid, _date date, _party_size integer default 1)
returns table (slot_time time, remaining integer, available boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  u public.units;
  now_sp timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  select * into u from public.units where id = _unit_id and is_active and accepts_online_reservations;
  if not found then return; end if;
  if _date < now_sp::date or _date > now_sp::date + u.max_advance_days then return; end if;
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
         true
  from slots s
  left join occ o on o.t = s.t
  where (_date + s.t) >= now_sp + make_interval(mins => u.min_advance_minutes)
    and not exists (select 1 from public.reservation_blocks b
                    where b.unit_id = _unit_id and b.block_date = _date and b.start_time is not null
                      and s.t >= b.start_time and s.t < b.end_time)
  order by s.t;
end $$;

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
         true
  from slots s left join occ o on o.t = s.t
  where (_date + s.t) >= now_sp
    and not exists (select 1 from public.reservation_blocks b
                    where b.unit_id = _unit_id and b.block_date = _date and b.start_time is not null
                      and s.t >= b.start_time and s.t < b.end_time)
  order by s.t;
end $$;

create or replace function public.sdr_update_reservation(_protocol text, _phone text,
  _date date default null, _time time default null, _party_size integer default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_phone text := public.normalize_br_phone(_phone);
  r public.reservations; u public.units;
  nd date; nt time; np integer; v_large boolean; v_status public.reservation_status;
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

  if not exists (select 1 from public.get_unit_slots(r.unit_id, nd, 1) s where s.slot_time = nt) then raise exception 'SLOT_UNAVAILABLE'; end if;

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

-- Confirmação por WhatsApp também quando a reserva já NASCE confirmada pelo painel (auth.uid() presente).
-- Reservas do site e do SDR não entram: o cliente já foi avisado na própria conversa.
create or replace function public.enqueue_reservation_confirmed_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'confirmada' and auth.uid() is not null then
      insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key, status, scheduled_for)
      values (new.organization_id, new.customer_id, new.id, 'reserva_confirmada',
              'whatsapp:reserva_confirmada:' || new.id, 'pendente', now())
      on conflict (dedupe_key) do nothing;
    end if;
    return null;
  end if;
  if new.status = 'confirmada' and old.status is distinct from 'confirmada' then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key, status, scheduled_for)
    values (new.organization_id, new.customer_id, new.id, 'reserva_confirmada',
            'whatsapp:reserva_confirmada:' || new.id, 'pendente', now())
    on conflict (dedupe_key) do nothing;
  elsif new.status = 'cancelada' and (old.status = 'confirmada' or (old.status = 'pendente' and auth.uid() is not null)) then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key, status, scheduled_for)
    values (new.organization_id, new.customer_id, new.id, 'reserva_cancelada',
            'whatsapp:reserva_cancelada:' || new.id, 'pendente', now())
    on conflict (dedupe_key) do nothing;
  end if;
  return null;
end $$;

drop trigger if exists reservations_confirmed_message on public.reservations;
create trigger reservations_confirmed_message after update of status on public.reservations
  for each row execute function public.enqueue_reservation_confirmed_message();
drop trigger if exists reservations_confirmed_message_new on public.reservations;
create trigger reservations_confirmed_message_new after insert on public.reservations
  for each row execute function public.enqueue_reservation_confirmed_message();


-- Reserva criada pelo painel aceita as novas origens ("Como chegou").
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
  if _origin::text not in ('painel','telefone','whatsapp','presencial','instagram','google','indicacao','outro') then raise exception 'INVALID_ORIGIN'; end if;
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
