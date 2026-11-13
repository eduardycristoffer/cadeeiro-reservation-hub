-- 015 — CRM: modelos de mensagem, follow-up pós-visita, reaver (clientes inativos e leads do WhatsApp),
--       remarketing por campanha e fila de envios.
--
-- Como o envio acontece: este banco só decide QUEM recebe O QUÊ e QUANDO (fila `crm_sends`).
-- Quem entrega no WhatsApp é o n8n/SDR, que consulta GET /api/public/sdr/crm/sends/due e registra o resultado
-- em POST /api/public/sdr/crm/sends. Assim nada de mensagem em massa sai sem passar pelas travas abaixo:
--   * só clientes com autorização de WhatsApp e que nunca pediram para sair (PARAR/SAIR/STOP);
--   * janela de horário (padrão 09h–20h, Brasília) e limite diário (padrão 80 mensagens);
--   * intervalo mínimo entre mensagens de marketing para o mesmo cliente (padrão 14 dias);
--   * automações vêm DESLIGADAS; remarketing exige um gestor confirmar o envio, com no máximo 500 pessoas.
-- Nenhuma função aqui envia nada sozinha. Nenhum dado é inserido pela migration (modelos padrão ficam em função).

-- 1) Configuração -----------------------------------------------------------------------------------
create table if not exists public.crm_marketing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  send_window_start time not null default '09:00',
  send_window_end time not null default '20:00',
  daily_cap integer not null default 80 check (daily_cap between 1 and 1000),
  marketing_gap_days integer not null default 14 check (marketing_gap_days between 1 and 365),
  followup_pos_enabled boolean not null default false,
  followup_pos_delay_hours integer not null default 20 check (followup_pos_delay_hours between 1 and 72),
  reaver_inativo_enabled boolean not null default false,
  reaver_inativo_days integer not null default 60 check (reaver_inativo_days between 15 and 730),
  reaver_lead_enabled boolean not null default false,
  reaver_lead_hours integer not null default 24 check (reaver_lead_hours between 1 and 168),
  public_url text check (public_url is null or public_url ~ '^https://[a-z0-9.-]+(/[^[:space:]]*)?$'),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (send_window_end > send_window_start)
);

-- 2) Modelos de mensagem ------------------------------------------------------------------------------
create table if not exists public.crm_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('confirmacao','cancelamento','followup_pos','reaver_inativo','reaver_lead','remarketing')),
  body text not null check (char_length(body) between 10 and 800),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);

-- 3) Campanhas de remarketing e fila de envios ----------------------------------------------------------
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null,
  audience text not null check (audience in ('inativos','visitaram','leads')),
  unit_id uuid references public.units(id) on delete set null,
  days integer,
  body text not null check (char_length(body) between 10 and 600),
  status text not null default 'enviando' check (status in ('enviando','concluida','cancelada')),
  total integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_sends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('followup_pos','reaver_inativo','reaver_lead','remarketing')),
  campaign_id uuid references public.crm_campaigns(id) on delete set null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  lead_id uuid references public.whatsapp_leads(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  phone_e164 text not null,
  first_name text,
  text text not null check (char_length(text) between 5 and 1500),
  status text not null default 'pendente' check (status in ('pendente','enviando','enviado','falhou','cancelado')),
  attempts integer not null default 0,
  last_error text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_sends_campaign_customer_idx on public.crm_sends (campaign_id, customer_id) where campaign_id is not null;
create unique index if not exists crm_sends_followup_idx on public.crm_sends (reservation_id) where kind = 'followup_pos' and reservation_id is not null;
create unique index if not exists crm_sends_lead_idx on public.crm_sends (lead_id) where kind = 'reaver_lead' and lead_id is not null;
create index if not exists crm_sends_queue_idx on public.crm_sends (status, scheduled_for);
create index if not exists crm_sends_customer_idx on public.crm_sends (customer_id, created_at desc);

do $$ declare t text; begin
  foreach t in array array['crm_marketing_settings','crm_templates','crm_campaigns','crm_sends'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
grant select on public.crm_marketing_settings, public.crm_templates, public.crm_campaigns, public.crm_sends to authenticated;

drop policy if exists "gestor lê config do CRM" on public.crm_marketing_settings;
create policy "gestor lê config do CRM" on public.crm_marketing_settings for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "gestor lê modelos" on public.crm_templates;
create policy "gestor lê modelos" on public.crm_templates for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));
drop policy if exists "gestor lê campanhas do CRM" on public.crm_campaigns;
create policy "gestor lê campanhas do CRM" on public.crm_campaigns for select to authenticated
  using ((public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'))
         and (unit_id is null or public.can_access_unit(auth.uid(), unit_id)));
drop policy if exists "gestor lê envios do CRM" on public.crm_sends;
create policy "gestor lê envios do CRM" on public.crm_sends for select to authenticated
  using ((public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'))
         and (unit_id is null or public.can_access_unit(auth.uid(), unit_id)));

drop trigger if exists crm_marketing_settings_updated_at on public.crm_marketing_settings;
create trigger crm_marketing_settings_updated_at before update on public.crm_marketing_settings for each row execute function public.set_updated_at();
drop trigger if exists crm_templates_updated_at on public.crm_templates;
create trigger crm_templates_updated_at before update on public.crm_templates for each row execute function public.set_updated_at();
drop trigger if exists crm_campaigns_updated_at on public.crm_campaigns;
create trigger crm_campaigns_updated_at before update on public.crm_campaigns for each row execute function public.set_updated_at();
drop trigger if exists crm_sends_updated_at on public.crm_sends;
create trigger crm_sends_updated_at before update on public.crm_sends for each row execute function public.set_updated_at();

-- 4) Utilitários internos (não chamáveis pelo navegador) -------------------------------------------------
create or replace function public._crm_cfg(_org uuid)
returns public.crm_marketing_settings language sql stable security definer set search_path = public as $$
  select coalesce(
    (select s from public.crm_marketing_settings s where s.organization_id = _org),
    row(_org, '09:00'::time, '20:00'::time, 80, 14, false, 20, false, 60, false, 24, null::text, null::uuid, now())::public.crm_marketing_settings)
$$;
revoke all on function public._crm_cfg(uuid) from public, anon, authenticated;

create or replace function public._crm_default_template(_key text)
returns text language sql immutable as $$
  select case _key
    when 'confirmacao' then E'Olá, {{nome}}! 🎉 Sua reserva no {{unidade}} está confirmada.\n📅 {{dia}} às {{hora}}\n👥 {{pessoas}} pessoas\n🔖 Protocolo: {{protocolo}}\nTe esperamos!'
    when 'cancelamento' then E'Olá, {{nome}}. Infelizmente sua reserva no {{unidade}} para {{dia}} às {{hora}} não pôde ser mantida.\nMotivo: {{motivo}}\nSe quiser, podemos reagendar — é só responder esta mensagem. 💛'
    when 'followup_pos' then E'Oi, {{nome}}! Foi um prazer receber você no {{unidade}}. 😊\nComo foi sua experiência? Sua opinião nos ajuda a melhorar.\nQuando quiser voltar, é só reservar: {{link}}'
    when 'reaver_inativo' then E'Oi, {{nome}}, quanto tempo! 😊 Sentimos sua falta no {{unidade}}.\nQue tal reservar uma mesa? {{link}}'
    when 'reaver_lead' then E'Oi, {{nome}}! Vimos que você chamou o {{unidade}} mas não chegou a reservar. Posso ajudar a garantir sua mesa? 😊\nReserve em segundos: {{link}}'
    when 'remarketing' then E'Oi, {{nome}}! Tem novidade no {{unidade}} 🎉\n{{link}}'
  end
$$;

-- Troca {{variável}} pelo valor. Linha cuja variável está vazia some inteira (ex.: "Motivo: {{motivo}}" sem motivo).
create or replace function public._crm_render(_body text, _vars jsonb)
returns text language plpgsql immutable as $$
declare ln text; res text[] := '{}'; m text[]; k text; v text; keep boolean;
begin
  foreach ln in array string_to_array(coalesce(_body, ''), E'\n') loop
    keep := true;
    for m in select regexp_matches(ln, '\{\{([a-z_]+)\}\}', 'g') loop
      k := m[1];
      v := nullif(btrim(coalesce(_vars ->> k, '')), '');
      if v is null then keep := false; exit; end if;
      ln := replace(ln, '{{' || k || '}}', v);
    end loop;
    if keep then res := res || ln; end if;
  end loop;
  return btrim(regexp_replace(array_to_string(res, E'\n'), E'\n{3,}', E'\n\n', 'g'));
end $$;

-- Marketing leva rodapé de saída; confirmação/cancelamento não.
create or replace function public._crm_finalize(_kind text, _text text)
returns text language sql immutable as $$
  select case when _kind in ('confirmacao','cancelamento') or _text ~* '\msair\M'
              then _text else _text || E'\n\nPara não receber mais mensagens, responda SAIR.' end
$$;

create or replace function public._crm_vars(_unit uuid, _first text, _res uuid default null, _reason text default null, _campaign text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare u record; r record; cfg public.crm_marketing_settings; v jsonb; wd text[] := array['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
begin
  select un.id, un.name, un.slug, un.organization_id into u from public.units un where un.id = _unit;
  cfg := public._crm_cfg(coalesce(u.organization_id, public._default_org()));
  v := jsonb_build_object('nome', initcap(btrim(coalesce(_first, ''))), 'unidade', u.name,
         'cidade', btrim(regexp_replace(coalesce(u.name, ''), '^\s*(rede\s+)?cand[ae]+iro\s+', '', 'i')),
         'motivo', nullif(btrim(coalesce(_reason, '')), ''));
  if cfg.public_url is not null and u.slug is not null then
    v := v || jsonb_build_object('link', rtrim(cfg.public_url, '/') || '/reservar?cidade=' || u.slug
           || case when _campaign is not null then '&campanha=' || _campaign else '' end);
  end if;
  if _res is not null then
    select rs.reservation_date d, rs.reservation_time t, rs.party_size p, rs.protocol pr into r from public.reservations rs where rs.id = _res;
    if found then
      v := v || jsonb_build_object('data', to_char(r.d, 'DD/MM'), 'dia', wd[extract(dow from r.d)::int + 1] || ', ' || to_char(r.d, 'DD/MM'),
             'hora', to_char(r.t, 'HH24:MI'), 'pessoas', r.p::text, 'protocolo', r.pr);
    end if;
  end if;
  return v;
end $$;
revoke all on function public._crm_vars(uuid,text,uuid,text,text) from public, anon, authenticated;

-- Texto do modelo da organização (ou o padrão).
create or replace function public._crm_body(_org uuid, _key text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select t.body from public.crm_templates t where t.organization_id = _org and t.key = _key), public._crm_default_template(_key))
$$;
revoke all on function public._crm_body(uuid,text) from public, anon, authenticated;

-- Confirmação/cancelamento: só devolve texto quando o gestor PERSONALIZOU o modelo; senão o n8n usa o texto que já tem.
create or replace function public._crm_transactional_text(_key text, _reservation uuid, _reason text default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; body text; r record;
begin
  select rs.organization_id, rs.unit_id, c.full_name into r from public.reservations rs join public.customers c on c.id = rs.customer_id where rs.id = _reservation;
  if not found then return null; end if;
  select t.body into body from public.crm_templates t where t.organization_id = r.organization_id and t.key = _key;
  if body is null then return null; end if;
  return public._crm_render(body, public._crm_vars(r.unit_id, split_part(btrim(r.full_name), ' ', 1), _reservation, _reason, null));
end $$;
revoke all on function public._crm_transactional_text(text,uuid,text) from public, anon, authenticated;

revoke all on function public._crm_default_template(text) from public, anon, authenticated;
revoke all on function public._crm_render(text,jsonb) from public, anon, authenticated;
revoke all on function public._crm_finalize(text,text) from public, anon, authenticated;

-- 5) Públicos (quem pode receber) ---------------------------------------------------------------------------
--   inativos : já vieram (reserva concluída) e a última visita foi há mais de _days dias
--   visitaram: já vieram alguma vez
--   leads    : chamaram no WhatsApp e não reservaram depois
-- Sempre: autorizou WhatsApp, nunca pediu para sair, sem reserva futura, sem marketing recente (marketing_gap_days).
create or replace function public._crm_audience(_org uuid, _audience text, _unit uuid, _days integer, _viewer uuid default null)
returns table (customer_id uuid, unit_id uuid, first_name text, phone text, lead_id uuid, last_visit date)
language sql stable security definer set search_path = public as $$
  with cfg as (select * from public._crm_cfg(_org)),
  visits as (
    select r.customer_id, max(r.reservation_date) as last_visit,
           (array_agg(r.unit_id order by r.reservation_date desc, r.created_at desc))[1] as unit_id
      from public.reservations r where r.organization_id = _org and r.status = 'concluida' group by r.customer_id
  ),
  lead_last as (
    select distinct on (l.customer_id) l.customer_id, l.id as lead_id, l.unit_id, l.created_at
      from public.whatsapp_leads l
     where l.organization_id = _org and l.customer_id is not null and l.status in ('novo','chamado','perdido')
     order by l.customer_id, l.created_at desc
  ),
  cand as (
    select c.id as customer_id, c.full_name, c.phone_e164, v.unit_id, null::uuid as lead_id, v.last_visit
      from public.customers c join visits v on v.customer_id = c.id
     where _audience in ('inativos','visitaram') and c.organization_id = _org
       and (_audience = 'visitaram' or v.last_visit < current_date - greatest(coalesce(_days, 60), 1))
    union all
    select c.id, c.full_name, c.phone_e164, ll.unit_id, ll.lead_id, null::date
      from public.customers c join lead_last ll on ll.customer_id = c.id
     where _audience = 'leads' and c.organization_id = _org
       and not exists (select 1 from public.reservations r where r.customer_id = c.id and r.created_at >= ll.created_at and r.status <> 'cancelada')
  )
  select x.customer_id, x.unit_id, initcap(split_part(btrim(x.full_name), ' ', 1)), x.phone_e164, x.lead_id, x.last_visit
    from cand x
    join public.customers c on c.id = x.customer_id and c.whatsapp_opt_in and c.whatsapp_opt_out_at is null
    cross join cfg
   where (_unit is null or x.unit_id = _unit)
     and (_viewer is null or (x.unit_id is not null and public.can_access_unit(_viewer, x.unit_id)))
     and not exists (select 1 from public.reservations r where r.customer_id = x.customer_id and r.status in ('pendente','confirmada') and r.reservation_date >= current_date)
     and not exists (select 1 from public.crm_sends s where s.customer_id = x.customer_id and s.kind in ('reaver_inativo','reaver_lead','remarketing')
                      and s.status in ('pendente','enviando','enviado') and s.created_at > now() - make_interval(days => cfg.marketing_gap_days))
$$;
revoke all on function public._crm_audience(uuid,text,uuid,integer,uuid) from public, anon, authenticated;

-- 6) Automações (follow-up pós-visita, reaver inativos e leads) ----------------------------------------------
-- Chamada pelo próprio fluxo de envio (sdr_crm_sends_due) a cada consulta do n8n; é idempotente.
create or replace function public.crm_run_automations()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare o record; cfg public.crm_marketing_settings; n integer := 0; k integer; now_sp timestamp := (now() at time zone 'America/Sao_Paulo');
begin
  for o in select id from public.organizations loop
    cfg := public._crm_cfg(o.id);

    if cfg.followup_pos_enabled then
      insert into public.crm_sends (organization_id, kind, customer_id, reservation_id, unit_id, phone_e164, first_name, text, scheduled_for)
      select o.id, 'followup_pos', c.id, r.id, r.unit_id, c.phone_e164, initcap(split_part(btrim(c.full_name), ' ', 1)),
             public._crm_finalize('followup_pos', public._crm_render(public._crm_body(o.id, 'followup_pos'),
               public._crm_vars(r.unit_id, split_part(btrim(c.full_name), ' ', 1), r.id, null, 'followup'))), now()
        from public.reservations r join public.customers c on c.id = r.customer_id
       where r.organization_id = o.id and r.status = 'concluida' and c.whatsapp_opt_in and c.whatsapp_opt_out_at is null
         and r.reservation_date >= (now_sp::date - 3)
         and (r.reservation_date + r.reservation_time) + make_interval(hours => cfg.followup_pos_delay_hours) <= now_sp
         and not exists (select 1 from public.crm_sends s where s.kind = 'followup_pos' and s.reservation_id = r.id)
       order by r.reservation_date, r.reservation_time limit 50
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;

    if cfg.reaver_inativo_enabled then
      insert into public.crm_sends (organization_id, kind, customer_id, unit_id, phone_e164, first_name, text, scheduled_for)
      select o.id, 'reaver_inativo', a.customer_id, a.unit_id, a.phone, a.first_name,
             public._crm_finalize('reaver_inativo', public._crm_render(public._crm_body(o.id, 'reaver_inativo'),
               public._crm_vars(a.unit_id, a.first_name, null, null, 'reaver-inativo'))), now()
        from public._crm_audience(o.id, 'inativos', null, cfg.reaver_inativo_days, null) a
       limit 20;
      get diagnostics k = row_count; n := n + k;
    end if;

    if cfg.reaver_lead_enabled then
      insert into public.crm_sends (organization_id, kind, customer_id, lead_id, unit_id, phone_e164, first_name, text, scheduled_for)
      select o.id, 'reaver_lead', l.customer_id, l.id, l.unit_id, l.phone_e164, initcap(split_part(btrim(l.full_name), ' ', 1)),
             public._crm_finalize('reaver_lead', public._crm_render(public._crm_body(o.id, 'reaver_lead'),
               public._crm_vars(l.unit_id, split_part(btrim(l.full_name), ' ', 1), null, null, 'reaver-lead'))), now()
        from public.whatsapp_leads l join public.customers c on c.id = l.customer_id and c.whatsapp_opt_in and c.whatsapp_opt_out_at is null
       where l.organization_id = o.id and l.customer_id is not null and l.status in ('novo','chamado')
         and l.created_at <= now() - make_interval(hours => cfg.reaver_lead_hours) and l.created_at > now() - interval '7 days'
         and not exists (select 1 from public.reservations r where r.customer_id = l.customer_id and r.created_at >= l.created_at and r.status <> 'cancelada')
         and not exists (select 1 from public.crm_sends s where s.kind = 'reaver_lead' and s.lead_id = l.id)
         and not exists (select 1 from public.crm_sends s where s.customer_id = l.customer_id and s.kind in ('reaver_inativo','reaver_lead','remarketing')
                          and s.status in ('pendente','enviando','enviado') and s.created_at > now() - make_interval(days => cfg.marketing_gap_days))
       order by l.created_at limit 20
      on conflict do nothing;
      get diagnostics k = row_count; n := n + k;
    end if;
  end loop;
  return n;
end $$;
revoke all on function public.crm_run_automations() from public, anon, authenticated;
grant execute on function public.crm_run_automations() to service_role;

-- 7) Fila para o n8n -----------------------------------------------------------------------------------------
create or replace function public.sdr_crm_sends_due(_limit integer default 10, _unit_ids uuid[] default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_org uuid := public._default_org(); cfg public.crm_marketing_settings; t_sp time := (now() at time zone 'America/Sao_Paulo')::time;
        sent_today integer; v_lim integer; out jsonb;
begin
  perform public.crm_run_automations();
  cfg := public._crm_cfg(v_org);

  -- envios que ficaram presos sem resposta do n8n voltam para a fila (ou falham após 3 tentativas)
  update public.crm_sends set status = case when attempts >= 3 then 'falhou' else 'pendente' end,
         last_error = coalesce(last_error, 'sem retorno do envio'), scheduled_for = now() + interval '10 minutes'
   where organization_id = v_org and status = 'enviando' and updated_at < now() - interval '15 minutes';

  -- quem pediu para sair depois que a mensagem entrou na fila não recebe
  update public.crm_sends s set status = 'cancelado', last_error = 'cliente não recebe mais mensagens'
    from public.customers c
   where c.id = s.customer_id and s.organization_id = v_org and s.status = 'pendente'
     and (c.whatsapp_opt_out_at is not null or not c.whatsapp_opt_in);

  if t_sp < cfg.send_window_start or t_sp >= cfg.send_window_end then return '[]'::jsonb; end if;

  select count(*) into sent_today from public.crm_sends
   where organization_id = v_org and status in ('enviando','enviado')
     and (coalesce(sent_at, updated_at) at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;
  v_lim := least(greatest(1, coalesce(_limit, 10)), 50, cfg.daily_cap - sent_today);
  if v_lim <= 0 then return '[]'::jsonb; end if;

  with picked as (
    select s.id from public.crm_sends s
     where s.organization_id = v_org and s.status = 'pendente' and s.scheduled_for <= now() and s.attempts < 3
       and (_unit_ids is null or s.unit_id = any(_unit_ids))
     order by s.scheduled_for, s.created_at limit v_lim for update skip locked
  ), upd as (
    update public.crm_sends s set status = 'enviando', attempts = s.attempts + 1 from picked where s.id = picked.id returning s.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'kind', u.kind, 'phone', u.phone_e164, 'first_name', u.first_name, 'text', u.text,
           'unit_id', un.id, 'unit_slug', un.slug, 'unit_name', un.name, 'attempts', u.attempts) order by u.scheduled_for), '[]'::jsonb)
    into out from upd u left join public.units un on un.id = u.unit_id;
  return out;
end $$;
revoke all on function public.sdr_crm_sends_due(integer,uuid[]) from public, anon, authenticated;
grant execute on function public.sdr_crm_sends_due(integer,uuid[]) to service_role;

create or replace function public.sdr_mark_crm_send(_id uuid, _ok boolean, _error text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare s record;
begin
  update public.crm_sends x
     set status = case when _ok then 'enviado' when x.attempts >= 3 then 'falhou' else 'pendente' end,
         sent_at = case when _ok then now() else x.sent_at end,
         last_error = case when _ok then null else left(coalesce(_error, 'erro'), 300) end,
         scheduled_for = case when _ok or x.attempts >= 3 then x.scheduled_for else now() + interval '10 minutes' end
   where x.id = _id and x.status = 'enviando'
  returning x.* into s;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.crm_campaigns c set status = 'concluida'
   where c.id = s.campaign_id and c.status = 'enviando'
     and not exists (select 1 from public.crm_sends y where y.campaign_id = c.id and y.status in ('pendente','enviando'));
end $$;
revoke all on function public.sdr_mark_crm_send(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.sdr_mark_crm_send(uuid,boolean,text) to service_role;

-- 8) Painel: configuração e modelos ---------------------------------------------------------------------------
create or replace function public.crm_settings_get()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare cfg public.crm_marketing_settings;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  cfg := public._crm_cfg(public._ad_scope_org());
  return to_jsonb(cfg) - 'organization_id' - 'updated_by' - 'updated_at'
         || jsonb_build_object('send_window_start', to_char(cfg.send_window_start, 'HH24:MI'), 'send_window_end', to_char(cfg.send_window_end, 'HH24:MI'));
end $$;
revoke all on function public.crm_settings_get() from public, anon;
grant execute on function public.crm_settings_get() to authenticated;

create or replace function public.crm_settings_save(_cfg jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); c public.crm_marketing_settings := public._crm_cfg(public._ad_scope_org());
        v_url text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _cfg is null or jsonb_typeof(_cfg) <> 'object' then raise exception 'INVALID_SETTINGS'; end if;
  v_url := nullif(lower(btrim(coalesce(_cfg ->> 'public_url', c.public_url, ''))), '');
  begin
    insert into public.crm_marketing_settings as s (organization_id, send_window_start, send_window_end, daily_cap, marketing_gap_days,
      followup_pos_enabled, followup_pos_delay_hours, reaver_inativo_enabled, reaver_inativo_days, reaver_lead_enabled, reaver_lead_hours, public_url, updated_by)
    values (v_org,
      coalesce((_cfg ->> 'send_window_start')::time, c.send_window_start), coalesce((_cfg ->> 'send_window_end')::time, c.send_window_end),
      coalesce((_cfg ->> 'daily_cap')::int, c.daily_cap), coalesce((_cfg ->> 'marketing_gap_days')::int, c.marketing_gap_days),
      coalesce((_cfg ->> 'followup_pos_enabled')::boolean, c.followup_pos_enabled), coalesce((_cfg ->> 'followup_pos_delay_hours')::int, c.followup_pos_delay_hours),
      coalesce((_cfg ->> 'reaver_inativo_enabled')::boolean, c.reaver_inativo_enabled), coalesce((_cfg ->> 'reaver_inativo_days')::int, c.reaver_inativo_days),
      coalesce((_cfg ->> 'reaver_lead_enabled')::boolean, c.reaver_lead_enabled), coalesce((_cfg ->> 'reaver_lead_hours')::int, c.reaver_lead_hours),
      v_url, auth.uid())
    on conflict (organization_id) do update set
      send_window_start = excluded.send_window_start, send_window_end = excluded.send_window_end, daily_cap = excluded.daily_cap,
      marketing_gap_days = excluded.marketing_gap_days, followup_pos_enabled = excluded.followup_pos_enabled,
      followup_pos_delay_hours = excluded.followup_pos_delay_hours, reaver_inativo_enabled = excluded.reaver_inativo_enabled,
      reaver_inativo_days = excluded.reaver_inativo_days, reaver_lead_enabled = excluded.reaver_lead_enabled,
      reaver_lead_hours = excluded.reaver_lead_hours, public_url = excluded.public_url, updated_by = excluded.updated_by;
  exception when check_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'INVALID_SETTINGS';
  end;
  perform public.write_audit('painel', 'crm.config_salva', 'crm_settings', null, null, null, _cfg - 'public_url', null);
end $$;
revoke all on function public.crm_settings_save(jsonb) from public, anon;
grant execute on function public.crm_settings_save(jsonb) to authenticated;

create or replace function public.crm_templates_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org();
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return (select jsonb_agg(jsonb_build_object('key', k.key, 'body', coalesce(t.body, public._crm_default_template(k.key)),
            'default_body', public._crm_default_template(k.key), 'is_custom', t.body is not null) order by k.ord)
            from (values (1,'confirmacao'),(2,'cancelamento'),(3,'followup_pos'),(4,'reaver_inativo'),(5,'reaver_lead'),(6,'remarketing')) k(ord, key)
            left join public.crm_templates t on t.organization_id = v_org and t.key = k.key);
end $$;
revoke all on function public.crm_templates_list() from public, anon;
grant execute on function public.crm_templates_list() to authenticated;

create or replace function public.crm_template_save(_key text, _body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_body text := btrim(coalesce(_body, ''));
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _key not in ('confirmacao','cancelamento','followup_pos','reaver_inativo','reaver_lead','remarketing') then raise exception 'INVALID_TEMPLATE'; end if;
  if char_length(v_body) < 10 or char_length(v_body) > 800 then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if v_body ~ '\{\{[^}]*[^a-z_}][^}]*\}\}' then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  insert into public.crm_templates as t (organization_id, key, body, updated_by) values (v_org, _key, v_body, auth.uid())
  on conflict (organization_id, key) do update set body = excluded.body, updated_by = excluded.updated_by;
  perform public.write_audit('painel', 'crm.modelo_salvo', 'crm_template', null, null, null, jsonb_build_object('modelo', _key), null);
end $$;
revoke all on function public.crm_template_save(text,text) from public, anon;
grant execute on function public.crm_template_save(text,text) to authenticated;

create or replace function public.crm_template_reset(_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  delete from public.crm_templates where organization_id = public._ad_scope_org() and key = _key;
  perform public.write_audit('painel', 'crm.modelo_restaurado', 'crm_template', null, null, null, jsonb_build_object('modelo', _key), null);
end $$;
revoke all on function public.crm_template_reset(text) from public, anon;
grant execute on function public.crm_template_reset(text) to authenticated;

-- 9) Painel: remarketing ----------------------------------------------------------------------------------------
create or replace function public.crm_audience_preview(_audience text, _unit uuid default null, _days integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_total integer; v_sample jsonb;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _audience not in ('inativos','visitaram','leads') then raise exception 'INVALID_AUDIENCE'; end if;
  if _unit is not null and not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  select count(*) into v_total from public._crm_audience(v_org, _audience, _unit, _days, auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object('nome', a.first_name, 'final', right(a.phone, 4))), '[]'::jsonb) into v_sample
    from (select * from public._crm_audience(v_org, _audience, _unit, _days, auth.uid()) limit 5) a;
  return jsonb_build_object('total', v_total, 'sample', v_sample, 'max', 500);
end $$;
revoke all on function public.crm_audience_preview(text,uuid,integer) from public, anon;
grant execute on function public.crm_audience_preview(text,uuid,integer) to authenticated;

create or replace function public.crm_campaign_launch(_name text, _audience text, _unit uuid, _days integer, _body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._ad_scope_org(); v_name text := btrim(coalesce(_name, '')); v_body text := btrim(coalesce(_body, ''));
  v_slug text; v_id uuid; v_n integer;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _audience not in ('inativos','visitaram','leads') then raise exception 'INVALID_AUDIENCE'; end if;
  if _unit is not null and not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'INVALID_NAME'; end if;
  if char_length(v_body) < 10 or char_length(v_body) > 600 then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if v_body ~ '\{\{[^}]*[^a-z_}][^}]*\}\}' then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  select count(*) into v_n from public._crm_audience(v_org, _audience, _unit, _days, auth.uid());
  if v_n = 0 then raise exception 'EMPTY_AUDIENCE'; end if;
  if v_n > 500 then raise exception 'TOO_MANY'; end if;

  v_slug := 'rmk-' || trim(both '-' from regexp_replace(lower(translate(v_name, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
  if v_slug = 'rmk-' then v_slug := 'rmk-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDDHH24MI'); end if;
  v_slug := left(v_slug, 60);
  insert into public.crm_campaigns (organization_id, name, slug, audience, unit_id, days, body, total, created_by)
  values (v_org, v_name, v_slug, _audience, _unit, case when _audience = 'inativos' then _days end, v_body, v_n, auth.uid())
  returning id into v_id;

  insert into public.crm_sends (organization_id, kind, campaign_id, customer_id, lead_id, unit_id, phone_e164, first_name, text, scheduled_for, created_by)
  select v_org, 'remarketing', v_id, a.customer_id, a.lead_id, a.unit_id, a.phone, a.first_name,
         public._crm_finalize('remarketing', public._crm_render(v_body, public._crm_vars(a.unit_id, a.first_name, null, null, v_slug))),
         now() + (row_number() over (order by a.last_visit nulls last, a.customer_id) - 1) * interval '15 seconds', auth.uid()
    from public._crm_audience(v_org, _audience, _unit, _days, auth.uid()) a;
  get diagnostics v_n = row_count;
  update public.crm_campaigns set total = v_n where id = v_id;

  perform public.write_audit('painel', 'crm.remarketing_enviado', 'crm_campaign', v_id, _unit, null,
    jsonb_build_object('nome', v_name, 'publico', _audience, 'pessoas', v_n), null);
  return jsonb_build_object('campaign_id', v_id, 'queued', v_n, 'campaign', v_slug);
end $$;
revoke all on function public.crm_campaign_launch(text,text,uuid,integer,text) from public, anon;
grant execute on function public.crm_campaign_launch(text,text,uuid,integer,text) to authenticated;

create or replace function public.crm_campaign_cancel(_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c record; n integer;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into c from public.crm_campaigns where id = _id and organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if c.unit_id is not null and not public.can_access_unit(auth.uid(), c.unit_id) then raise exception 'FORBIDDEN'; end if;
  update public.crm_sends set status = 'cancelado', last_error = 'campanha cancelada' where campaign_id = _id and status = 'pendente';
  get diagnostics n = row_count;
  update public.crm_campaigns set status = 'cancelada' where id = _id;
  perform public.write_audit('painel', 'crm.remarketing_cancelado', 'crm_campaign', _id, c.unit_id, null, jsonb_build_object('cancelados', n), null);
  return n;
end $$;
revoke all on function public.crm_campaign_cancel(uuid) from public, anon;
grant execute on function public.crm_campaign_cancel(uuid) to authenticated;

create or replace function public.crm_send_cancel(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.crm_sends where id = _id and organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if s.unit_id is not null and not public.can_access_unit(auth.uid(), s.unit_id) then raise exception 'FORBIDDEN'; end if;
  update public.crm_sends set status = 'cancelado', last_error = 'cancelado no painel' where id = _id and status in ('pendente','falhou');
  if not found then raise exception 'INVALID_STATUS'; end if;
end $$;
revoke all on function public.crm_send_cancel(uuid) from public, anon;
grant execute on function public.crm_send_cancel(uuid) to authenticated;

create or replace function public.crm_send_retry(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  select * into s from public.crm_sends where id = _id and organization_id = public._ad_scope_org();
  if not found then raise exception 'NOT_FOUND'; end if;
  if s.unit_id is not null and not public.can_access_unit(auth.uid(), s.unit_id) then raise exception 'FORBIDDEN'; end if;
  update public.crm_sends set status = 'pendente', attempts = 0, last_error = null, scheduled_for = now() where id = _id and status = 'falhou';
  if not found then raise exception 'INVALID_STATUS'; end if;
end $$;
revoke all on function public.crm_send_retry(uuid) from public, anon;
grant execute on function public.crm_send_retry(uuid) to authenticated;

-- Resumo do dia para a tela do CRM.
create or replace function public.crm_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); cfg public.crm_marketing_settings; today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  cfg := public._crm_cfg(v_org);
  return jsonb_build_object(
    'daily_cap', cfg.daily_cap,
    'sent_today', (select count(*) from public.crm_sends s where s.organization_id = v_org and s.status = 'enviado'
                    and (s.sent_at at time zone 'America/Sao_Paulo')::date = today and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id))),
    'pending', (select count(*) from public.crm_sends s where s.organization_id = v_org and s.status in ('pendente','enviando')
                 and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id))),
    'failed', (select count(*) from public.crm_sends s where s.organization_id = v_org and s.status = 'falhou' and s.created_at > now() - interval '14 days'
                and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id))),
    'sent_7d', (select count(*) from public.crm_sends s where s.organization_id = v_org and s.status = 'enviado' and s.sent_at > now() - interval '7 days'
                 and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id))),
    'by_kind_7d', coalesce((select jsonb_object_agg(k, n) from (select s.kind k, count(*) n from public.crm_sends s
                 where s.organization_id = v_org and s.status = 'enviado' and s.sent_at > now() - interval '7 days'
                   and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id)) group by s.kind) z), '{}'::jsonb),
    'reserved_after_7d', (select count(distinct r.id) from public.crm_sends s join public.reservations r on r.customer_id = s.customer_id
                           and r.created_at > s.sent_at and r.created_at < s.sent_at + interval '7 days' and r.status <> 'cancelada'
                          where s.organization_id = v_org and s.status = 'enviado' and s.sent_at > now() - interval '30 days'
                            and (s.unit_id is null or public.can_access_unit(auth.uid(), s.unit_id))));
end $$;
revoke all on function public.crm_overview() from public, anon;
grant execute on function public.crm_overview() to authenticated;

-- 10) Confirmação/cancelamento: o n8n passa a receber `text` quando o gestor personalizou o modelo ---------------
create or replace function public.dispatch_reservation_confirmations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_secret text; r record; resp record; v_req bigint; v_payload jsonb; v_body jsonb; v_res record; n int := 0; v_want text;
  v_reason text; v_prev text; v_text text;
begin
  select value into v_url from public.app_private_config where key = 'n8n_confirmacao_url';
  select value into v_secret from public.app_private_config where key = 'n8n_confirmacao_segredo';
  if v_url is null or v_secret is null then return 0; end if;

  -- 1) colher respostas do n8n
  for r in select * from public.message_outbox
           where dedupe_key like 'whatsapp:reserva_%' and status = 'processando' and external_id like 'net:%' loop
    select * into resp from net._http_response where id = substring(r.external_id from 5)::bigint;
    if not found then
      if r.updated_at < now() - interval '3 minutes' then
        update public.message_outbox
           set status = case when attempts >= 5 then 'falhou'::queue_status else 'pendente'::queue_status end,
               error = 'sem resposta do n8n', external_id = null, scheduled_for = now() + (attempts * interval '1 minute')
         where id = r.id;
      end if;
      continue;
    end if;
    begin v_body := resp.content::jsonb; exception when others then v_body := null; end;
    if resp.status_code = 200 and v_body->>'ok' = 'true' and v_body->>'resultado' = 'enviado' then
      update public.message_outbox set status = 'enviado', sent_at = now(), external_id = v_body->>'mensagem_id', error = null where id = r.id;
    elsif resp.status_code = 200 and v_body->>'ok' = 'true' then
      update public.message_outbox set status = 'cancelado', external_id = null, error = 'ignorado: ' || coalesce(v_body->>'motivo', '?') where id = r.id;
    elsif resp.status_code = 200 and v_body->>'resultado' = 'erro' and v_body->>'motivo' in ('sem_conversa', 'data_invalida') then
      update public.message_outbox set status = 'falhou', external_id = null, error = v_body->>'motivo' where id = r.id;
    else
      update public.message_outbox
         set status = case when attempts >= 5 then 'falhou'::queue_status else 'pendente'::queue_status end,
             error = left(coalesce(v_body->>'erro', v_body->>'motivo', resp.error_msg, resp.content, 'erro'), 300),
             external_id = null, scheduled_for = now() + (attempts * interval '2 minutes')
       where id = r.id;
    end if;
  end loop;

  -- 2) disparar pendentes (confirmacao e cancelamento)
  for r in select * from public.message_outbox
           where dedupe_key like 'whatsapp:reserva_%' and status = 'pendente' and scheduled_for <= now() and attempts < 5
           order by created_at limit 20 for update skip locked loop
    v_want := case when r.dedupe_key like 'whatsapp:reserva_cancelada:%' then 'cancelada' else 'confirmada' end;
    select res.id, res.status::text as status, res.protocol, res.reservation_date, res.reservation_time, res.party_size, res.celebrant_name,
           u.name as unit_name, cu.phone_e164, cu.full_name,
           (select c.external_id from public.crm_conversations c where c.reservation_id = res.id order by c.updated_at desc limit 1) as conv
      into v_res
      from public.reservations res
      join public.units u on u.id = res.unit_id
      join public.customers cu on cu.id = res.customer_id
     where res.id = r.reservation_id;
    if not found or v_res.status <> v_want or v_res.reservation_date < (now() at time zone 'America/Sao_Paulo')::date
       or r.created_at < now() - interval '1 day' then
      update public.message_outbox set status = 'cancelado', error = 'expirado ou reserva nao esta mais no status esperado' where id = r.id;
      continue;
    end if;
    v_reason := null; v_prev := null;
    if v_want = 'cancelada' then
      select h.note, h.from_status::text into v_reason, v_prev from public.reservation_status_history h
       where h.reservation_id = v_res.id and h.to_status = 'cancelada' order by h.created_at desc limit 1;
    end if;
    -- modelo personalizado (se houver); qualquer falha aqui NUNCA impede o aviso ao cliente
    begin
      v_text := public._crm_transactional_text(case when v_want = 'cancelada' then 'cancelamento' else 'confirmacao' end, v_res.id, v_reason);
    exception when others then v_text := null; end;
    v_payload := jsonb_build_object('protocol', v_res.protocol, 'status', v_res.status, 'unit_name', v_res.unit_name,
      'date', v_res.reservation_date, 'time', v_res.reservation_time, 'party_size', v_res.party_size,
      'phone', v_res.phone_e164, 'customer_name', v_res.full_name, 'celebrant_name', v_res.celebrant_name,
      'conversation_external_id', v_res.conv, 'reason', v_reason, 'previous_status', v_prev, 'text', v_text);
    select net.http_post(url := v_url, body := v_payload,
             headers := jsonb_build_object('Content-Type', 'application/json', 'x-candeeiro-segredo', v_secret),
             timeout_milliseconds := 30000) into v_req;
    update public.message_outbox set status = 'processando', attempts = attempts + 1, external_id = 'net:' || v_req, error = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
