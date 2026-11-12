-- 011 — SAC completo e relatórios consolidados.
-- Aditiva: reaproveita sac_tickets/sac_ticket_events (contrato do SDR intacto: sdr_create_sac/sdr_handoff
-- continuam iguais). Painel passa a alterar SAC só por RPC (mais restritivo). crm_conversations,
-- message_outbox, crm_events e reservation_followups são só LIDOS aqui.

-- 1) Campos novos em sac_tickets -------------------------------------------------------
alter table public.sac_tickets add column if not exists complaint_type text
  check (complaint_type is null or complaint_type in ('atendimento','comida','demora','cobranca','limpeza','reserva','outro'));
alter table public.sac_tickets add column if not exists reopened_count integer not null default 0;
create index if not exists sac_tickets_unit_status_idx on public.sac_tickets(unit_id, status, opened_at desc);
create index if not exists sac_tickets_opened_idx on public.sac_tickets(opened_at desc);
create index if not exists sac_tickets_customer_idx on public.sac_tickets(customer_id);
create index if not exists sac_ticket_events_ticket_idx on public.sac_ticket_events(ticket_id, created_at desc);
create index if not exists reservations_created_idx on public.reservations(created_at desc);
create index if not exists reservations_date_idx on public.reservations(reservation_date);
create index if not exists rsh_reservation_idx on public.reservation_status_history(reservation_id, created_at);

-- Painel não escreve SAC direto: tudo por RPC (eventos + audit garantidos).
revoke insert, update, delete on public.sac_tickets from authenticated;
revoke insert, update, delete on public.sac_ticket_events from authenticated;

-- 2) SLA por prioridade (horas), configurável ---------------------------------------------
create table if not exists public.sac_sla_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  priority public.sac_priority not null,
  hours integer not null check (hours between 1 and 720),
  updated_at timestamptz not null default now(),
  primary key (organization_id, priority)
);
grant select on public.sac_sla_settings to authenticated;
grant all on public.sac_sla_settings to service_role;
alter table public.sac_sla_settings enable row level security;
drop policy if exists "staff lê SLA" on public.sac_sla_settings;
create policy "staff lê SLA" on public.sac_sla_settings for select to authenticated using (public.is_staff(auth.uid()));

create or replace function public.sac_priority_hours(_org uuid, _p public.sac_priority)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select s.hours from public.sac_sla_settings s where s.organization_id = _org and s.priority = _p),
    case _p when 'urgente' then 4 when 'alta' then 24 when 'media' then 48 else 72 end)
$$;

create or replace function public._sac_can(_uid uuid, _unit uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin') or (_unit is not null and public.can_access_unit(_uid, _unit))
$$;
revoke all on function public._sac_can(uuid,uuid) from public, anon, authenticated;

create or replace function public._is_manager(_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(_uid, 'super_admin') or public.has_role(_uid, 'gestor')
$$;
revoke all on function public._is_manager(uuid) from public, anon, authenticated;

create or replace function public.sac_set_sla(_priority public.sac_priority, _hours integer)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select organization_id into v_org from public.user_profiles where id = auth.uid();
  if v_org is null then v_org := public._default_org(); end if;
  insert into public.sac_sla_settings (organization_id, priority, hours) values (v_org, _priority, _hours)
  on conflict (organization_id, priority) do update set hours = excluded.hours, updated_at = now();
  perform public.write_audit('painel', 'config.alterada', 'config', null, null, null,
    jsonb_build_object('sla_prioridade', _priority, 'horas', _hours), 'SLA do SAC');
end $$;

-- 3) Lista / detalhe / linha do tempo ---------------------------------------------------
create or replace function public.sac_list(
  _status public.sac_status default null, _unit uuid default null, _category public.sac_category default null,
  _type text default null, _priority public.sac_priority default null, _assignee uuid default null,
  _origin text default null, _from date default null, _to date default null, _overdue boolean default false,
  _q text default null, _limit integer default 50, _offset integer default 0)
returns table (id uuid, protocol text, unit_id uuid, unit_name text, status public.sac_status, category public.sac_category,
  complaint_type text, priority public.sac_priority, subject text, origin text, opened_at timestamptz, due_at timestamptz,
  resolved_at timestamptz, first_response_at timestamptz, assigned_to uuid, assignee_name text,
  customer_name text, customer_phone text, sla_state text, reopened_count integer, total bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare v_q text := nullif(btrim(coalesce(_q,'')), ''); v_digits text := regexp_replace(coalesce(_q,''), '\D', '', 'g');
begin
  if not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return query
  with base as (
    select t.*, coalesce(t.due_at, t.opened_at + make_interval(hours => public.sac_priority_hours(t.organization_id, t.priority))) as eff_due
    from public.sac_tickets t
    where public._sac_can(auth.uid(), t.unit_id)
      and (_status is null or t.status = _status)
      and (_unit is null or t.unit_id = _unit)
      and (_category is null or t.category = _category)
      and (_type is null or t.complaint_type = _type)
      and (_priority is null or t.priority = _priority)
      and (_assignee is null or t.assigned_to = _assignee)
      and (_origin is null or coalesce(t.origin,'painel') = _origin)
      and (_from is null or (t.opened_at at time zone 'America/Sao_Paulo')::date >= _from)
      and (_to is null or (t.opened_at at time zone 'America/Sao_Paulo')::date <= _to)
  ), f as (
    select b.*, c.full_name as c_name, c.phone_e164 as c_phone,
      case when b.status in ('resolvido','encerrado') then
             case when b.resolved_at is not null and b.resolved_at > b.eff_due then 'atrasado' else 'no_prazo' end
           when now() > b.eff_due then 'atrasado'
           when now() > b.eff_due - (b.eff_due - b.opened_at) * 0.25 then 'vence_em_breve'
           else 'no_prazo' end as sla
    from base b left join public.customers c on c.id = b.customer_id
    where (v_q is null or b.protocol ilike '%' || v_q || '%' or c.full_name ilike '%' || v_q || '%'
           or (length(v_digits) >= 6 and c.phone_e164 like '%' || v_digits || '%'))
  )
  select f.id, f.protocol, f.unit_id, u.name, f.status, f.category, f.complaint_type, f.priority, f.subject, f.origin,
         f.opened_at, f.eff_due, f.resolved_at, f.first_response_at, f.assigned_to, p.full_name, f.c_name, f.c_phone, f.sla,
         f.reopened_count, count(*) over ()
  from f left join public.units u on u.id = f.unit_id left join public.user_profiles p on p.id = f.assigned_to
  where (not _overdue or (f.sla = 'atrasado' and f.status not in ('resolvido','encerrado')))
  order by case f.priority when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, f.eff_due
  limit least(greatest(_limit,1),200) offset greatest(_offset,0);
end $$;

create or replace function public.sac_get(_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t public.sac_tickets; v jsonb;
begin
  select * into t from public.sac_tickets where id = _id;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  select to_jsonb(t) || jsonb_build_object(
    'due_effective', coalesce(t.due_at, t.opened_at + make_interval(hours => public.sac_priority_hours(t.organization_id, t.priority))),
    'unit_name', (select name from public.units where id = t.unit_id),
    'assignee_name', (select full_name from public.user_profiles where id = t.assigned_to),
    'customer', (select jsonb_build_object('id', c.id, 'full_name', c.full_name, 'phone', c.phone_e164,
                   'tickets', (select count(*) from public.sac_tickets x where x.customer_id = c.id))
                 from public.customers c where c.id = t.customer_id),
    'reservation', (select jsonb_build_object('id', r.id, 'protocol', r.protocol, 'date', r.reservation_date, 'time', r.reservation_time)
                    from public.reservations r where r.id = t.reservation_id and public.can_access_unit(auth.uid(), r.unit_id)))
  into v;
  return v;
end $$;

create or replace function public.sac_timeline(_id uuid)
returns table (id uuid, created_at timestamptz, kind text, event_type text, body text, author_name text,
               from_status text, to_status text, action text, source text, actor_role text, before jsonb, after jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare t public.sac_tickets;
begin
  select * into t from public.sac_tickets where sac_tickets.id = _id;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  return query
  select e.id, e.created_at, 'evento'::text, e.event_type, e.body,
         case when e.author_id is null then null else coalesce(p.full_name, 'Equipe') end,
         e.from_status::text, e.to_status::text, null::text, null::text, null::text, null::jsonb, null::jsonb
  from public.sac_ticket_events e left join public.user_profiles p on p.id = e.author_id
  where e.ticket_id = t.id
  union all
  select a.id, a.created_at, 'audit'::text, null, a.note, a.actor_name, null, null, a.action, a.source, a.actor_role, a.before, a.after
  from public.audit_log a where a.entity_type = 'sac' and a.entity_id = t.id
  order by 2 desc;
end $$;

create or replace function public.sac_team_for_unit(_unit uuid)
returns table (id uuid, full_name text, role text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public._sac_can(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, coalesce(p.full_name, 'Sem nome'),
         (select r.role::text from public.user_roles r where r.user_id = p.id order by case r.role when 'super_admin' then 1 when 'gestor' then 2 else 3 end limit 1)
  from public.user_profiles p
  where p.is_active and public.is_staff(p.id) and (_unit is null and public.has_role(p.id, 'super_admin') or public.can_access_unit(p.id, _unit))
  order by 2;
end $$;

-- 4) Ações (cada uma vira evento + audit_log) ---------------------------------------------
create or replace function public._sac_event(_t uuid, _type text, _body text, _from public.sac_status, _to public.sac_status)
returns void language sql security definer set search_path = public as $$
  insert into public.sac_ticket_events (ticket_id, event_type, body, from_status, to_status, author_id)
  values (_t, _type, _body, _from, _to, auth.uid())
$$;
revoke all on function public._sac_event(uuid,text,text,public.sac_status,public.sac_status) from public, anon, authenticated;

create or replace function public.sac_create_manual(
  _unit_id uuid, _full_name text, _phone text, _complaint_type text, _category public.sac_category,
  _priority public.sac_priority, _subject text, _description text, _channel text,
  _reservation_protocol text default null, _assigned_to uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_phone text := public.normalize_br_phone(_phone); v_org uuid; v_customer uuid; v_protocol text; v_id uuid; v_res uuid;
begin
  if not public._sac_can(auth.uid(), _unit_id) or _unit_id is null then raise exception 'FORBIDDEN'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if length(btrim(coalesce(_subject,''))) < 3 then raise exception 'INVALID_SUBJECT'; end if;
  if _channel not in ('telefone','presencial','site','whatsapp','email') then raise exception 'INVALID_CHANNEL'; end if;
  if _assigned_to is not null and not public.can_access_unit(_assigned_to, _unit_id) then raise exception 'INVALID_ASSIGNEE'; end if;
  select organization_id into v_org from public.units where id = _unit_id;
  insert into public.customers as c (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (v_org, coalesce(nullif(btrim(_full_name),''), 'Cliente'), v_phone, false)
  on conflict (organization_id, phone_e164) do update set full_name = c.full_name
  returning c.id into v_customer;
  if nullif(btrim(coalesce(_reservation_protocol,'')),'') is not null then
    select r.id into v_res from public.reservations r where r.protocol = upper(btrim(_reservation_protocol)) and r.unit_id = _unit_id;
  end if;
  loop
    v_protocol := 'SAC-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDD') || '-' || upper(public._rand_hex(5));
    exit when not exists (select 1 from public.sac_tickets t where t.protocol = v_protocol);
  end loop;
  insert into public.sac_tickets (protocol, organization_id, unit_id, customer_id, reservation_id, category, complaint_type, subject,
    description, priority, status, due_at, origin, assigned_to)
  values (v_protocol, v_org, _unit_id, v_customer, v_res, coalesce(_category,'reclamacao'), _complaint_type, btrim(_subject),
    nullif(btrim(coalesce(_description,'')),''), coalesce(_priority,'media'), 'aberto',
    now() + make_interval(hours => public.sac_priority_hours(v_org, coalesce(_priority,'media'))), _channel, _assigned_to)
  returning id into v_id;
  perform public._sac_event(v_id, 'aberto', 'Aberto pelo painel (' || _channel || ')', null, 'aberto');
  return jsonb_build_object('id', v_id, 'protocol', v_protocol);
end $$;

create or replace function public.sac_update(_id uuid, _patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sac_tickets; v_status public.sac_status; v_assignee uuid;
begin
  select * into t from public.sac_tickets where id = _id for update;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  if _patch ? 'status' then
    v_status := (_patch->>'status')::public.sac_status;
    if v_status in ('resolvido') then raise exception 'USE_RESOLVE'; end if;
    if t.status in ('resolvido','encerrado') then raise exception 'USE_REOPEN'; end if;
    if v_status = 'encerrado' and length(btrim(coalesce(_patch->>'resolution',''))) < 3 then raise exception 'RESOLUTION_REQUIRED'; end if;
    if v_status is distinct from t.status then
      update public.sac_tickets set status = v_status,
        resolution = case when v_status = 'encerrado' then btrim(_patch->>'resolution') else resolution end,
        resolved_at = case when v_status = 'encerrado' then now() else resolved_at end,
        first_response_at = case when v_status = 'em_andamento' then coalesce(first_response_at, now()) else first_response_at end
      where id = _id;
      perform public._sac_event(_id, 'status', case when v_status = 'encerrado' then btrim(_patch->>'resolution') end, t.status, v_status);
    end if;
  end if;
  if _patch ? 'priority' then
    update public.sac_tickets set priority = (_patch->>'priority')::public.sac_priority where id = _id;
    perform public._sac_event(_id, 'prioridade', 'Prioridade: ' || (_patch->>'priority'), null, null);
  end if;
  if _patch ? 'complaint_type' then
    update public.sac_tickets set complaint_type = nullif(_patch->>'complaint_type','') where id = _id;
    perform public._sac_event(_id, 'categoria', 'Tipo: ' || coalesce(nullif(_patch->>'complaint_type',''),'—'), null, null);
  end if;
  if _patch ? 'due_at' then
    update public.sac_tickets set due_at = nullif(_patch->>'due_at','')::timestamptz where id = _id;
    perform public._sac_event(_id, 'prazo', 'Prazo alterado', null, null);
  end if;
  if _patch ? 'assigned_to' then
    v_assignee := nullif(_patch->>'assigned_to','')::uuid;
    if v_assignee is not null and not public._sac_can(v_assignee, t.unit_id) then raise exception 'INVALID_ASSIGNEE'; end if;
    update public.sac_tickets set assigned_to = v_assignee where id = _id;
    perform public._sac_event(_id, 'responsavel',
      'Responsável: ' || coalesce((select full_name from public.user_profiles where id = v_assignee), 'ninguém'), null, null);
  end if;
end $$;

create or replace function public.sac_resolve(_id uuid, _resolution text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sac_tickets;
begin
  select * into t from public.sac_tickets where id = _id for update;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(_resolution,''))) < 3 then raise exception 'RESOLUTION_REQUIRED'; end if;
  if t.status in ('resolvido','encerrado') then raise exception 'ALREADY_CLOSED'; end if;
  update public.sac_tickets set status = 'resolvido', resolution = btrim(_resolution), resolved_at = now(),
    first_response_at = coalesce(first_response_at, now()) where id = _id;
  perform public._sac_event(_id, 'resolvido', btrim(_resolution), t.status, 'resolvido');
end $$;

create or replace function public.sac_reopen(_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sac_tickets;
begin
  select * into t from public.sac_tickets where id = _id for update;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  if t.status not in ('resolvido','encerrado') then raise exception 'NOT_CLOSED'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'REASON_REQUIRED'; end if;
  update public.sac_tickets set status = 'em_andamento', resolved_at = null, reopened_count = reopened_count + 1,
    due_at = now() + make_interval(hours => public.sac_priority_hours(t.organization_id, t.priority)) where id = _id;
  perform public._sac_event(_id, 'reaberto', btrim(_reason), t.status, 'em_andamento');
end $$;

create or replace function public.sac_add_note(_id uuid, _body text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sac_tickets;
begin
  select * into t from public.sac_tickets where id = _id;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  if length(btrim(coalesce(_body,''))) < 2 or length(_body) > 2000 then raise exception 'INVALID_NOTE'; end if;
  perform public._sac_event(_id, 'nota', btrim(_body), null, null);
  perform public.write_audit('painel', 'sac.nota', 'sac', _id, t.unit_id, null, null, t.protocol);
end $$;

create or replace function public.sac_register_contact(_id uuid, _channel text, _summary text)
returns void language plpgsql security definer set search_path = public as $$
declare t public.sac_tickets;
begin
  select * into t from public.sac_tickets where id = _id for update;
  if t.id is null or not public._sac_can(auth.uid(), t.unit_id) then raise exception 'FORBIDDEN'; end if;
  if _channel not in ('telefone','whatsapp','presencial','email') then raise exception 'INVALID_CHANNEL'; end if;
  if length(btrim(coalesce(_summary,''))) < 3 then raise exception 'INVALID_NOTE'; end if;
  update public.sac_tickets set first_response_at = coalesce(first_response_at, now()),
    status = case when status = 'aberto' then 'em_andamento'::public.sac_status else status end where id = _id;
  perform public._sac_event(_id, 'contato', _channel || ': ' || btrim(_summary), null, null);
  perform public.write_audit('painel', 'sac.contato', 'sac', _id, t.unit_id, null, jsonb_build_object('canal', _channel), t.protocol);
end $$;

-- 5) Indicadores do SAC e contador ------------------------------------------------------
create or replace function public.sac_open_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from public.sac_tickets t
  where t.status in ('aberto','em_andamento','aguardando_cliente') and public._sac_can(auth.uid(), t.unit_id)
$$;

create or replace function public.sac_stats(_unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_staff(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  with t as (
    select s.*, coalesce(s.due_at, s.opened_at + make_interval(hours => public.sac_priority_hours(s.organization_id, s.priority))) eff_due
    from public.sac_tickets s where public._sac_can(auth.uid(), s.unit_id) and (_unit is null or s.unit_id = _unit)
  ), last30 as (select * from t where opened_at >= now() - interval '30 days')
  select jsonb_build_object(
    'opened_today', (select count(*) from t where (opened_at at time zone 'America/Sao_Paulo')::date = v_today),
    'open', (select count(*) from t where status in ('aberto','em_andamento','aguardando_cliente')),
    'overdue', (select count(*) from t where status in ('aberto','em_andamento','aguardando_cliente') and now() > eff_due),
    'avg_first_response_h', (select round(avg(extract(epoch from first_response_at - opened_at)/3600)::numeric, 1) from last30 where first_response_at is not null),
    'avg_resolution_h', (select round(avg(extract(epoch from resolved_at - opened_at)/3600)::numeric, 1) from last30 where resolved_at is not null),
    'top_types', coalesce((select jsonb_agg(x) from (select coalesce(complaint_type, category::text) k, count(*) n from last30 group by 1 order by 2 desc limit 5) x), '[]'),
    'recurrent_customers', (select count(*) from (select customer_id from t where customer_id is not null and category = 'reclamacao' group by 1 having count(*) >= 2) r)
  ) into v;
  return v;
end $$;

-- 6) Relatórios (gestor/super admin; sempre limitados às unidades do usuário) -----------------
create or replace function public._report_guard(_unit uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
end $$;
revoke all on function public._report_guard(uuid) from public, anon, authenticated;

create or replace function public.report_reservations(_from date, _to date, _unit uuid default null, _service text default null, _origin text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._report_guard(_unit);
  with r as (
    select x.* from public.reservations x
    where x.reservation_date between _from and _to and public.can_access_unit(auth.uid(), x.unit_id)
      and (_unit is null or x.unit_id = _unit) and (_service is null or x.service = _service)
      and (_origin is null or x.origin::text = _origin)
  ), appr as (
    select extract(epoch from h.created_at - r.created_at)/60 m from r
    join public.reservation_status_history h on h.reservation_id = r.id and h.from_status = 'pendente' and h.to_status = 'confirmada'
  ), cap as (
    select coalesce(sum(floor(extract(epoch from (c.end_time - c.start_time))/60 / c.slot_interval_minutes) * c.max_guests_per_slot), 0) seats
    from generate_series(_from, _to, interval '1 day') d
    join public.reservation_capacity_rules c on c.is_active and c.weekday = extract(dow from d)::int
      and public.can_access_unit(auth.uid(), c.unit_id) and (_unit is null or c.unit_id = _unit)
    where (_to - _from) <= 366
  )
  select jsonb_build_object(
    'total', (select count(*) from r),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from r group by 1) s), '{}'),
    'guests_expected', (select coalesce(sum(party_size),0) from r where status in ('confirmada','concluida','pendente')),
    'guests_arrived', (select coalesce(sum(party_size),0) from r where arrived_at is not null or status = 'concluida'),
    'large_groups', (select count(*) from r where is_large_group),
    'avg_party', (select round(avg(party_size)::numeric,1) from r),
    'approval_rate', (select round(100.0 * count(*) filter (where status in ('confirmada','concluida','nao_compareceu')) / nullif(count(*) filter (where status <> 'pendente'),0), 1) from r),
    'avg_minutes_to_approve', (select round(avg(m)::numeric, 0) from appr),
    'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('k', d, 'n', n) order by d) from (select extract(dow from reservation_date)::int d, count(*) n from r group by 1) w), '[]'),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('k', h, 'n', n) order by h) from (select to_char(reservation_time, 'HH24') h, count(*) n from r group by 1) w), '[]'),
    'by_occasion', coalesce((select jsonb_agg(jsonb_build_object('k', o, 'n', n) order by n desc) from (select coalesce(occasion,'sem') o, count(*) n from r group by 1) w), '[]'),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('k', reservation_date, 'n', n, 'p', p) order by reservation_date) from (select reservation_date, count(*) n, sum(party_size) p from r group by 1) w), '[]'),
    'capacity_seats', (select seats from cap),
    'occupancy_pct', (select round(100.0 * (select coalesce(sum(party_size),0) from r where status in ('confirmada','concluida')) / nullif((select seats from cap),0), 1))
  ) into v;
  return v;
end $$;

create or replace function public.report_funnel(_from date, _to date, _unit uuid default null, _service text default null, _origin text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._report_guard(_unit);
  with r as (
    select x.* from public.reservations x
    where (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to and public.can_access_unit(auth.uid(), x.unit_id)
      and (_unit is null or x.unit_id = _unit) and (_service is null or x.service = _service) and (_origin is null or x.origin::text = _origin)
  ), l as (
    select x.* from public.reservation_leads x
    where (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and (x.unit_id is null and public.has_role(auth.uid(), 'super_admin') or (x.unit_id is not null and public.can_access_unit(auth.uid(), x.unit_id)))
      and (_unit is null or x.unit_id = _unit) and (_service is null or x.service = _service)
  )
  select jsonb_build_object(
    'leads', (select count(*) from l),
    'leads_converted', (select count(*) from l where reservation_id is not null),
    'created', (select count(*) from r),
    'confirmed', (select count(*) from r where status in ('confirmada','concluida','nao_compareceu')),
    'by_origin', coalesce((select jsonb_agg(jsonb_build_object('k', o, 'n', n, 'c', c) order by n desc) from
       (select origin::text o, count(*) n, count(*) filter (where status in ('confirmada','concluida','nao_compareceu')) c from r group by 1) w), '[]'),
    'by_campaign', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from
       (select coalesce(campaign,'sem campanha') k, count(*) n from r group by 1 order by 2 desc limit 10) w), '[]')
  ) into v;
  return v;
end $$;

create or replace function public.report_sdr(_from date, _to date, _unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_super boolean := public.has_role(auth.uid(), 'super_admin');
begin
  perform public._report_guard(_unit);
  with c as (
    select x.* from public.crm_conversations x
    where (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and ((x.unit_id is null and v_super) or (x.unit_id is not null and public.can_access_unit(auth.uid(), x.unit_id)))
      and (_unit is null or x.unit_id = _unit)
  ), r as (
    select x.* from public.reservations x
    where x.origin = 'sdr_whatsapp' and (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  ), m as (
    select o.event_key, o.status from public.message_outbox o
    join public.reservations x on x.id = o.reservation_id
    where (o.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  ), f as (
    select fu.* from public.reservation_followups fu join public.reservations x on x.id = fu.reservation_id
    where (fu.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  ), d as (
    select x.* from public.delivery_orders x
    where (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  ), s as (
    select x.* from public.sac_tickets x
    where x.origin = 'sdr_whatsapp' and (x.opened_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public._sac_can(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  )
  select jsonb_build_object(
    'conversations', (select count(*) from c),
    'conversations_bot', (select count(*) from c where handoff_at is null),
    'handoffs', (select count(*) from c where handoff_at is not null),
    'by_classification', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(classification::text,'sem') k, count(*) n from c group by 1) w), '[]'),
    'handoff_reasons', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from
       (select coalesce(nullif(e.body,''),'sem motivo') k, count(*) n from public.sac_ticket_events e join s on s.id = e.ticket_id
        where e.event_type = 'atendimento_humano' group by 1 order by 2 desc limit 10) w), '[]'),
    'reservations', (select count(*) from r),
    'reservations_confirmed', (select count(*) from r where status in ('confirmada','concluida','nao_compareceu')),
    'conversion_pct', (select round(100.0 * (select count(*) from r) / nullif((select count(*) from c),0), 1)),
    'delivery_orders', (select count(*) from d),
    'delivery_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from d group by 1) w), '{}'),
    'followups_sent', (select count(*) from f where status = 'enviado'),
    'followups_failed', (select count(*) from f where status = 'falhou'),
    'sac_opened', (select count(*) from s),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('k', event_key, 'status', status, 'n', n)) from (select event_key, status::text, count(*) n from m group by 1,2) w), '[]')
  ) into v;
  return v;
end $$;

create or replace function public.report_sac(_from date, _to date, _unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._report_guard(_unit);
  with t as (
    select s.*, coalesce(s.due_at, s.opened_at + make_interval(hours => public.sac_priority_hours(s.organization_id, s.priority))) eff_due
    from public.sac_tickets s
    where (s.opened_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and public._sac_can(auth.uid(), s.unit_id) and (_unit is null or s.unit_id = _unit)
  )
  select jsonb_build_object(
    'total', (select count(*) from t),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status::text, count(*) n from t group by 1) w), '{}'),
    'by_type', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(complaint_type, category::text) k, count(*) n from t group by 1) w), '[]'),
    'by_unit', coalesce((select jsonb_agg(jsonb_build_object('k', coalesce(u.name,'Sem unidade'), 'n', n) order by n desc) from (select unit_id, count(*) n from t group by 1) w left join public.units u on u.id = w.unit_id), '[]'),
    'by_origin', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc) from (select coalesce(origin,'painel') k, count(*) n from t group by 1) w), '[]'),
    'sla_met_pct', (select round(100.0 * count(*) filter (where resolved_at <= eff_due) / nullif(count(*) filter (where resolved_at is not null),0), 1) from t),
    'avg_resolution_h', (select round(avg(extract(epoch from resolved_at - opened_at)/3600)::numeric, 1) from t where resolved_at is not null),
    'avg_first_response_h', (select round(avg(extract(epoch from first_response_at - opened_at)/3600)::numeric, 1) from t where first_response_at is not null),
    'recurrent_customers', (select count(*) from (select customer_id from t where customer_id is not null group by 1 having count(*) >= 2) x),
    'reopened', (select count(*) from t where reopened_count > 0),
    'by_assignee', coalesce((select jsonb_agg(jsonb_build_object('k', coalesce(p.full_name,'Sem responsável'), 'n', n, 'resolved', rs) order by rs desc, n desc)
       from (select assigned_to, count(*) n, count(*) filter (where status in ('resolvido','encerrado')) rs from t group by 1) w
       left join public.user_profiles p on p.id = w.assigned_to), '[]')
  ) into v;
  return v;
end $$;

create or replace function public.report_customers(_from date, _to date, _unit uuid default null, _service text default null, _origin text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._report_guard(_unit);
  with r as (
    select x.* from public.reservations x
    where x.reservation_date between _from and _to and public.can_access_unit(auth.uid(), x.unit_id)
      and (_unit is null or x.unit_id = _unit) and (_service is null or x.service = _service) and (_origin is null or x.origin::text = _origin)
  ), firsts as (
    select r.customer_id, min(r.created_at) first_in_period,
      exists (select 1 from public.reservations p where p.customer_id = r.customer_id and p.created_at < min(r.created_at)) is_returning
    from r group by r.customer_id
  )
  select jsonb_build_object(
    'customers', (select count(*) from firsts),
    'new', (select count(*) from firsts where not is_returning),
    'returning', (select count(*) from firsts where is_returning),
    'top_customers', coalesce((select jsonb_agg(jsonb_build_object('k', c.full_name, 'phone', c.phone_e164, 'n', n, 'p', p) order by n desc, p desc)
       from (select customer_id, count(*) n, sum(party_size) p from r group by 1 order by 2 desc, 3 desc limit 10) w join public.customers c on c.id = w.customer_id), '[]'),
    'largest_groups', coalesce((select jsonb_agg(jsonb_build_object('k', c.full_name, 'protocol', w.protocol, 'n', w.party_size, 'date', w.reservation_date) order by w.party_size desc)
       from (select * from r order by party_size desc limit 10) w join public.customers c on c.id = w.customer_id), '[]'),
    'recurrent_cancellations', coalesce((select jsonb_agg(jsonb_build_object('k', c.full_name, 'phone', c.phone_e164, 'n', n) order by n desc)
       from (select customer_id, count(*) n from r where status in ('cancelada','nao_compareceu') group by 1 having count(*) >= 2 order by 2 desc limit 10) w
       join public.customers c on c.id = w.customer_id), '[]')
  ) into v;
  return v;
end $$;

create or replace function public.report_team(_from date, _to date, _unit uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  perform public._report_guard(_unit);
  select coalesce(jsonb_agg(jsonb_build_object('k', name, 'role', role, 'approved', ap, 'refused', rf, 'cancelled', cn, 'created', cr,
           'sac_resolved', sr, 'sac_actions', sa, 'total', tt) order by tt desc), '[]')
  into v from (
    select coalesce(a.actor_name,'Sem nome') name, max(a.actor_role) role,
      count(*) filter (where a.action = 'reserva.aprovada') ap, count(*) filter (where a.action = 'reserva.recusada') rf,
      count(*) filter (where a.action = 'reserva.cancelada') cn, count(*) filter (where a.action = 'reserva.criada') cr,
      count(*) filter (where a.action = 'sac.status_alterado' and a.after->>'status' = 'resolvido') sr,
      count(*) filter (where a.entity_type = 'sac') sa, count(*) tt
    from public.audit_log a
    where a.actor_user_id is not null and (a.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
      and a.action not in ('login','logout')
      and public.can_read_audit(auth.uid(), a.entity_type, a.entity_id, a.unit_id, a.actor_user_id)
      and (_unit is null or a.unit_id = _unit)
    group by a.actor_user_id, a.actor_name
  ) w;
  return jsonb_build_object('people', v);
end $$;

-- Consolidado: principais números do período e do período anterior de mesmo tamanho.
create or replace function public.report_summary(_from date, _to date, _unit uuid default null, _service text default null, _origin text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n integer := (_to - _from) + 1; pf date := _from - ((_to - _from) + 1); pt date := _from - 1;
  cur_r jsonb; prev_r jsonb; cur_f jsonb; prev_f jsonb; cur_s jsonb; prev_s jsonb; cur_d jsonb; prev_d jsonb; cur_c jsonb; prev_c jsonb;
begin
  perform public._report_guard(_unit);
  cur_r := public.report_reservations(_from, _to, _unit, _service, _origin); prev_r := public.report_reservations(pf, pt, _unit, _service, _origin);
  cur_f := public.report_funnel(_from, _to, _unit, _service, _origin); prev_f := public.report_funnel(pf, pt, _unit, _service, _origin);
  cur_s := public.report_sac(_from, _to, _unit); prev_s := public.report_sac(pf, pt, _unit);
  cur_d := public.report_sdr(_from, _to, _unit); prev_d := public.report_sdr(pf, pt, _unit);
  cur_c := public.report_customers(_from, _to, _unit, _service, _origin); prev_c := public.report_customers(pf, pt, _unit, _service, _origin);
  return jsonb_build_object('days', n, 'previous', jsonb_build_object('from', pf, 'to', pt),
    'current', jsonb_build_object('reservations', cur_r, 'funnel', cur_f, 'sac', cur_s, 'sdr', cur_d, 'customers', cur_c),
    'prev', jsonb_build_object('reservations', prev_r, 'funnel', prev_f, 'sac', prev_s, 'sdr', prev_d, 'customers', prev_c));
end $$;

-- Exportação de relatório fica registrada.
create or replace function public.log_report_export(_tab text, _from date, _to date, _unit uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._report_guard(_unit);
  if _tab !~ '^[a-z_]{2,20}$' then raise exception 'INVALID_TAB'; end if;
  perform public.write_audit('painel', 'relatorio.exportado', 'relatorio', null, _unit, null,
    jsonb_build_object('aba', _tab, 'de', _from, 'ate', _to), _tab);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sac_priority_hours(uuid,public.sac_priority)',
    'public.sac_set_sla(public.sac_priority,integer)',
    'public.sac_list(public.sac_status,uuid,public.sac_category,text,public.sac_priority,uuid,text,date,date,boolean,text,integer,integer)',
    'public.sac_get(uuid)', 'public.sac_timeline(uuid)', 'public.sac_team_for_unit(uuid)',
    'public.sac_create_manual(uuid,text,text,text,public.sac_category,public.sac_priority,text,text,text,text,uuid)',
    'public.sac_update(uuid,jsonb)', 'public.sac_resolve(uuid,text)', 'public.sac_reopen(uuid,text)',
    'public.sac_add_note(uuid,text)', 'public.sac_register_contact(uuid,text,text)',
    'public.sac_open_count()', 'public.sac_stats(uuid)',
    'public.report_reservations(date,date,uuid,text,text)', 'public.report_funnel(date,date,uuid,text,text)',
    'public.report_sdr(date,date,uuid)', 'public.report_sac(date,date,uuid)',
    'public.report_customers(date,date,uuid,text,text)', 'public.report_team(date,date,uuid)',
    'public.report_summary(date,date,uuid,text,text)', 'public.log_report_export(text,date,date,uuid)']
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
