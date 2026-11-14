-- 014 — Anúncios (gasto, orçamento, CAC, projeção) e gerador de páginas de campanha.
-- Aditiva. O gasto de anúncios é lançado no painel (manual ou CSV); o app não puxa dados da Meta sozinho.
-- Atribuição: reservations.campaign / whatsapp_leads.campaign / reservation_leads.campaign = mesmo texto de
-- ad_spend.campaign (o ?campanha= do link). Relatórios são security definer, só gestor, limitados às unidades do usuário.

-- 1) Gasto diário por plataforma/campanha/unidade ------------------------------------------------
create table if not exists public.ad_spend (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  spend_date date not null,
  platform text not null default 'meta' check (platform in ('meta','google','tiktok','outro')),
  campaign text not null default '' check (campaign = '' or campaign ~ '^[a-z0-9_-]{1,60}$'),
  unit_id uuid references public.units(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0 and amount <= 10000000),
  impressions integer check (impressions is null or impressions >= 0),
  clicks integer check (clicks is null or clicks >= 0),
  leads_reported integer check (leads_reported is null or leads_reported >= 0),
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ad_spend_key_idx on public.ad_spend
  (organization_id, spend_date, platform, campaign, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists ad_spend_date_idx on public.ad_spend(spend_date desc);
revoke all on public.ad_spend from anon, authenticated;
grant select on public.ad_spend to authenticated;
grant all on public.ad_spend to service_role;
alter table public.ad_spend enable row level security;
drop policy if exists "gestor lê gasto de anúncios" on public.ad_spend;
create policy "gestor lê gasto de anúncios" on public.ad_spend for select to authenticated
  using ((public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'))
         and (unit_id is null or public.can_access_unit(auth.uid(), unit_id)));
drop trigger if exists ad_spend_updated_at on public.ad_spend;
create trigger ad_spend_updated_at before update on public.ad_spend for each row execute function public.set_updated_at();

-- 2) Orçamento planejado por mês (unidade e campanha opcionais) -------------------------------------
create table if not exists public.ad_budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  unit_id uuid references public.units(id) on delete cascade,
  campaign text not null default '' check (campaign = '' or campaign ~ '^[a-z0-9_-]{1,60}$'),
  planned_amount numeric(12,2) not null check (planned_amount >= 0 and planned_amount <= 10000000),
  created_by uuid,
  updated_at timestamptz not null default now()
);
create unique index if not exists ad_budgets_key_idx on public.ad_budgets
  (organization_id, month, campaign, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid));
revoke all on public.ad_budgets from anon, authenticated;
grant select on public.ad_budgets to authenticated;
grant all on public.ad_budgets to service_role;
alter table public.ad_budgets enable row level security;
drop policy if exists "gestor lê orçamento" on public.ad_budgets;
create policy "gestor lê orçamento" on public.ad_budgets for select to authenticated
  using ((public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'))
         and (unit_id is null or public.can_access_unit(auth.uid(), unit_id)));

create or replace function public._ad_scope_org()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce((select organization_id from public.user_profiles where id = auth.uid()), public._default_org())
$$;
revoke all on function public._ad_scope_org() from public, anon, authenticated;

create or replace function public.ad_spend_save(_date date, _platform text, _campaign text, _unit uuid, _amount numeric,
  _impressions integer default null, _clicks integer default null, _leads integer default null, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_id uuid; v_camp text := coalesce(lower(btrim(_campaign)), '');
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_manage_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if _unit is null and not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _date is null or _date > current_date + 1 or _date < current_date - 800 then raise exception 'INVALID_DATE'; end if;
  if _amount is null or _amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_camp <> '' and v_camp !~ '^[a-z0-9_-]{1,60}$' then raise exception 'INVALID_CAMPAIGN'; end if;
  insert into public.ad_spend as a (organization_id, spend_date, platform, campaign, unit_id, amount, impressions, clicks, leads_reported, notes, created_by)
  values (v_org, _date, coalesce(_platform,'meta'), v_camp, _unit, _amount, _impressions, _clicks, _leads, nullif(btrim(coalesce(_notes,'')),''), auth.uid())
  on conflict (organization_id, spend_date, platform, campaign, (coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  do update set amount = excluded.amount, impressions = excluded.impressions, clicks = excluded.clicks,
                leads_reported = excluded.leads_reported, notes = excluded.notes
  returning a.id into v_id;
  perform public.write_audit('painel', 'anuncio.gasto_salvo', 'ad_spend', v_id, _unit, null,
    jsonb_build_object('data', _date, 'plataforma', coalesce(_platform,'meta'), 'campanha', v_camp, 'valor', _amount), null);
  return v_id;
end $$;
revoke all on function public.ad_spend_save(date,text,text,uuid,numeric,integer,integer,integer,text) from public, anon;
grant execute on function public.ad_spend_save(date,text,text,uuid,numeric,integer,integer,integer,text) to authenticated;

create or replace function public.ad_spend_delete(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into a from public.ad_spend where id = _id and organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if a.unit_id is not null and not public.can_manage_unit(auth.uid(), a.unit_id) then raise exception 'FORBIDDEN'; end if;
  delete from public.ad_spend where id = _id;
  perform public.write_audit('painel', 'anuncio.gasto_removido', 'ad_spend', _id, a.unit_id,
    jsonb_build_object('data', a.spend_date, 'campanha', a.campaign, 'valor', a.amount), null, null);
end $$;
revoke all on function public.ad_spend_delete(uuid) from public, anon;
grant execute on function public.ad_spend_delete(uuid) to authenticated;

-- Importação em lote (CSV já convertido em JSON pelo painel): [{data, plataforma, campanha, unidade, valor, impressoes, cliques, leads}]
create or replace function public.ad_spend_import(_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._ad_scope_org(); r jsonb; i int := 0; ok int := 0; errs jsonb := '[]'::jsonb;
  v_date date; v_unit uuid; v_amount numeric; v_camp text; v_plat text; v_slug text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) = 0 then raise exception 'EMPTY_IMPORT'; end if;
  if jsonb_array_length(_rows) > 500 then raise exception 'IMPORT_TOO_LARGE'; end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    begin
      v_date := (r->>'data')::date;
      v_amount := replace(coalesce(r->>'valor','x'), ',', '.')::numeric;
      v_camp := coalesce(lower(btrim(r->>'campanha')), '');
      v_plat := coalesce(nullif(lower(btrim(r->>'plataforma')), ''), 'meta');
      v_slug := nullif(lower(btrim(coalesce(r->>'unidade',''))), '');
      v_unit := null;
      if v_slug is not null then
        select id into v_unit from public.units where organization_id = v_org and slug = v_slug;
        if v_unit is null then raise exception 'unidade desconhecida: %', v_slug; end if;
      end if;
      if v_unit is not null and not public.can_manage_unit(auth.uid(), v_unit) then raise exception 'sem acesso à unidade'; end if;
      if v_date > current_date + 1 or v_date < current_date - 800 then raise exception 'data fora do intervalo'; end if;
      if v_plat not in ('meta','google','tiktok','outro') then raise exception 'plataforma inválida: %', v_plat; end if;
      if v_camp <> '' and v_camp !~ '^[a-z0-9_-]{1,60}$' then raise exception 'campanha inválida'; end if;
      insert into public.ad_spend as a (organization_id, spend_date, platform, campaign, unit_id, amount, impressions, clicks, leads_reported, created_by)
      values (v_org, v_date, v_plat, v_camp, v_unit, v_amount,
              nullif(r->>'impressoes','')::int, nullif(r->>'cliques','')::int, nullif(r->>'leads','')::int, auth.uid())
      on conflict (organization_id, spend_date, platform, campaign, (coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      do update set amount = excluded.amount, impressions = excluded.impressions, clicks = excluded.clicks, leads_reported = excluded.leads_reported;
      ok := ok + 1;
    exception when others then
      errs := errs || jsonb_build_array(jsonb_build_object('linha', i, 'erro', left(sqlerrm, 120)));
    end;
  end loop;
  perform public.write_audit('painel', 'anuncio.importacao', 'ad_spend', null, null, null,
    jsonb_build_object('linhas', i, 'importadas', ok, 'com_erro', i - ok), null);
  return jsonb_build_object('importadas', ok, 'com_erro', i - ok, 'erros', errs);
end $$;
revoke all on function public.ad_spend_import(jsonb) from public, anon;
grant execute on function public.ad_spend_import(jsonb) to authenticated;

create or replace function public.ad_budget_set(_month date, _unit uuid, _campaign text, _amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_m date := date_trunc('month', _month)::date; v_camp text := coalesce(lower(btrim(_campaign)), '');
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is not null and not public.can_manage_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if _amount is null or _amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if v_camp <> '' and v_camp !~ '^[a-z0-9_-]{1,60}$' then raise exception 'INVALID_CAMPAIGN'; end if;
  if _amount = 0 then
    delete from public.ad_budgets where organization_id = v_org and month = v_m and campaign = v_camp
      and coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(_unit, '00000000-0000-0000-0000-000000000000'::uuid);
  else
    insert into public.ad_budgets (organization_id, month, unit_id, campaign, planned_amount, created_by)
    values (v_org, v_m, _unit, v_camp, _amount, auth.uid())
    on conflict (organization_id, month, campaign, (coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid)))
    do update set planned_amount = excluded.planned_amount, updated_at = now();
  end if;
  perform public.write_audit('painel', 'anuncio.orcamento', 'ad_budget', null, _unit, null,
    jsonb_build_object('mes', v_m, 'campanha', v_camp, 'valor', _amount), null);
end $$;
revoke all on function public.ad_budget_set(date,uuid,text,numeric) from public, anon;
grant execute on function public.ad_budget_set(date,uuid,text,numeric) to authenticated;

-- 3) Estimativa de valor por pessoa (rodízio: tabela de Valores; quilo: ticket médio informado em Marketing) ----------
create or replace function public._est_price_pp(_unit uuid, _date date, _service text, _org uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when _service = 'almoco_quilo'
    then (select s.quilo_avg_ticket from public.site_settings s where s.organization_id = _org)
    else (select nullif(e->>'price_on_date', '')::numeric
            from jsonb_array_elements(coalesce(public.resolve_unit_prices(_unit, _date)->'services', '[]'::jsonb)) e
           where e->>'service' = _service limit 1)
  end
$$;
revoke all on function public._est_price_pp(uuid,date,text,uuid) from public, anon, authenticated;

-- 4) Relatório de anúncios --------------------------------------------------------------------------
-- Reservas "de anúncio" = reservas criadas no período COM campanha. CAC = gasto / clientes novos (primeira reserva
-- da vida do cliente, feita no período, com campanha, não cancelada). Valores estimados: pessoas × preço/pessoa.
create or replace function public.report_ads(_from date, _to date, _unit uuid default null, _campaign text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb; v_org uuid := public._ad_scope_org(); v_camp text := nullif(lower(btrim(coalesce(_campaign,''))), '');
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_end date := least(_to, (now() at time zone 'America/Sao_Paulo')::date);
  v_ms date; v_dim int; v_el int;
begin
  perform public._report_guard(_unit);
  if _to < _from or (_to - _from) > 400 then raise exception 'INVALID_RANGE'; end if;
  v_ms := date_trunc('month', greatest(v_end, _from))::date;
  v_dim := extract(day from (v_ms + interval '1 month - 1 day'))::int;
  v_el := greatest(1, (least(v_end, (v_ms + interval '1 month - 1 day')::date) - v_ms) + 1);

  with
  sp as (
    select x.* from public.ad_spend x
     where x.organization_id = v_org and x.spend_date between _from and _to
       and ((_unit is null and (x.unit_id is null or public.can_access_unit(auth.uid(), x.unit_id))) or (_unit is not null and x.unit_id = _unit))
       and (v_camp is null or x.campaign = v_camp)
  ),
  bd as (
    select x.* from public.ad_budgets x
     where x.organization_id = v_org and x.month between date_trunc('month', _from)::date and date_trunc('month', _to)::date
       and ((_unit is null and (x.unit_id is null or public.can_access_unit(auth.uid(), x.unit_id))) or (_unit is not null and x.unit_id = _unit))
       and (v_camp is null or x.campaign = v_camp)
  ),
  rv as (   -- reservas atribuídas a anúncio, criadas no período
    select x.*, (x.created_at at time zone 'America/Sao_Paulo')::date cdate from public.reservations x
     where x.organization_id = v_org and (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
       and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
       and x.campaign is not null and (v_camp is null or x.campaign = v_camp)
  ),
  rv_all as (
    select count(*) n from public.reservations x
     where x.organization_id = v_org and (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
       and public.can_access_unit(auth.uid(), x.unit_id) and (_unit is null or x.unit_id = _unit)
  ),
  firsts as (
    select distinct on (x.customer_id) x.id, x.customer_id, x.created_at, x.campaign, x.status, x.unit_id
      from public.reservations x where x.organization_id = v_org and x.status <> 'cancelada'
     order by x.customer_id, x.created_at
  ),
  newc as (
    select f.* from firsts f
     where (f.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
       and f.campaign is not null and (v_camp is null or f.campaign = v_camp)
       and public.can_access_unit(auth.uid(), f.unit_id) and (_unit is null or f.unit_id = _unit)
  ),
  wl as (
    select x.* , (x.created_at at time zone 'America/Sao_Paulo')::date cdate from public.whatsapp_leads x
     where x.organization_id = v_org and (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
       and x.campaign is not null and (v_camp is null or x.campaign = v_camp)
       and ((x.unit_id is null and public.has_role(auth.uid(), 'super_admin')) or (x.unit_id is not null and public.can_access_unit(auth.uid(), x.unit_id)))
       and (_unit is null or x.unit_id = _unit)
  ),
  rl as (
    select x.*, (x.created_at at time zone 'America/Sao_Paulo')::date cdate from public.reservation_leads x
     where x.organization_id = v_org and (x.created_at at time zone 'America/Sao_Paulo')::date between _from and _to
       and x.campaign is not null and (v_camp is null or x.campaign = v_camp)
       and ((x.unit_id is null and public.has_role(auth.uid(), 'super_admin')) or (x.unit_id is not null and public.can_access_unit(auth.uid(), x.unit_id)))
       and (_unit is null or x.unit_id = _unit)
  ),
  est as (   -- faturamento estimado das reservas que viram/viraram visita (confirmada, concluída)
    select r.id, r.campaign, r.cdate, r.unit_id, r.party_size * public._est_price_pp(r.unit_id, r.reservation_date, r.service, v_org) as val
      from rv r where r.status in ('confirmada','concluida')
  ),
  tot as (
    select
      (select coalesce(sum(amount),0) from sp) spend,
      (select coalesce(sum(impressions),0) from sp) impressions,
      (select coalesce(sum(clicks),0) from sp) clicks,
      (select coalesce(sum(planned_amount),0) from bd) planned,
      (select count(*) from wl) wa_leads,
      (select count(*) from rl) form_leads,
      (select count(*) from rv where status <> 'cancelada') reservations,
      (select count(*) from rv) reservations_all,
      (select count(*) from rv where status = 'concluida') attended,
      (select count(*) from rv where status = 'nao_compareceu') noshow,
      (select count(*) from rv where status = 'cancelada') cancelled,
      (select coalesce(sum(party_size),0) from rv where status <> 'cancelada') guests,
      (select count(*) from newc) new_customers,
      (select n from rv_all) all_reservations,
      (select coalesce(sum(val),0) from est) est_revenue,
      (select count(*) from est where val is not null) est_n,
      (select count(*) from est where val is null) est_missing
  ),
  proj as (
    select
      (select coalesce(sum(amount),0) from public.ad_spend x where x.organization_id = v_org and x.spend_date between v_ms and v_end
         and ((_unit is null and (x.unit_id is null or public.can_access_unit(auth.uid(), x.unit_id))) or (_unit is not null and x.unit_id = _unit))
         and (v_camp is null or x.campaign = v_camp)) m_spend,
      (select count(*) from public.reservations x where x.organization_id = v_org and x.status <> 'cancelada' and x.campaign is not null
         and (x.created_at at time zone 'America/Sao_Paulo')::date between v_ms and v_end and public.can_access_unit(auth.uid(), x.unit_id)
         and (_unit is null or x.unit_id = _unit) and (v_camp is null or x.campaign = v_camp)) m_res,
      (select count(*) from firsts f where (f.created_at at time zone 'America/Sao_Paulo')::date between v_ms and v_end
         and f.campaign is not null and public.can_access_unit(auth.uid(), f.unit_id) and (_unit is null or f.unit_id = _unit)
         and (v_camp is null or f.campaign = v_camp)) m_new,
      (select coalesce(sum(planned_amount),0) from public.ad_budgets x where x.organization_id = v_org and x.month = v_ms
         and ((_unit is null and (x.unit_id is null or public.can_access_unit(auth.uid(), x.unit_id))) or (_unit is not null and x.unit_id = _unit))
         and (v_camp is null or x.campaign = v_camp)) m_budget
  ),
  camps as (
    select k from (select campaign k from sp union select campaign from rv union select campaign from wl union select campaign from rl) u
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to, 'days', (_to - _from) + 1),
    'totals', (select to_jsonb(t) from tot t),
    'metrics', (select jsonb_build_object(
        'cac', round(t.spend / nullif(t.new_customers, 0), 2),
        'cost_per_lead', round(t.spend / nullif(t.wa_leads + t.form_leads, 0), 2),
        'cost_per_reservation', round(t.spend / nullif(t.reservations, 0), 2),
        'cost_per_attended', round(t.spend / nullif(t.attended, 0), 2),
        'cost_per_click', round(t.spend / nullif(t.clicks, 0), 2),
        'avg_party', round(t.guests::numeric / nullif(t.reservations, 0), 1),
        'avg_ticket_estimated', round(t.est_revenue / nullif(t.est_n, 0), 2),
        'avg_ticket_per_person_estimated', round(t.est_revenue / nullif((select coalesce(sum(r.party_size),0) from rv r where r.status in ('confirmada','concluida')), 0), 2),
        'roas_estimated', round(t.est_revenue / nullif(t.spend, 0), 2),
        'attended_rate', round(100.0 * t.attended / nullif(t.attended + t.noshow, 0), 1),
        'share_of_reservations', round(100.0 * t.reservations_all / nullif(t.all_reservations, 0), 1)) from tot t),
    'budget', (select jsonb_build_object('planned', t.planned, 'spent', t.spend,
        'remaining', t.planned - t.spend, 'used_pct', round(100.0 * t.spend / nullif(t.planned, 0), 1)) from tot t),
    'projection', (select jsonb_build_object(
        'month', v_ms, 'days_elapsed', v_el, 'days_in_month', v_dim,
        'spend_to_date', p.m_spend, 'reservations_to_date', p.m_res, 'new_customers_to_date', p.m_new,
        'spend_projected', round(p.m_spend / v_el * v_dim, 2),
        'reservations_projected', round(p.m_res::numeric / v_el * v_dim, 0),
        'new_customers_projected', round(p.m_new::numeric / v_el * v_dim, 0),
        'cac_projected', round((p.m_spend / v_el * v_dim) / nullif(p.m_new::numeric / v_el * v_dim, 0), 2),
        'budget_month', p.m_budget,
        'budget_left_projected', round(p.m_budget - p.m_spend / v_el * v_dim, 2)) from proj p),
    'by_campaign', coalesce((select jsonb_agg(obj order by (obj->>'spend')::numeric desc, (obj->>'reservations')::int desc) from (
        select jsonb_build_object(
          'campaign', case when c.k = '' then '(sem campanha)' else c.k end,
          'spend', coalesce((select sum(amount) from sp where sp.campaign = c.k), 0),
          'leads', (select count(*) from wl where wl.campaign = c.k) + (select count(*) from rl where rl.campaign = c.k),
          'reservations', (select count(*) from rv where rv.campaign = c.k and rv.status <> 'cancelada'),
          'new_customers', (select count(*) from newc where newc.campaign = c.k),
          'cac', round(coalesce((select sum(amount) from sp where sp.campaign = c.k), 0) / nullif((select count(*) from newc where newc.campaign = c.k), 0), 2),
          'cost_per_reservation', round(coalesce((select sum(amount) from sp where sp.campaign = c.k), 0) / nullif((select count(*) from rv where rv.campaign = c.k and rv.status <> 'cancelada'), 0), 2),
          'est_revenue', coalesce((select sum(val) from est where est.campaign = c.k), 0)) obj
        from camps c) q), '[]'::jsonb),
    'by_unit', coalesce((select jsonb_agg(obj order by (obj->>'spend')::numeric desc) from (
        select jsonb_build_object('unit', coalesce(u.name, 'Rede toda'),
          'spend', coalesce(s.amount, 0), 'reservations', coalesce(r.n, 0), 'leads', coalesce(w.n, 0)) obj
          from (select unit_id from sp union select unit_id from rv union select unit_id from wl) k
          left join public.units u on u.id = k.unit_id
          left join lateral (select sum(amount) amount from sp where sp.unit_id is not distinct from k.unit_id) s on true
          left join lateral (select count(*) n from rv where rv.unit_id is not distinct from k.unit_id and rv.status <> 'cancelada') r on true
          left join lateral (select count(*) n from wl where wl.unit_id is not distinct from k.unit_id) w on true) q), '[]'::jsonb),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', d::date,
          'spend', coalesce((select sum(amount) from sp where sp.spend_date = d::date), 0),
          'leads', (select count(*) from wl where wl.cdate = d::date) + (select count(*) from rl where rl.cdate = d::date),
          'reservations', (select count(*) from rv where rv.cdate = d::date and rv.status <> 'cancelada')) order by d)
        from generate_series(_from, _to, interval '1 day') d), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke all on function public.report_ads(date,date,uuid,text) from public, anon;
grant execute on function public.report_ads(date,date,uuid,text) to authenticated;

-- 5) Páginas de campanha (gerador de formulário) --------------------------------------------------------
create table if not exists public.campaign_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null default 'reserva' check (kind in ('reserva','whatsapp')),
  headline text not null default 'Reserve sua mesa' check (char_length(headline) between 2 and 90),
  subheadline text check (subheadline is null or char_length(subheadline) <= 200),
  city text check (city is null or city in ('goiania','anapolis')),
  service text check (service is null or service in ('rodizio_carnes','rodizio_pizza','almoco_quilo')),
  campaign text not null check (campaign ~ '^[a-z0-9_-]{1,60}$'),
  cta_label text not null default 'Reservar agora' check (char_length(cta_label) between 2 and 30),
  thank_you text check (thank_you is null or char_length(thank_you) <= 300),
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);
revoke all on public.campaign_pages from anon, authenticated;
grant select on public.campaign_pages to authenticated;
grant all on public.campaign_pages to service_role;
alter table public.campaign_pages enable row level security;
drop policy if exists "gestor lê páginas de campanha" on public.campaign_pages;
create policy "gestor lê páginas de campanha" on public.campaign_pages for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));
drop trigger if exists campaign_pages_updated_at on public.campaign_pages;
create trigger campaign_pages_updated_at before update on public.campaign_pages for each row execute function public.set_updated_at();

create or replace function public.campaign_page_save(_id uuid, _slug text, _name text, _kind text, _headline text, _subheadline text,
  _city text, _service text, _campaign text, _cta text, _thank_you text, _is_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_id uuid; v_slug text := lower(btrim(coalesce(_slug,'')));
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if v_slug !~ '^[a-z0-9-]{3,60}$' then raise exception 'INVALID_SLUG'; end if;
  if _id is null then
    insert into public.campaign_pages (organization_id, slug, name, kind, headline, subheadline, city, service, campaign, cta_label, thank_you, is_active, created_by)
    values (v_org, v_slug, btrim(_name), _kind, btrim(_headline), nullif(btrim(coalesce(_subheadline,'')),''), nullif(_city,''), nullif(_service,''),
            lower(btrim(coalesce(nullif(_campaign,''), v_slug))), coalesce(nullif(btrim(_cta),''), 'Reservar agora'), nullif(btrim(coalesce(_thank_you,'')),''),
            coalesce(_is_active, true), auth.uid())
    returning id into v_id;
  else
    update public.campaign_pages set slug = v_slug, name = btrim(_name), kind = _kind, headline = btrim(_headline),
           subheadline = nullif(btrim(coalesce(_subheadline,'')),''), city = nullif(_city,''), service = nullif(_service,''),
           campaign = lower(btrim(coalesce(nullif(_campaign,''), v_slug))), cta_label = coalesce(nullif(btrim(_cta),''), 'Reservar agora'),
           thank_you = nullif(btrim(coalesce(_thank_you,'')),''), is_active = coalesce(_is_active, true)
     where id = _id and organization_id = v_org returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  perform public.write_audit('painel', 'campanha.salva', 'campaign_page', v_id, null, null,
    jsonb_build_object('slug', v_slug, 'tipo', _kind, 'cidade', _city, 'servico', _service, 'ativa', coalesce(_is_active, true)), null);
  return v_id;
exception when unique_violation then raise exception 'DUPLICATE_SLUG';
end $$;
revoke all on function public.campaign_page_save(uuid,text,text,text,text,text,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.campaign_page_save(uuid,text,text,text,text,text,text,text,text,text,text,boolean) to authenticated;

create or replace function public.campaign_page_delete(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  delete from public.campaign_pages where id = _id and organization_id = public._ad_scope_org() returning * into p;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.write_audit('painel', 'campanha.removida', 'campaign_page', _id, null, jsonb_build_object('slug', p.slug), null, null);
end $$;
revoke all on function public.campaign_page_delete(uuid) from public, anon;
grant execute on function public.campaign_page_delete(uuid) to authenticated;

-- Público: dados de uma página de campanha ativa (nada sensível).
create or replace function public.public_campaign_page(_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('slug', p.slug, 'kind', p.kind, 'headline', p.headline, 'subheadline', p.subheadline,
           'city', p.city, 'service', p.service, 'campaign', p.campaign, 'cta_label', p.cta_label, 'thank_you', p.thank_you)
    from public.campaign_pages p where p.slug = lower(coalesce(_slug,'')) and p.is_active limit 1
$$;
revoke all on function public.public_campaign_page(text) from public;
grant execute on function public.public_campaign_page(text) to anon, authenticated;
