-- 018 — CRM: campanha de avaliação no Google (pedido de avaliação enviado por WhatsApp a quem já foi atendido).
--
-- O link da avaliação é definido NA CRIAÇÃO DA CAMPANHA (um link por unidade: Goiânia e Anápolis têm páginas diferentes).
-- Reaproveita a fila `crm_sends` da migration 015: o banco decide QUEM recebe e QUANDO, o n8n ("CRM — envios") entrega.
--
-- Regras desta campanha (além das travas da 015: autorização de WhatsApp, quem disse SAIR nunca recebe, janela de horário
-- e teto diário):
--   * só quem tem visita CONCLUÍDA nos últimos N dias (padrão 14, máx. 90) na unidade escolhida; a unidade é obrigatória;
--   * no máximo um pedido de avaliação a cada 90 dias por cliente;
--   * não pede avaliação a quem tem atendimento do SAC em aberto (a pessoa está esperando resposta nossa). Não há nenhum
--     filtro por nota ou sentimento: a política do Google proíbe pedir avaliação só para quem está satisfeito;
--   * o link só pode apontar para domínios do Google (g.page, search.google.com, maps.app.goo.gl, share.google, ...);
--   * no máximo 500 pessoas por campanha, uma mensagem a cada 15 segundos, e quem lança precisa ser gestor da unidade.
-- Nenhum dado é inserido pela migration (o modelo padrão fica em função).

-- 1) Tipos novos nas tabelas da 015 ------------------------------------------------------------------------
alter table public.crm_campaigns add column if not exists kind text not null default 'remarketing' check (kind in ('remarketing','avaliacao_google'));
alter table public.crm_campaigns add column if not exists review_url text check (review_url is null or (review_url ~ '^https://[^[:space:]]+$' and char_length(review_url) <= 500));

alter table public.crm_campaigns drop constraint if exists crm_campaigns_audience_check;
alter table public.crm_campaigns add constraint crm_campaigns_audience_check check (audience in ('inativos','visitaram','leads','recentes'));

alter table public.crm_campaigns drop constraint if exists crm_campaigns_review_ck;
alter table public.crm_campaigns add constraint crm_campaigns_review_ck check (kind <> 'avaliacao_google' or (review_url is not null and unit_id is not null and audience = 'recentes'));

alter table public.crm_sends drop constraint if exists crm_sends_kind_check;
alter table public.crm_sends add constraint crm_sends_kind_check check (kind in ('followup_pos','reaver_inativo','reaver_lead','remarketing','avaliacao_google'));

alter table public.crm_templates drop constraint if exists crm_templates_key_check;
alter table public.crm_templates add constraint crm_templates_key_check check (key in ('confirmacao','cancelamento','followup_pos','reaver_inativo','reaver_lead','remarketing','avaliacao_google'));

-- 2) Utilitários -----------------------------------------------------------------------------------------------
-- Link de avaliação: só https e só domínios do Google (evita mandar cliente para site de terceiros por engano).
create or replace function public._crm_review_url_ok(_url text)
returns boolean language sql immutable as $$
  select coalesce(char_length(_url) <= 500
    and _url ~* '^https://(g\.page|search\.google\.com|maps\.app\.goo\.gl|goo\.gl|share\.google|g\.co|(www\.|maps\.|business\.)?google\.com(\.br)?)(/[^[:space:]{}]*)?$', false)
$$;
revoke all on function public._crm_review_url_ok(text) from public, anon, authenticated;

create or replace function public._crm_default_template(_key text)
returns text language sql immutable as $$
  select case _key
    when 'confirmacao' then E'Olá, {{nome}}! 🎉 Sua reserva no {{unidade}} está confirmada.\n📅 {{dia}} às {{hora}}\n👥 {{pessoas}} pessoas\n🔖 Protocolo: {{protocolo}}\nTe esperamos!'
    when 'cancelamento' then E'Olá, {{nome}}. Infelizmente sua reserva no {{unidade}} para {{dia}} às {{hora}} não pôde ser mantida.\nMotivo: {{motivo}}\nSe quiser, podemos reagendar — é só responder esta mensagem. 💛'
    when 'followup_pos' then E'Oi, {{nome}}! Foi um prazer receber você no {{unidade}}. 😊\nComo foi sua experiência? Sua opinião nos ajuda a melhorar.\nQuando quiser voltar, é só reservar: {{link}}'
    when 'reaver_inativo' then E'Oi, {{nome}}, quanto tempo! 😊 Sentimos sua falta no {{unidade}}.\nQue tal reservar uma mesa? {{link}}'
    when 'reaver_lead' then E'Oi, {{nome}}! Vimos que você chamou o {{unidade}} mas não chegou a reservar. Posso ajudar a garantir sua mesa? 😊\nReserve em segundos: {{link}}'
    when 'remarketing' then E'Oi, {{nome}}! Tem novidade no {{unidade}} 🎉\n{{link}}'
    when 'avaliacao_google' then E'Oi, {{nome}}! 😊 Foi um prazer receber você no {{unidade}}.\nSe puder, conta pra gente como foi sua experiência avaliando no Google? Leva menos de 1 minuto e ajuda muito:\n{{link_avaliacao}}\nMuito obrigado! 💛'
  end
$$;
revoke all on function public._crm_default_template(text) from public, anon, authenticated;

-- A função ganha o parâmetro `_review_url` (variável {{link_avaliacao}}); a assinatura antiga sai para não haver chamada ambígua.
drop function if exists public._crm_vars(uuid, text, uuid, text, text);
create or replace function public._crm_vars(_unit uuid, _first text, _res uuid default null, _reason text default null, _campaign text default null, _review_url text default null)
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
  if _review_url is not null then v := v || jsonb_build_object('link_avaliacao', _review_url); end if;
  if _res is not null then
    select rs.reservation_date d, rs.reservation_time t, rs.party_size p, rs.protocol pr into r from public.reservations rs where rs.id = _res;
    if found then
      v := v || jsonb_build_object('data', to_char(r.d, 'DD/MM'), 'dia', wd[extract(dow from r.d)::int + 1] || ', ' || to_char(r.d, 'DD/MM'),
             'hora', to_char(r.t, 'HH24:MI'), 'pessoas', r.p::text, 'protocolo', r.pr);
    end if;
  end if;
  return v;
end $$;
revoke all on function public._crm_vars(uuid,text,uuid,text,text,text) from public, anon, authenticated;

-- 3) Públicos: entra `recentes` (visita concluída nos últimos _days dias) ------------------------------------------
--   recentes : última visita concluída há no máximo _days dias (padrão 14, máx. 90); é a lista de quem pede avaliação.
--              Não exclui quem tem reserva futura (cliente fiel é bem-vindo), mas exclui quem recebeu pedido de avaliação
--              nos últimos 90 dias e quem tem atendimento do SAC em aberto.
-- As demais regras da 015 continuam valendo; o pedido de avaliação também conta para o intervalo entre mensagens de marketing.
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
     where _audience in ('inativos','visitaram','recentes') and c.organization_id = _org
       and (_audience = 'visitaram'
            or (_audience = 'inativos' and v.last_visit < current_date - greatest(coalesce(_days, 60), 1))
            or (_audience = 'recentes' and v.last_visit >= current_date - least(greatest(coalesce(_days, 14), 1), 90)))
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
     and (_audience = 'recentes'
          or not exists (select 1 from public.reservations r where r.customer_id = x.customer_id and r.status in ('pendente','confirmada') and r.reservation_date >= current_date))
     and not exists (select 1 from public.crm_sends s where s.customer_id = x.customer_id and s.kind in ('reaver_inativo','reaver_lead','remarketing','avaliacao_google')
                      and s.status in ('pendente','enviando','enviado') and s.created_at > now() - make_interval(days => cfg.marketing_gap_days))
     and (_audience <> 'recentes' or (
           not exists (select 1 from public.crm_sends s where s.customer_id = x.customer_id and s.kind = 'avaliacao_google'
                        and s.status in ('pendente','enviando','enviado') and s.created_at > now() - interval '90 days')
           and not exists (select 1 from public.sac_tickets t where t.customer_id = x.customer_id and t.status in ('aberto','em_andamento','aguardando_cliente'))))
$$;
revoke all on function public._crm_audience(uuid,text,uuid,integer,uuid) from public, anon, authenticated;

-- 4) Painel: modelos (entra `avaliacao_google`) ---------------------------------------------------------------------
create or replace function public.crm_templates_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org();
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  return (select jsonb_agg(jsonb_build_object('key', k.key, 'body', coalesce(t.body, public._crm_default_template(k.key)),
            'default_body', public._crm_default_template(k.key), 'is_custom', t.body is not null) order by k.ord)
            from (values (1,'confirmacao'),(2,'cancelamento'),(3,'followup_pos'),(4,'reaver_inativo'),(5,'reaver_lead'),(6,'remarketing'),(7,'avaliacao_google')) k(ord, key)
            left join public.crm_templates t on t.organization_id = v_org and t.key = k.key);
end $$;
revoke all on function public.crm_templates_list() from public, anon;
grant execute on function public.crm_templates_list() to authenticated;

create or replace function public.crm_template_save(_key text, _body text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_body text := btrim(coalesce(_body, ''));
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _key not in ('confirmacao','cancelamento','followup_pos','reaver_inativo','reaver_lead','remarketing','avaliacao_google') then raise exception 'INVALID_TEMPLATE'; end if;
  if char_length(v_body) < 10 or char_length(v_body) > 800 then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if v_body ~ '\{\{[^}]*[^a-z_}][^}]*\}\}' then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if _key = 'avaliacao_google' and v_body !~ '\{\{link_avaliacao\}\}' then raise exception 'MISSING_REVIEW_LINK'; end if;
  insert into public.crm_templates as t (organization_id, key, body, updated_by) values (v_org, _key, v_body, auth.uid())
  on conflict (organization_id, key) do update set body = excluded.body, updated_by = excluded.updated_by;
  perform public.write_audit('painel', 'crm.modelo_salvo', 'crm_template', null, null, null, jsonb_build_object('modelo', _key), null);
end $$;
revoke all on function public.crm_template_save(text,text) from public, anon;
grant execute on function public.crm_template_save(text,text) to authenticated;

-- 5) Painel: campanha de avaliação ------------------------------------------------------------------------------------
create or replace function public.crm_audience_preview(_audience text, _unit uuid default null, _days integer default 60)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_org uuid := public._ad_scope_org(); v_total integer; v_sample jsonb;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _audience not in ('inativos','visitaram','leads','recentes') then raise exception 'INVALID_AUDIENCE'; end if;
  if _unit is not null and not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  select count(*) into v_total from public._crm_audience(v_org, _audience, _unit, _days, auth.uid());
  select coalesce(jsonb_agg(jsonb_build_object('nome', a.first_name, 'final', right(a.phone, 4))), '[]'::jsonb) into v_sample
    from (select * from public._crm_audience(v_org, _audience, _unit, _days, auth.uid()) limit 5) a;
  return jsonb_build_object('total', v_total, 'sample', v_sample, 'max', 500);
end $$;
revoke all on function public.crm_audience_preview(text,uuid,integer) from public, anon;
grant execute on function public.crm_audience_preview(text,uuid,integer) to authenticated;

-- Cria a campanha e enfileira o pedido de avaliação para todos do público (no máximo 500), um a cada 15 segundos.
create or replace function public.crm_review_campaign_launch(_name text, _unit uuid, _review_url text, _body text, _days integer default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._ad_scope_org(); v_name text := btrim(coalesce(_name, '')); v_body text := btrim(coalesce(_body, ''));
  v_url text := btrim(coalesce(_review_url, '')); v_days integer := coalesce(_days, 14);
  v_slug text; v_id uuid; v_n integer;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _unit is null then raise exception 'UNIT_REQUIRED'; end if;
  if not exists (select 1 from public.units where id = _unit and organization_id = v_org) then raise exception 'NOT_FOUND'; end if;
  if not public.can_access_unit(auth.uid(), _unit) then raise exception 'FORBIDDEN'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'INVALID_NAME'; end if;
  if not public._crm_review_url_ok(v_url) then raise exception 'INVALID_REVIEW_URL'; end if;
  if v_days < 1 or v_days > 90 then raise exception 'INVALID_DAYS'; end if;
  if char_length(v_body) < 10 or char_length(v_body) > 600 then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if v_body ~ '\{\{[^}]*[^a-z_}][^}]*\}\}' then raise exception 'INVALID_TEMPLATE_BODY'; end if;
  if v_body !~ '\{\{link_avaliacao\}\}' then raise exception 'MISSING_REVIEW_LINK'; end if;
  select count(*) into v_n from public._crm_audience(v_org, 'recentes', _unit, v_days, auth.uid());
  if v_n = 0 then raise exception 'EMPTY_AUDIENCE'; end if;
  if v_n > 500 then raise exception 'TOO_MANY'; end if;

  v_slug := 'avl-' || trim(both '-' from regexp_replace(lower(translate(v_name, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
  if v_slug = 'avl-' then v_slug := 'avl-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMMDDHH24MI'); end if;
  v_slug := left(v_slug, 60);
  insert into public.crm_campaigns (organization_id, name, slug, audience, unit_id, days, body, total, created_by, kind, review_url)
  values (v_org, v_name, v_slug, 'recentes', _unit, v_days, v_body, v_n, auth.uid(), 'avaliacao_google', v_url)
  returning id into v_id;

  insert into public.crm_sends (organization_id, kind, campaign_id, customer_id, unit_id, phone_e164, first_name, text, scheduled_for, created_by)
  select v_org, 'avaliacao_google', v_id, a.customer_id, a.unit_id, a.phone, a.first_name,
         public._crm_finalize('avaliacao_google', public._crm_render(v_body, public._crm_vars(a.unit_id, a.first_name, null, null, v_slug, v_url))),
         now() + (row_number() over (order by a.last_visit desc nulls last, a.customer_id) - 1) * interval '15 seconds', auth.uid()
    from public._crm_audience(v_org, 'recentes', _unit, v_days, auth.uid()) a;
  get diagnostics v_n = row_count;
  update public.crm_campaigns set total = v_n where id = v_id;

  perform public.write_audit('painel', 'crm.avaliacao_enviada', 'crm_campaign', v_id, _unit, null,
    jsonb_build_object('nome', v_name, 'pessoas', v_n, 'dias', v_days), null);
  return jsonb_build_object('campaign_id', v_id, 'queued', v_n, 'campaign', v_slug);
end $$;
revoke all on function public.crm_review_campaign_launch(text,uuid,text,text,integer) from public, anon;
grant execute on function public.crm_review_campaign_launch(text,uuid,text,text,integer) to authenticated;

-- O cancelamento já servia a qualquer campanha; só o nome do evento na auditoria passa a respeitar o tipo.
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
  perform public.write_audit('painel', case when c.kind = 'avaliacao_google' then 'crm.avaliacao_cancelada' else 'crm.remarketing_cancelado' end,
    'crm_campaign', _id, c.unit_id, null, jsonb_build_object('cancelados', n), null);
  return n;
end $$;
revoke all on function public.crm_campaign_cancel(uuid) from public, anon;
grant execute on function public.crm_campaign_cancel(uuid) to authenticated;
