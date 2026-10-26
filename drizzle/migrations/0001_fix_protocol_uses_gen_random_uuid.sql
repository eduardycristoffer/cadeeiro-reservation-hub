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

  -- lock transacional por unidade+data+horário
  perform pg_advisory_xact_lock(hashtextextended(_unit_id::text || _date::text || _time::text, 0));

  select s.available into v_ok from public.get_unit_slots(_unit_id, _date, _party_size) s where s.slot_time = _time;
  if v_ok is distinct from true then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_large := _party_size > u.large_group_threshold;
  v_status := case when u.auto_confirm and not v_large then 'confirmada' else 'pendente' end;

  insert into public.customers (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (u.organization_id, v_name, v_phone, coalesce(_whatsapp_opt_in,false))
  on conflict (organization_id, phone_e164) do update
    set full_name = excluded.full_name,
        whatsapp_opt_in = customers.whatsapp_opt_in or excluded.whatsapp_opt_in
  returning id into v_customer;

  insert into public.customer_consents (customer_id, consent_type, granted, source, policy_version)
  values (v_customer, 'privacy_notice', true, 'landing_page', '2026-10');
  if _whatsapp_opt_in then
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

  -- evento para o Tryade CRM (processado na Fase 6)
  insert into public.crm_events (organization_id, direction, event_id, event_type, payload)
  values (u.organization_id, 'outbound', 'reservation.created:' || v_res, 'reservation.created',
          jsonb_build_object('reservation_id', v_res, 'protocol', v_protocol, 'unit_id', _unit_id,
                             'date', _date, 'time', _time, 'party_size', _party_size, 'status', v_status,
                             'origin', 'landing_page', 'phone', v_phone));

  -- WhatsApp enfileirado somente com consentimento (envio real na Fase 7)
  if _whatsapp_opt_in then
    insert into public.message_outbox (organization_id, customer_id, reservation_id, event_key, dedupe_key)
    values (u.organization_id, v_customer, v_res,
            case when v_status = 'confirmada' then 'reserva_confirmada' else 'reserva_solicitada' end,
            'reservation:' || v_res || ':' || v_status);
  end if;

  return query select v_protocol, v_status, u.name, _date, _time, _party_size, v_large;
end $$;

revoke all on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text) from public;
grant execute on function public.create_public_reservation(uuid,date,time,integer,text,text,text,boolean,boolean,text) to anon, authenticated;