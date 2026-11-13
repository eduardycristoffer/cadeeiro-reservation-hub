-- 012 — Home por cidade, WhatsApp flutuante com captura de lead, pixels e aviso de cancelamento com motivo.
-- Aditiva. Não altera sdr_*, crm_*, message_outbox (estrutura) nem o contrato da API do SDR.
-- Convenções (AGENTS.md): RLS em tudo, escrita de painel só por RPC security definer, grants explícitos,
-- anon só executa as RPCs públicas listadas abaixo.

-- 1) Configuração do site (números de WhatsApp por cidade) -----------------------------------------
create table if not exists public.site_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  whatsapp_goiania text check (whatsapp_goiania is null or whatsapp_goiania ~ '^55[0-9]{10,11}$'),
  whatsapp_anapolis text check (whatsapp_anapolis is null or whatsapp_anapolis ~ '^55[0-9]{10,11}$'),
  wa_message text not null default 'Olá! Meu nome é {{nome}}. Quero fazer uma reserva no Candeeiro {{unidade}}.',
  -- ticket médio por pessoa do almoço por quilo (o preço é por kg, então não dá para estimar pela tabela de preços)
  quilo_avg_ticket numeric(8,2) check (quilo_avg_ticket is null or (quilo_avg_ticket >= 0 and quilo_avg_ticket <= 1000)),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to authenticated;
grant all on public.site_settings to service_role;
alter table public.site_settings enable row level security;
drop policy if exists "gestor lê configuração do site" on public.site_settings;
create policy "gestor lê configuração do site" on public.site_settings for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));

create or replace function public.site_settings_save(_whatsapp_goiania text, _whatsapp_anapolis text, _wa_message text default null, _quilo_avg_ticket numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_go text; v_an text;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  v_org := coalesce((select organization_id from public.user_profiles where id = auth.uid()), public._default_org());
  v_go := nullif(btrim(coalesce(_whatsapp_goiania,'')), '');
  v_an := nullif(btrim(coalesce(_whatsapp_anapolis,'')), '');
  if v_go is not null then v_go := public.normalize_br_phone(v_go); if v_go is null then raise exception 'INVALID_PHONE'; end if; end if;
  if v_an is not null then v_an := public.normalize_br_phone(v_an); if v_an is null then raise exception 'INVALID_PHONE'; end if; end if;
  if _wa_message is not null and (length(btrim(_wa_message)) < 10 or length(_wa_message) > 300) then raise exception 'INVALID_MESSAGE'; end if;
  if _quilo_avg_ticket is not null and (_quilo_avg_ticket < 0 or _quilo_avg_ticket > 1000) then raise exception 'INVALID_TICKET'; end if;
  insert into public.site_settings (organization_id, whatsapp_goiania, whatsapp_anapolis, wa_message, quilo_avg_ticket, updated_by)
  values (v_org, v_go, v_an, coalesce(nullif(btrim(_wa_message),''), 'Olá! Meu nome é {{nome}}. Quero fazer uma reserva no Candeeiro {{unidade}}.'), _quilo_avg_ticket, auth.uid())
  on conflict (organization_id) do update
    set whatsapp_goiania = excluded.whatsapp_goiania, whatsapp_anapolis = excluded.whatsapp_anapolis,
        wa_message = case when _wa_message is null then public.site_settings.wa_message else excluded.wa_message end,
        quilo_avg_ticket = excluded.quilo_avg_ticket,
        updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('painel', 'config.alterada', 'config', null, null, null,
    jsonb_build_object('whatsapp_goiania', v_go, 'whatsapp_anapolis', v_an, 'ticket_quilo', _quilo_avg_ticket), 'Configurações do site');
end $$;
revoke all on function public.site_settings_save(text,text,text,numeric) from public, anon;
grant execute on function public.site_settings_save(text,text,text,numeric) to authenticated;

-- Público: só diz se o WhatsApp de cada cidade está configurado (o número só sai depois da captura do lead).
create or replace function public.public_site_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('whatsapp_ready', jsonb_build_object(
    'goiania',  coalesce((select s.whatsapp_goiania  is not null from public.site_settings s order by s.updated_at desc limit 1), false),
    'anapolis', coalesce((select s.whatsapp_anapolis is not null from public.site_settings s order by s.updated_at desc limit 1), false)))
$$;
revoke all on function public.public_site_config() from public;
grant execute on function public.public_site_config() to anon, authenticated;

-- 2) Leads do botão flutuante de WhatsApp -------------------------------------------------------------
create table if not exists public.whatsapp_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  unit_id uuid references public.units(id) on delete set null,
  city text not null check (city in ('goiania','anapolis')),
  full_name text not null,
  phone_e164 text not null,
  campaign text,
  source text not null default 'fab' check (source in ('fab','home','campanha','outro')),
  utm jsonb,
  page text,
  clicks integer not null default 1,
  status text not null default 'novo' check (status in ('novo','em_atendimento','reservou','perdido')),
  status_note text,
  handled_by uuid,
  reservation_id uuid references public.reservations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_leads_unit_status_idx on public.whatsapp_leads(unit_id, status, created_at desc);
create index if not exists whatsapp_leads_phone_idx on public.whatsapp_leads(phone_e164, created_at desc);
create index if not exists whatsapp_leads_created_idx on public.whatsapp_leads(created_at desc);
create index if not exists whatsapp_leads_campaign_idx on public.whatsapp_leads(campaign) where campaign is not null;
revoke all on public.whatsapp_leads from anon, authenticated;
grant select on public.whatsapp_leads to authenticated;
grant all on public.whatsapp_leads to service_role;
alter table public.whatsapp_leads enable row level security;
drop policy if exists "staff lê leads do whatsapp da unidade" on public.whatsapp_leads;
create policy "staff lê leads do whatsapp da unidade" on public.whatsapp_leads for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or (unit_id is not null and public.can_access_unit(auth.uid(), unit_id)));
drop trigger if exists whatsapp_leads_updated_at on public.whatsapp_leads;
create trigger whatsapp_leads_updated_at before update on public.whatsapp_leads for each row execute function public.set_updated_at();

create or replace function public.capture_whatsapp_lead(
  _full_name text, _phone text, _city text, _campaign text default null, _source text default 'fab',
  _utm jsonb default null, _page text default null, _privacy_accepted boolean default false, _website text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := public._default_org();
  v_name text := btrim(regexp_replace(coalesce(_full_name,''), '\s+', ' ', 'g'));
  v_phone text := public.normalize_br_phone(_phone);
  v_city text := lower(btrim(coalesce(_city,'')));
  v_campaign text := nullif(lower(btrim(coalesce(_campaign,''))), '');
  v_source text := case when _source in ('fab','home','campanha') then _source else 'outro' end;
  v_ip text := coalesce(nullif(split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for',''), ',', 1), ''), 'na');
  v_unit record; v_wa text; v_msg text; v_customer uuid; v_lead uuid; v_utm jsonb; v_page text;
begin
  if coalesce(_website,'') <> '' then raise exception 'SPAM_DETECTED'; end if;
  if not coalesce(_privacy_accepted,false) then raise exception 'PRIVACY_REQUIRED'; end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'INVALID_NAME'; end if;
  if v_phone is null then raise exception 'INVALID_PHONE'; end if;
  if v_city not in ('goiania','anapolis') then raise exception 'INVALID_CITY'; end if;
  if v_campaign is not null and v_campaign !~ '^[a-z0-9_-]{1,60}$' then v_campaign := null; end if;
  if not public.hit_rate_limit('waip:' || v_ip, 30) or not public.hit_rate_limit('waphone:' || v_phone, 10) then
    raise exception 'RATE_LIMITED';
  end if;
  -- utm: só objeto pequeno de strings curtas
  if _utm is not null and jsonb_typeof(_utm) = 'object' and length(_utm::text) <= 800 then v_utm := _utm; end if;
  v_page := left(nullif(btrim(coalesce(_page,'')), ''), 200);

  select u.id, u.name into v_unit from public.units u
   where u.organization_id = v_org and u.slug = v_city and u.is_active limit 1;
  select case v_city when 'goiania' then s.whatsapp_goiania else s.whatsapp_anapolis end, s.wa_message
    into v_wa, v_msg from public.site_settings s where s.organization_id = v_org;
  v_msg := replace(replace(coalesce(v_msg, 'Olá! Meu nome é {{nome}}. Quero fazer uma reserva no Candeeiro {{unidade}}.'),
             '{{nome}}', v_name), '{{unidade}}',
             coalesce(nullif(btrim(regexp_replace(coalesce(v_unit.name,''), '^\s*(rede\s+)?cand[ae]+iro\s+', '', 'i')), ''), initcap(v_city)));

  insert into public.customers (organization_id, full_name, phone_e164, whatsapp_opt_in)
  values (v_org, v_name, v_phone, true)
  on conflict (organization_id, phone_e164) do update set updated_at = now()
  returning id into v_customer;

  -- mesmo telefone+cidade nas últimas 6h e ainda "novo": soma o clique em vez de duplicar
  select l.id into v_lead from public.whatsapp_leads l
   where l.phone_e164 = v_phone and l.city = v_city and l.status = 'novo' and l.created_at > now() - interval '6 hours'
   order by l.created_at desc limit 1;
  if v_lead is not null then
    update public.whatsapp_leads set clicks = clicks + 1, full_name = v_name, updated_at = now() where id = v_lead;
  else
    insert into public.whatsapp_leads (organization_id, customer_id, unit_id, city, full_name, phone_e164, campaign, source, utm, page)
    values (v_org, v_customer, v_unit.id, v_city, v_name, v_phone, v_campaign, v_source, v_utm, v_page)
    returning id into v_lead;
  end if;

  return jsonb_build_object('lead_id', v_lead, 'whatsapp', v_wa, 'message', v_msg, 'unit_name', v_unit.name);
end $$;
revoke all on function public.capture_whatsapp_lead(text,text,text,text,text,jsonb,text,boolean,text) from public;
grant execute on function public.capture_whatsapp_lead(text,text,text,text,text,jsonb,text,boolean,text) to anon, authenticated;

create or replace function public.whatsapp_lead_set_status(_id uuid, _status text, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if _status not in ('novo','em_atendimento','reservou','perdido') then raise exception 'INVALID_STATUS'; end if;
  select * into l from public.whatsapp_leads where id = _id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (public.has_role(auth.uid(), 'super_admin') or (l.unit_id is not null and public.can_access_unit(auth.uid(), l.unit_id))) then
    raise exception 'FORBIDDEN';
  end if;
  update public.whatsapp_leads set status = _status, status_note = nullif(btrim(coalesce(_note,'')), ''), handled_by = auth.uid() where id = _id;
  perform public.write_audit('painel', 'lead_whatsapp.status', 'whatsapp_lead', _id, l.unit_id,
    jsonb_build_object('status', l.status), jsonb_build_object('status', _status), nullif(btrim(coalesce(_note,'')), ''));
end $$;
revoke all on function public.whatsapp_lead_set_status(uuid,text,text) from public, anon;
grant execute on function public.whatsapp_lead_set_status(uuid,text,text) to authenticated;

-- Quando o lead do WhatsApp vira reserva (mesmo telefone), marca como "reservou" — base do funil e do CAC.
create or replace function public.link_whatsapp_lead_on_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.whatsapp_leads l
     set status = 'reservou', reservation_id = new.id
   where l.customer_id = new.customer_id and l.status in ('novo','em_atendimento')
     and l.created_at > now() - interval '30 days' and l.reservation_id is null;
  return null;
exception when others then return null; -- nunca impede a reserva
end $$;
revoke all on function public.link_whatsapp_lead_on_reservation() from public, anon, authenticated;
drop trigger if exists reservations_link_whatsapp_lead on public.reservations;
create trigger reservations_link_whatsapp_lead after insert on public.reservations
  for each row execute function public.link_whatsapp_lead_on_reservation();

-- 3) Pixels da Meta (vários, por escopo) ------------------------------------------------------------------
create table if not exists public.meta_pixels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  pixel_id text not null check (pixel_id ~ '^[0-9]{6,20}$'),
  scope text not null default 'global' check (scope in ('global','goiania','anapolis','campanha')),
  campaign_slug text check (campaign_slug is null or campaign_slug ~ '^[a-z0-9_-]{1,60}$'),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'campanha') = (campaign_slug is not null))
);
create unique index if not exists meta_pixels_unique_idx on public.meta_pixels(organization_id, pixel_id, scope, coalesce(campaign_slug, ''));
revoke all on public.meta_pixels from anon, authenticated;
grant select on public.meta_pixels to authenticated;
grant all on public.meta_pixels to service_role;
alter table public.meta_pixels enable row level security;
drop policy if exists "gestor lê pixels" on public.meta_pixels;
create policy "gestor lê pixels" on public.meta_pixels for select to authenticated
  using (public.has_role(auth.uid(), 'super_admin') or public.has_role(auth.uid(), 'gestor'));
drop trigger if exists meta_pixels_updated_at on public.meta_pixels;
create trigger meta_pixels_updated_at before update on public.meta_pixels for each row execute function public.set_updated_at();

create or replace function public.pixel_save(_id uuid, _name text, _pixel_id text, _scope text, _campaign_slug text default null,
  _is_active boolean default true, _notes text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_id uuid; v_slug text := nullif(lower(btrim(coalesce(_campaign_slug,''))), '');
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  v_org := coalesce((select organization_id from public.user_profiles where id = auth.uid()), public._default_org());
  if _scope <> 'campanha' then v_slug := null; end if;
  if _scope = 'campanha' and v_slug is null then raise exception 'CAMPAIGN_REQUIRED'; end if;
  if _id is null then
    insert into public.meta_pixels (organization_id, name, pixel_id, scope, campaign_slug, is_active, notes)
    values (v_org, btrim(_name), btrim(_pixel_id), _scope, v_slug, coalesce(_is_active, true), nullif(btrim(coalesce(_notes,'')), ''))
    returning id into v_id;
  else
    update public.meta_pixels set name = btrim(_name), pixel_id = btrim(_pixel_id), scope = _scope, campaign_slug = v_slug,
           is_active = coalesce(_is_active, true), notes = nullif(btrim(coalesce(_notes,'')), '')
     where id = _id and organization_id = v_org returning id into v_id;
    if v_id is null then raise exception 'NOT_FOUND'; end if;
  end if;
  perform public.write_audit('painel', 'pixel.salvo', 'meta_pixel', v_id, null, null,
    jsonb_build_object('nome', _name, 'pixel', _pixel_id, 'escopo', _scope, 'campanha', v_slug, 'ativo', coalesce(_is_active, true)), null);
  return v_id;
exception when unique_violation then raise exception 'DUPLICATE_PIXEL';
end $$;
revoke all on function public.pixel_save(uuid,text,text,text,text,boolean,text) from public, anon;
grant execute on function public.pixel_save(uuid,text,text,text,text,boolean,text) to authenticated;

create or replace function public.pixel_delete(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  delete from public.meta_pixels where id = _id returning * into p;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.write_audit('painel', 'pixel.removido', 'meta_pixel', _id, null,
    jsonb_build_object('nome', p.name, 'pixel', p.pixel_id, 'escopo', p.scope), null, null);
end $$;
revoke all on function public.pixel_delete(uuid) from public, anon;
grant execute on function public.pixel_delete(uuid) to authenticated;

-- Público: lista de IDs de pixel que a página deve carregar (global + cidade + campanha).
create or replace function public.public_pixels(_city text default null, _campaign text default null)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct p.pixel_id order by p.pixel_id), '{}')
    from public.meta_pixels p
   where p.is_active
     and (p.scope = 'global'
          or (p.scope in ('goiania','anapolis') and p.scope = lower(coalesce(_city,'')))
          or (p.scope = 'campanha' and p.campaign_slug = lower(coalesce(_campaign,''))))
$$;
revoke all on function public.public_pixels(text,text) from public;
grant execute on function public.public_pixels(text,text) to anon, authenticated;

-- 4) Cancelamento com motivo avisa o cliente (também ao RECUSAR reserva pendente no painel) --------------------
-- Antes: só cancelamento de reserva já confirmada gerava aviso. Agora: confirmada->cancelada (como antes)
-- e pendente->cancelada feito por usuário do painel (auth.uid() não nulo). Cancelamento feito pelo SDR em
-- reserva pendente continua sem aviso (o próprio atendente já conversa com o cliente).
create or replace function public.enqueue_reservation_confirmed_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

-- O gatilho já existe no banco (criado fora das migrations); recriado aqui, idêntico, para o arquivo refletir o banco.
drop trigger if exists reservations_confirmed_message on public.reservations;
create trigger reservations_confirmed_message after update of status on public.reservations
  for each row execute function public.enqueue_reservation_confirmed_message();

-- Dispatcher: igual ao anterior + 'reason' (motivo digitado no painel) e 'previous_status' no payload do n8n.
create or replace function public.dispatch_reservation_confirmations()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_secret text; r record; resp record; v_req bigint; v_payload jsonb; v_body jsonb; v_res record; n int := 0; v_want text;
  v_reason text; v_prev text;
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
    v_payload := jsonb_build_object('protocol', v_res.protocol, 'status', v_res.status, 'unit_name', v_res.unit_name,
      'date', v_res.reservation_date, 'time', v_res.reservation_time, 'party_size', v_res.party_size,
      'phone', v_res.phone_e164, 'customer_name', v_res.full_name, 'celebrant_name', v_res.celebrant_name,
      'conversation_external_id', v_res.conv, 'reason', v_reason, 'previous_status', v_prev);
    select net.http_post(url := v_url, body := v_payload,
             headers := jsonb_build_object('Content-Type', 'application/json', 'x-candeeiro-segredo', v_secret),
             timeout_milliseconds := 30000) into v_req;
    update public.message_outbox set status = 'processando', attempts = attempts + 1, external_id = 'net:' || v_req, error = null where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
