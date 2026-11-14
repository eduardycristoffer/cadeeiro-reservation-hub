-- 013 — Por cima da 012 (Etapa 4A: cidades + botão de WhatsApp + leads): ticket médio do quilo, ligação do lead com o
-- cliente e a campanha, pixels da Meta e aviso de cancelamento com motivo.
-- Aditiva. A 012 já está em produção: aqui NÃO se recria whatsapp_leads, city_whatsapp_settings nem capture_whatsapp_lead.
-- Convenções (AGENTS.md): RLS em tudo, escrita de painel só por RPC security definer, grants explícitos,
-- anon só executa as RPCs públicas listadas abaixo. Não altera sdr_*, crm_*, message_outbox (estrutura) nem a API do SDR.

-- 1) Configuração do site (só o ticket médio por pessoa do almoço por quilo) ---------------------------------------
-- O preço do quilo é por kg, então o CAC/projeção não consegue estimar pela tabela de preços.
-- O número de WhatsApp de cada cidade continua em city_whatsapp_settings (012), editado em Integrações.
create table if not exists public.site_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
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

create or replace function public.site_settings_save(_quilo_avg_ticket numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if not public._is_manager(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  if _quilo_avg_ticket is not null and (_quilo_avg_ticket < 0 or _quilo_avg_ticket > 1000) then raise exception 'INVALID_TICKET'; end if;
  v_org := coalesce((select organization_id from public.user_profiles where id = auth.uid()), public._default_org());
  insert into public.site_settings (organization_id, quilo_avg_ticket, updated_by)
  values (v_org, _quilo_avg_ticket, auth.uid())
  on conflict (organization_id) do update set quilo_avg_ticket = excluded.quilo_avg_ticket, updated_by = auth.uid(), updated_at = now();
  perform public.write_audit('painel', 'config.alterada', 'config', null, null, null,
    jsonb_build_object('ticket_quilo', _quilo_avg_ticket), 'Ticket médio do almoço por quilo');
end $$;
revoke all on function public.site_settings_save(numeric) from public, anon;
grant execute on function public.site_settings_save(numeric) to authenticated;

-- 2) Leads do botão de WhatsApp: ligação com cliente, campanha e reserva ------------------------------------------
-- A 012 guarda só o contato e as utms. Para CRM (reaver), CAC e funil precisamos do cliente, da campanha e da reserva.
alter table public.whatsapp_leads
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists campaign text check (campaign is null or campaign ~ '^[a-z0-9_-]{1,60}$'),
  add column if not exists reservation_id uuid references public.reservations(id) on delete set null,
  add column if not exists status_note text,
  add column if not exists handled_by uuid;
create index if not exists whatsapp_leads_customer_idx on public.whatsapp_leads(customer_id) where customer_id is not null;
create index if not exists whatsapp_leads_campaign_idx on public.whatsapp_leads(campaign) where campaign is not null;
create index if not exists whatsapp_leads_phone_idx on public.whatsapp_leads(phone_e164, created_at desc);

-- Antes de gravar o lead: normaliza a campanha (utm_campaign) e acha/cria o cliente (com o aceite do formulário).
-- Nunca impede a captura: se algo falhar aqui, o lead entra sem cliente/campanha.
create or replace function public.trg_whatsapp_lead_enrich() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_camp text := nullif(lower(btrim(coalesce(new.utm_campaign, ''))), '');
begin
  if v_camp is not null and v_camp !~ '^[a-z0-9_-]{1,60}$' then v_camp := null; end if;
  new.campaign := coalesce(new.campaign, v_camp);
  if new.customer_id is null then
    begin
      insert into public.customers (organization_id, full_name, phone_e164, whatsapp_opt_in)
      values (new.organization_id, new.full_name, new.phone_e164, coalesce(new.privacy_accepted, false))
      on conflict (organization_id, phone_e164) do update set updated_at = now()
      returning id into new.customer_id;
    exception when others then null;
    end;
  end if;
  return new;
end $$;
revoke all on function public.trg_whatsapp_lead_enrich() from public, anon, authenticated;
drop trigger if exists whatsapp_leads_enrich on public.whatsapp_leads;
create trigger whatsapp_leads_enrich before insert on public.whatsapp_leads
  for each row execute function public.trg_whatsapp_lead_enrich();

-- Quando o lead do WhatsApp vira reserva (mesmo cliente, até 30 dias), marca como "convertido" — base do funil e do CAC.
create or replace function public.link_whatsapp_lead_on_reservation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.whatsapp_leads l
     set status = 'convertido', reservation_id = new.id, updated_at = now()
   where l.customer_id = new.customer_id and l.status in ('novo','chamado')
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
